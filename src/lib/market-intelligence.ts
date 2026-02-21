import { createAdminClient, createClient } from '@/lib/supabase/server'
import { searchKeyword, lookupAsin, fetchReviews, fetchQuestions } from '@/lib/oxylabs'
import { fetchReviewsViaApify, normalizeApifyReview } from '@/lib/apify'
import {
  analyzeMarketIntelligencePhase1Reviews,
  analyzeMarketIntelligencePhase2QnA,
  analyzeMarketIntelligencePhase3Market,
  analyzeMarketIntelligencePhase4Strategy,
} from '@/lib/claude'

const CACHE_HOURS = 168 // 7 days
const ASIN_TIMEOUT_MS = 65_000
const DELAY_BETWEEN_CALLS_MS = 2_000

async function updateMI(id: string, updates: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('lb_market_intelligence')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error(`[MI ${id}] Failed to update:`, error)
}

/**
 * Background job: keyword search + ASIN lookup for all keywords, then set to awaiting_selection.
 * Called fire-and-forget from /collect route.
 */
export async function backgroundCollect(
  id: string,
  record: Record<string, unknown>,
  userId: string
) {
  try {
    const supabase = createClient()
    const admin = createAdminClient()

    const keywordsList: string[] = (record.keywords as string[])?.length > 0
      ? (record.keywords as string[])
      : [record.keyword as string]

    // Get country for domain derivation
    const { data: country } = await supabase
      .from('lb_countries')
      .select('id, name, amazon_domain')
      .eq('id', record.country_id as string)
      .single()

    if (!country) {
      await updateMI(id, { status: 'failed', error_message: 'Country not found' })
      return
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')
    let oxylabsCallsUsed = 0
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()
    const maxCompetitors = (record.max_competitors as number) || 10

    // Use Map keyed by ASIN to auto-deduplicate across keywords
    const competitorsMap = new Map<string, Record<string, unknown>>()
    const allKeywordSearchData: Record<string, unknown>[] = []
    let totalProcessed = 0

    for (let ki = 0; ki < keywordsList.length; ki++) {
      const kw = keywordsList[ki]

      // --- Phase A: Keyword search ---
      await updateMI(id, {
        progress: {
          step: 'keyword_search',
          current: ki,
          total: keywordsList.length,
          message: `Searching keyword "${kw}" (${ki + 1}/${keywordsList.length})...`,
        },
      })

      let keywordSearchData: Record<string, unknown> | null = null
      const { data: cachedSearch } = await supabase
        .from('lb_keyword_searches')
        .select('*')
        .eq('keyword', kw)
        .eq('country_id', record.country_id as string)
        .gte('updated_at', cacheThreshold)
        .single()

      if (cachedSearch) {
        keywordSearchData = {
          keyword: kw,
          organic_results: cachedSearch.organic_results,
          sponsored_results: cachedSearch.sponsored_results,
          amazons_choices: cachedSearch.amazons_choices,
          total_results_count: cachedSearch.total_results_count,
          source: 'cache',
        }
      } else {
        const searchResult = await Promise.race([
          searchKeyword(kw, oxylabsDomain, 1),
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => {
              console.error(`[MI ${id}] Keyword search "${kw}" timed out after 65s`)
              resolve({ success: false, error: 'Keyword search timed out after 65s' })
            }, ASIN_TIMEOUT_MS)
          ),
        ])
        oxylabsCallsUsed++

        if (!searchResult.success || !('data' in searchResult) || !searchResult.data) {
          console.error(`[MI ${id}] Keyword search failed for "${kw}": ${searchResult.error}`)
          continue
        }

        const organicResults = searchResult.data.results?.organic || []
        const sponsoredResults = searchResult.data.results?.paid || []
        const amazonsChoices = searchResult.data.results?.amazons_choices || []

        // Upsert to cache
        await admin.from('lb_keyword_searches').upsert({
          keyword: kw,
          country_id: record.country_id as string,
          marketplace_domain: country.amazon_domain,
          total_results_count: searchResult.data.total_results_count || 0,
          pages_fetched: 1,
          organic_results: organicResults,
          sponsored_results: sponsoredResults,
          amazons_choices: amazonsChoices,
          suggested_results: searchResult.data.results?.suggested || [],
          raw_response: searchResult.data,
          searched_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'keyword,country_id' })

        keywordSearchData = {
          keyword: kw,
          organic_results: organicResults,
          sponsored_results: sponsoredResults,
          amazons_choices: amazonsChoices,
          total_results_count: searchResult.data.total_results_count || 0,
          source: 'fresh',
        }
      }

      if (!keywordSearchData) continue
      allKeywordSearchData.push(keywordSearchData)

      // --- Phase B: Extract ASINs and lookup each one ---
      const organicResults = (keywordSearchData.organic_results as Array<Record<string, unknown>>) || []
      const kwAsins = organicResults
        .map(item => item.asin as string)
        .filter(Boolean)

      // Per-keyword: up to maxCompetitors NEW ASINs (skip already-fetched for dedup)
      const newAsins = kwAsins.filter(asin => !competitorsMap.has(asin))
      const asinsToLookup = newAsins.slice(0, maxCompetitors)

      // Rate-limit: delay after keyword search before starting ASIN lookups
      if (asinsToLookup.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS))
      }

      for (let ai = 0; ai < asinsToLookup.length; ai++) {
        const asin = asinsToLookup[ai]
        totalProcessed++

        await updateMI(id, {
          progress: {
            step: 'asin_lookup',
            current: ai + 1,
            total: asinsToLookup.length,
            message: keywordsList.length > 1
              ? `[${kw}] Fetching product ${asin} (${ai + 1}/${asinsToLookup.length})...`
              : `Fetching product ${asin} (${ai + 1}/${asinsToLookup.length})...`,
          },
        })

        // Wrap in Promise.race with hard timeout
        const asinResult = await Promise.race([
          (async (): Promise<Record<string, unknown> | null> => {
            // Check cache
            const { data: cachedLookup } = await supabase
              .from('lb_asin_lookups')
              .select('*')
              .eq('asin', asin)
              .eq('country_id', record.country_id as string)
              .gte('updated_at', cacheThreshold)
              .single()

            if (cachedLookup) {
              return {
                asin: cachedLookup.asin,
                title: cachedLookup.title,
                brand: cachedLookup.brand,
                price: cachedLookup.price,
                price_initial: cachedLookup.price_initial,
                currency: cachedLookup.currency,
                rating: cachedLookup.rating,
                reviews_count: cachedLookup.reviews_count,
                bullet_points: cachedLookup.bullet_points,
                description: cachedLookup.description,
                product_overview: cachedLookup.product_overview,
                product_details: cachedLookup.product_details,
                images: cachedLookup.images,
                is_prime_eligible: cachedLookup.is_prime_eligible,
                amazon_choice: cachedLookup.amazon_choice,
                deal_type: cachedLookup.deal_type,
                coupon: cachedLookup.coupon,
                coupon_discount_percentage: cachedLookup.coupon_discount_percentage,
                discount_percentage: cachedLookup.discount_percentage,
                sales_volume: cachedLookup.sales_volume,
                sales_rank: cachedLookup.sales_rank,
                category: cachedLookup.category,
                featured_merchant: cachedLookup.featured_merchant,
                variations: cachedLookup.variations,
                stock: cachedLookup.stock,
                parent_asin: cachedLookup.parent_asin,
                answered_questions_count: cachedLookup.answered_questions_count,
                has_videos: cachedLookup.has_videos,
                max_quantity: cachedLookup.max_quantity,
                pricing_count: cachedLookup.pricing_count,
                product_dimensions: cachedLookup.product_dimensions,
                delivery: cachedLookup.delivery,
                buybox: cachedLookup.buybox,
                lightning_deal: cachedLookup.lightning_deal,
                rating_stars_distribution: cachedLookup.rating_stars_distribution,
                sns_discounts: cachedLookup.sns_discounts,
                top_reviews: cachedLookup.top_reviews,
                marketplace_domain: country.amazon_domain,
                source: 'cache',
              }
            }

            // Fetch fresh from Oxylabs
            const lookupResult = await lookupAsin(asin, oxylabsDomain)
            oxylabsCallsUsed++

            if (!lookupResult.success || !lookupResult.data) {
              throw new Error(lookupResult.error || 'Lookup failed')
            }

            const p = lookupResult.data

            // Upsert to cache
            await admin.from('lb_asin_lookups').upsert({
              asin,
              country_id: record.country_id as string,
              marketplace_domain: country.amazon_domain,
              raw_response: p,
              title: p.title || null,
              brand: p.brand || null,
              price: p.price ?? null,
              price_upper: p.price_upper ?? null,
              price_sns: p.price_sns ?? null,
              price_initial: p.price_initial ?? null,
              price_shipping: p.price_shipping ?? null,
              currency: p.currency || null,
              rating: p.rating ?? null,
              reviews_count: p.reviews_count ?? null,
              bullet_points: p.bullet_points || null,
              description: p.description || null,
              images: p.images || [],
              sales_rank: p.sales_rank || null,
              category: p.category || null,
              featured_merchant: p.featured_merchant || null,
              variations: p.variation || null,
              is_prime_eligible: p.is_prime_eligible ?? false,
              stock: p.stock || null,
              deal_type: p.deal_type || null,
              coupon: p.coupon || null,
              coupon_discount_percentage: p.coupon_discount_percentage ?? null,
              discount_percentage: p.discount?.percentage ?? null,
              amazon_choice: p.amazon_choice ?? false,
              parent_asin: p.parent_asin || null,
              answered_questions_count: p.answered_questions_count ?? null,
              has_videos: p.has_videos ?? false,
              sales_volume: p.sales_volume || null,
              max_quantity: p.max_quantity ?? null,
              pricing_count: p.pricing_count ?? null,
              product_dimensions: p.product_dimensions || null,
              product_details: p.product_details || null,
              product_overview: p.product_overview || null,
              delivery: p.delivery || null,
              buybox: p.buybox || null,
              lightning_deal: p.lightning_deal || null,
              rating_stars_distribution: p.rating_stars_distribution || null,
              sns_discounts: p.sns_discounts || null,
              top_reviews: p.reviews || null,
              lookup_by: userId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'asin,country_id' })

            return {
              asin,
              title: p.title,
              brand: p.brand,
              price: p.price,
              price_initial: p.price_initial,
              currency: p.currency,
              rating: p.rating,
              reviews_count: p.reviews_count,
              bullet_points: p.bullet_points,
              description: p.description,
              product_overview: p.product_overview,
              product_details: p.product_details,
              images: p.images,
              is_prime_eligible: p.is_prime_eligible,
              amazon_choice: p.amazon_choice,
              deal_type: p.deal_type,
              coupon: p.coupon,
              coupon_discount_percentage: p.coupon_discount_percentage,
              discount_percentage: p.discount?.percentage,
              sales_volume: p.sales_volume,
              sales_rank: p.sales_rank,
              category: p.category,
              featured_merchant: p.featured_merchant,
              variations: p.variation,
              stock: p.stock,
              parent_asin: p.parent_asin,
              answered_questions_count: p.answered_questions_count,
              has_videos: p.has_videos,
              max_quantity: p.max_quantity,
              pricing_count: p.pricing_count,
              product_dimensions: p.product_dimensions,
              delivery: p.delivery,
              buybox: p.buybox,
              lightning_deal: p.lightning_deal,
              rating_stars_distribution: p.rating_stars_distribution,
              sns_discounts: p.sns_discounts,
              top_reviews: p.reviews,
              marketplace_domain: country.amazon_domain,
              source: 'fresh',
            }
          })().catch((lookupErr) => {
            console.error(`[MI ${id}] Failed to lookup ${asin}:`, lookupErr)
            return {
              asin,
              error: lookupErr instanceof Error ? lookupErr.message : 'Lookup failed',
              source: 'error',
            } as Record<string, unknown>
          }),
          // Hard timeout: skip this ASIN
          new Promise<null>((resolve) =>
            setTimeout(() => {
              console.error(`[MI ${id}] ASIN ${asin} timed out after ${ASIN_TIMEOUT_MS / 1000}s — skipping`)
              resolve(null)
            }, ASIN_TIMEOUT_MS)
          ),
        ])

        if (asinResult) {
          competitorsMap.set(asin, asinResult)
        } else {
          competitorsMap.set(asin, {
            asin,
            error: `Skipped: timed out after ${ASIN_TIMEOUT_MS / 1000}s`,
            source: 'error',
          })
        }

        // Rate-limit delay between fresh Oxylabs calls
        if (ai < asinsToLookup.length - 1 && asinResult?.source !== 'cache') {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS))
        }
      }

      // Rate-limit delay between keywords to avoid Oxylabs burst
      if (ki < keywordsList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
    }

    // ========== Save collected data & transition to awaiting_selection ==========
    const competitorsData = Array.from(competitorsMap.values())
    const topAsins = Array.from(competitorsMap.keys())

    if (topAsins.length === 0) {
      await updateMI(id, { status: 'failed', error_message: 'No products found for any keyword' })
      console.error(`[MI ${id}] backgroundCollect: no products found`)
      return
    }

    const keywordSearchDataFinal = keywordsList.length === 1
      ? allKeywordSearchData[0] || {}
      : { keywords: allKeywordSearchData }

    const { error: finalErr } = await admin.from('lb_market_intelligence').update({
      status: 'awaiting_selection',
      top_asins: topAsins,
      competitors_data: competitorsData,
      keyword_search_data: keywordSearchDataFinal,
      oxylabs_calls_used: oxylabsCallsUsed,
      progress: {
        step: 'awaiting_selection',
        current: 0,
        total: 0,
        message: `Found ${topAsins.length} products. Select which to analyze.`,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (finalErr) {
      console.error(`[MI ${id}] backgroundCollect: final DB update failed:`, finalErr)
      await updateMI(id, { status: 'failed', error_message: `DB update failed: ${finalErr.message}` })
      return
    }

    console.log(`[MI ${id}] backgroundCollect complete. ${topAsins.length} products found, ${oxylabsCallsUsed} API calls.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[MI ${id}] backgroundCollect failed:`, msg)
    await updateMI(id, { status: 'failed', error_message: msg })
  }
}

/**
 * Background job: fetches reviews + Q&A for selected products, then runs 4-phase Claude analysis.
 * Called fire-and-forget from /select route.
 */
export async function backgroundAnalyze(
  id: string,
  record: Record<string, unknown>,
  selectedAsins: string[],
  userId: string
) {
  try {
    const supabase = createClient()

    // Get country for domain
    const { data: country } = await supabase
      .from('lb_countries')
      .select('id, name, amazon_domain')
      .eq('id', record.country_id as string)
      .single()

    if (!country) {
      await updateMI(id, { status: 'failed', error_message: 'Country not found' })
      return
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()
    const reviewsPerProduct = (record.reviews_per_product as number) || 200
    const reviewPages = Math.ceil(reviewsPerProduct / 10)
    let oxylabsCallsUsed = (record.oxylabs_calls_used as number) || 0
    const competitorsRaw = (record.competitors_data || []) as Array<Record<string, unknown>>
    const admin = createAdminClient()

    // ========== PHASE A: Fetch reviews for selected products ==========
    const PER_ASIN_TIMEOUT_OXYLABS = 65_000 // 65s for Oxylabs
    const PER_ASIN_TIMEOUT_APIFY = 420_000 // 7 min for Apify actor runs (300s internal + buffer)
    const reviewsData: Record<string, Array<Record<string, unknown>>> = {}

    for (let i = 0; i < selectedAsins.length; i++) {
      const asin = selectedAsins[i]

      await updateMI(id, {
        progress: {
          step: 'review_fetch',
          current: i,
          total: selectedAsins.length,
          message: `Fetching reviews for ${asin} via Apify (${i + 1}/${selectedAsins.length})... This may take a few minutes per product.`,
        },
      })

      const reviewResult = await Promise.race([
        (async () => {
          // 1. Check cache first (7-day TTL)
          const { data: cachedReviews } = await supabase
            .from('lb_asin_reviews')
            .select('reviews')
            .eq('asin', asin)
            .eq('country_id', record.country_id as string)
            .gte('updated_at', cacheThreshold)
            .single()

          if (cachedReviews?.reviews) {
            console.log(`[MI ${id}] Reviews for ${asin}: found in cache`)
            return cachedReviews.reviews as Array<Record<string, unknown>>
          }

          // 2. Try Apify first (primary — gets 100-500 reviews)
          try {
            console.log(`[MI ${id}] Trying Apify for ${asin} reviews...`)
            const apifyResult = await fetchReviewsViaApify(
              asin,
              country.amazon_domain,
              reviewsPerProduct,
              'recent'
            )

            if (apifyResult.success && apifyResult.data?.reviews?.length) {
              const normalized = apifyResult.data.reviews.map(normalizeApifyReview)

              // Cache upsert (fire-and-forget)
              admin.from('lb_asin_reviews').upsert({
                asin,
                country_id: record.country_id as string,
                marketplace_domain: country.amazon_domain,
                total_reviews: normalized.length,
                overall_rating: null,
                rating_stars_distribution: null,
                reviews: normalized,
                raw_response: { provider: 'apify', runId: apifyResult.data.runId },
                sort_by: 'recent',
                fetched_by: userId,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'asin,country_id,sort_by' })

              console.log(`[MI ${id}] Apify returned ${normalized.length} reviews for ${asin}`)
              return normalized as unknown as Array<Record<string, unknown>>
            }
            console.log(`[MI ${id}] Apify returned no reviews for ${asin}`)
          } catch (apifyErr) {
            console.error(`[MI ${id}] Apify failed for ${asin}:`, apifyErr)
          }

          // 3. Oxylabs fallback (only if Apify completely failed)
          console.log(`[MI ${id}] Falling back to Oxylabs for ${asin} reviews...`)
          await updateMI(id, {
            progress: {
              step: 'review_fetch',
              current: i,
              total: selectedAsins.length,
              message: `Fetching reviews for ${asin} via Oxylabs fallback (${i + 1}/${selectedAsins.length})...`,
            },
          })

          const result = await fetchReviews(asin, oxylabsDomain, 1, Math.min(reviewPages, 20))
          oxylabsCallsUsed++

          if (result.success && result.data?.reviews) {
            // Cache upsert (fire-and-forget)
            admin.from('lb_asin_reviews').upsert({
              asin,
              country_id: record.country_id as string,
              marketplace_domain: country.amazon_domain,
              reviews_count: result.data.reviews_count || result.data.reviews.length,
              rating: result.data.rating,
              rating_stars_distribution: result.data.rating_stars_distribution,
              reviews: result.data.reviews,
              raw_response: result.data,
              sort_by: 'recent',
              fetched_by: userId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'asin,country_id,sort_by' })

            return result.data.reviews as unknown as Array<Record<string, unknown>>
          }

          // 4. Final fallback: top_reviews from product lookup (~12 reviews)
          console.log(`[MI ${id}] All providers failed for ${asin}, using top_reviews fallback`)
          const comp = competitorsRaw.find(c => c.asin === asin)
          return (comp?.top_reviews || null) as Array<Record<string, unknown>> | null
        })().catch(() => {
          const comp = competitorsRaw.find(c => c.asin === asin)
          return (comp?.top_reviews || null) as Array<Record<string, unknown>> | null
        }),
        new Promise<null>((resolve) => setTimeout(() => {
          console.error(`[MI ${id}] Review fetch for ${asin} timed out after ${PER_ASIN_TIMEOUT_APIFY / 1000}s — skipping`)
          resolve(null)
        }, PER_ASIN_TIMEOUT_APIFY)),
      ])

      if (reviewResult) {
        reviewsData[asin] = reviewResult
      } else {
        // Fallback: top_reviews from product lookup
        const comp = competitorsRaw.find(c => c.asin === asin)
        if (comp?.top_reviews) {
          reviewsData[asin] = comp.top_reviews as Array<Record<string, unknown>>
        }
      }

      // Rate-limit delay between calls
      if (i < selectedAsins.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    // Breathing room between review and Q&A phases
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // ========== PHASE B: Fetch Q&A for selected products ==========
    const questionsData: Record<string, Array<Record<string, unknown>>> = {}

    for (let i = 0; i < selectedAsins.length; i++) {
      const asin = selectedAsins[i]

      await updateMI(id, {
        progress: {
          step: 'qna_fetch',
          current: i,
          total: selectedAsins.length,
          message: `Fetching Q&A for ${asin} (${i + 1}/${selectedAsins.length})...`,
        },
      })

      const qnaResult = await Promise.race([
        (async () => {
          // Check cache
          const { data: cachedQnA } = await supabase
            .from('lb_asin_questions')
            .select('questions')
            .eq('asin', asin)
            .eq('country_id', record.country_id as string)
            .gte('updated_at', cacheThreshold)
            .single()

          if (cachedQnA?.questions) {
            return cachedQnA.questions as Array<Record<string, unknown>>
          }

          const result = await fetchQuestions(asin, oxylabsDomain, 1)
          oxylabsCallsUsed++

          if (result.success && result.data?.questions) {
            // Cache upsert (fire-and-forget)
            admin.from('lb_asin_questions').upsert({
              asin,
              country_id: record.country_id as string,
              marketplace_domain: country.amazon_domain,
              total_questions: result.data.questions.length,
              questions: result.data.questions,
              raw_response: result.data,
              fetched_by: userId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'asin,country_id' })

            return result.data.questions as unknown as Array<Record<string, unknown>>
          }
          return null
        })().catch((err) => {
          console.error(`[MI ${id}] Failed to fetch Q&A for ${asin}:`, err)
          return null
        }),
        new Promise<null>((resolve) => setTimeout(() => {
          console.error(`[MI ${id}] Q&A fetch for ${asin} timed out — skipping`)
          resolve(null)
        }, PER_ASIN_TIMEOUT_OXYLABS)),
      ])

      if (qnaResult) {
        questionsData[asin] = qnaResult
      }

      // Rate-limit delay between Oxylabs calls
      if (i < selectedAsins.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    // Save reviews + Q&A data, update oxylabs count
    await updateMI(id, {
      reviews_data: reviewsData,
      questions_data: questionsData,
      oxylabs_calls_used: oxylabsCallsUsed,
      progress: { step: 'phase_1', current: 0, total: 4, message: 'Phase 1: Analyzing reviews...' },
    })

    // ========== PHASE C: 4-phase Claude analysis ==========
    // Build data object for Claude (same structure as old analyze route)
    const keywordData = record.keyword_search_data as Record<string, unknown>

    let organicResults: Array<Record<string, unknown>> = []
    if (keywordData?.keywords && Array.isArray(keywordData.keywords)) {
      for (const kwData of keywordData.keywords as Array<Record<string, unknown>>) {
        const or = (kwData.organic_results || []) as Array<Record<string, unknown>>
        organicResults.push(...or)
      }
    } else {
      organicResults = (keywordData?.organic_results || []) as Array<Record<string, unknown>>
    }

    const filteredCompetitors = competitorsRaw.filter(
      c => !c.error && selectedAsins.includes(c.asin as string)
    )

    const competitors = filteredCompetitors.map(c => ({
      asin: c.asin as string,
      title: c.title as string,
      brand: (c.brand as string) || '',
      price: c.price as number | null,
      price_initial: c.price_initial as number | null,
      currency: (c.currency as string) || '$',
      rating: (c.rating as number) || 0,
      reviews_count: (c.reviews_count as number) || 0,
      bullet_points: (c.bullet_points as string) || '',
      description: (c.description as string) || '',
      product_overview: (c.product_overview as Array<{ title: string; description: string }>) || [],
      images: (c.images as string[]) || [],
      is_prime_eligible: (c.is_prime_eligible as boolean) || false,
      amazon_choice: (c.amazon_choice as boolean) || false,
      deal_type: c.deal_type as string | null,
      coupon: c.coupon as string | null,
      sales_volume: c.sales_volume as string | null,
      sales_rank: c.sales_rank,
      reviews: ((c.top_reviews || []) as Array<Record<string, unknown>>).map(r => ({
        rating: (r.rating as number) || 0,
        title: (r.title as string) || '',
        content: (r.content as string) || '',
        author: (r.author as string) || '',
        is_verified: (r.is_verified as boolean) || false,
        helpful_count: (r.helpful_count as number) || 0,
      })),
    }))

    const typedReviews: Record<string, Array<{ rating: number; title: string; content: string; author: string; is_verified: boolean; helpful_count: number; id?: string; timestamp?: string }>> = {}
    for (const [asin, reviews] of Object.entries(reviewsData)) {
      if (!selectedAsins.includes(asin)) continue
      typedReviews[asin] = reviews.map(r => ({
        rating: (r.rating as number) || 0,
        title: (r.title as string) || '',
        content: (r.content as string) || '',
        author: (r.author as string) || '',
        is_verified: (r.is_verified as boolean) || false,
        helpful_count: (r.helpful_count as number) || 0,
        id: r.id as string | undefined,
        timestamp: r.timestamp as string | undefined,
      }))
    }

    const typedQuestions: Record<string, Array<{ question: string; answer: string; votes: number; author?: string; date?: string }>> = {}
    for (const [asin, questions] of Object.entries(questionsData)) {
      if (!selectedAsins.includes(asin)) continue
      typedQuestions[asin] = questions.map(q => ({
        question: (q.question as string) || '',
        answer: (q.answer as string) || '',
        votes: (q.votes as number) || 0,
        author: q.author as string | undefined,
        date: q.date as string | undefined,
      }))
    }

    const searchResults = organicResults.slice(0, 20).map(r => ({
      pos: (r.pos as number) || 0,
      title: (r.title as string) || '',
      asin: (r.asin as string) || '',
      price: r.price as number | null,
      rating: r.rating as number | null,
      reviews_count: r.reviews_count as number | null,
      is_prime: (r.is_prime as boolean) || false,
      sales_volume: r.sales_volume as string | null,
    }))

    const prices = competitors.map(c => c.price).filter((p): p is number => p !== null && p > 0)
    const ratings = competitors.map(c => c.rating).filter(r => r > 0)
    const totalReviews = competitors.reduce((sum, c) => sum + (c.reviews_count || 0), 0)
    const primeCount = competitors.filter(c => c.is_prime_eligible).length
    const choiceCount = competitors.filter(c => c.amazon_choice).length

    const data = {
      keyword: record.keyword as string,
      keywords: record.keywords as string[] | undefined,
      marketplace: record.marketplace_domain as string,
      searchResults,
      competitors,
      reviewsData: typedReviews,
      questionsData: typedQuestions,
      marketStats: {
        avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
        totalReviews,
        primePercentage: competitors.length ? (primeCount / competitors.length) * 100 : 0,
        amazonChoiceCount: choiceCount,
        currency: competitors[0]?.currency || '$',
      },
    }

    let totalTokens = 0

    // Phase 1: Review Deep-Dive
    const phase1 = await analyzeMarketIntelligencePhase1Reviews(data)
    totalTokens += phase1.tokensUsed

    await updateMI(id, {
      progress: { step: 'phase_2', current: 1, total: 4, message: 'Phase 2: Analyzing Q&A data...' },
    })

    // Phase 2: Q&A Analysis
    const phase2 = await analyzeMarketIntelligencePhase2QnA(data, phase1.result as unknown as Record<string, unknown>)
    totalTokens += phase2.tokensUsed

    await updateMI(id, {
      progress: { step: 'phase_3', current: 2, total: 4, message: 'Phase 3: Analyzing market & competition...' },
    })

    // Phase 3: Market & Competitive
    const phase3 = await analyzeMarketIntelligencePhase3Market(
      data,
      phase1.result as unknown as Record<string, unknown>,
      phase2.result as unknown as Record<string, unknown>
    )
    totalTokens += phase3.tokensUsed

    await updateMI(id, {
      progress: { step: 'phase_4', current: 3, total: 4, message: 'Phase 4: Building customer intelligence & strategy...' },
    })

    // Phase 4: Customer Intelligence & Strategy
    const phase4 = await analyzeMarketIntelligencePhase4Strategy(
      data,
      phase1.result as unknown as Record<string, unknown>,
      phase2.result as unknown as Record<string, unknown>,
      phase3.result as unknown as Record<string, unknown>
    )
    totalTokens += phase4.tokensUsed

    // Merge all 4 phases and mark complete
    const mergedResult = {
      ...phase1.result,
      ...phase2.result,
      ...phase3.result,
      ...phase4.result,
    }

    await updateMI(id, {
      status: 'completed',
      analysis_result: mergedResult,
      model_used: phase1.model,
      tokens_used: totalTokens,
      progress: { step: 'completed', current: 4, total: 4, message: 'Analysis complete.' },
    })

    console.log(`[MI ${id}] Background analysis complete. ${totalTokens} tokens used.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[MI ${id}] Background analyze failed:`, msg)
    await updateMI(id, { status: 'failed', error_message: msg })
  }
}
