import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { searchKeyword, lookupAsin } from '@/lib/oxylabs'

const CACHE_HOURS = 168 // 7 days

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const admin = createAdminClient()

    // 1. Validate record exists and is pending
    const { data: record, error: fetchErr } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }
    if (record.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot collect: status is "${record.status}", expected "pending"` },
        { status: 400 }
      )
    }

    // Get keywords list (support both single and multi-keyword)
    const keywordsList: string[] = record.keywords && record.keywords.length > 0
      ? record.keywords
      : [record.keyword]

    // 2. Set status to collecting
    await admin.from('lb_market_intelligence').update({
      status: 'collecting',
      progress: { step: 'keyword_search', current: 0, total: 1, message: 'Starting keyword searches...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // 3. Get country for domain derivation
    const { data: country } = await supabase
      .from('lb_countries')
      .select('id, name, amazon_domain')
      .eq('id', record.country_id)
      .single()

    if (!country) {
      await admin.from('lb_market_intelligence').update({
        status: 'failed', error_message: 'Country not found',
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')
    let oxylabsCallsUsed = 0
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()

    // ========== STEP 1: Search all keywords ==========
    const masterAsinSet = new Set<string>()
    const allKeywordSearchData: Record<string, unknown>[] = []

    for (let ki = 0; ki < keywordsList.length; ki++) {
      const kw = keywordsList[ki]

      await admin.from('lb_market_intelligence').update({
        progress: {
          step: 'keyword_search',
          current: ki,
          total: keywordsList.length,
          message: `Searching keyword "${kw}" (${ki + 1}/${keywordsList.length})...`,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)

      // Check cache
      let keywordSearchData: Record<string, unknown> | null = null
      const { data: cachedSearch } = await supabase
        .from('lb_keyword_searches')
        .select('*')
        .eq('keyword', kw)
        .eq('country_id', record.country_id)
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
        const searchResult = await searchKeyword(kw, oxylabsDomain, 1)
        oxylabsCallsUsed++

        if (!searchResult.success || !searchResult.data) {
          // Skip this keyword, continue with others
          console.error(`Keyword search failed for "${kw}": ${searchResult.error}`)
          continue
        }

        const organicResults = searchResult.data.results?.organic || []
        const sponsoredResults = searchResult.data.results?.paid || []
        const amazonsChoices = searchResult.data.results?.amazons_choices || []

        // Upsert to cache
        await admin.from('lb_keyword_searches').upsert({
          keyword: kw,
          country_id: record.country_id,
          marketplace_domain: country.amazon_domain,
          total_results_count: searchResult.data.total_results_count || 0,
          pages_fetched: 1,
          organic_results: organicResults,
          sponsored_results: sponsoredResults,
          amazons_choices: amazonsChoices,
          suggested_results: searchResult.data.results?.suggested || [],
          raw_response: searchResult.data,
          searched_by: lbUser.id,
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

      if (keywordSearchData) {
        allKeywordSearchData.push(keywordSearchData)

        // Extract ASINs from organic results
        const organicResults = (keywordSearchData.organic_results as Array<Record<string, unknown>>) || []
        for (const item of organicResults) {
          const asin = item.asin as string
          if (asin) masterAsinSet.add(asin)
        }
      }
    }

    // Limit to max_competitors unique ASINs (take top by organic rank order)
    const topAsins = Array.from(masterAsinSet).slice(0, record.max_competitors)

    if (topAsins.length === 0) {
      await admin.from('lb_market_intelligence').update({
        status: 'failed',
        error_message: 'No products found for any keyword',
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)
      return NextResponse.json({ error: 'No products found' }, { status: 404 })
    }

    // ========== STEP 2: Fetch product data for each ASIN ==========
    const ASIN_TIMEOUT_MS = 65_000 // 65s hard limit per ASIN (slightly above Oxylabs 60s)
    const competitorsData: Array<Record<string, unknown>> = []
    const totalSteps = topAsins.length

    for (let i = 0; i < topAsins.length; i++) {
      const asin = topAsins[i]

      await admin.from('lb_market_intelligence').update({
        progress: {
          step: 'asin_lookup',
          current: i,
          total: totalSteps,
          message: `Fetching product ${asin} (${i + 1}/${totalSteps})...`,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)

      // Wrap entire ASIN processing in Promise.race with hard timeout
      const asinResult = await Promise.race([
        (async (): Promise<Record<string, unknown> | null> => {
          // Check cache
          const { data: cachedLookup } = await supabase
            .from('lb_asin_lookups')
            .select('*')
            .eq('asin', asin)
            .eq('country_id', record.country_id)
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

          // Fetch fresh
          const lookupResult = await lookupAsin(asin, oxylabsDomain)
          oxylabsCallsUsed++

          if (!lookupResult.success || !lookupResult.data) {
            throw new Error(lookupResult.error || 'Lookup failed')
          }

          const p = lookupResult.data

          // Upsert to cache
          await admin.from('lb_asin_lookups').upsert({
            asin,
            country_id: record.country_id,
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
            lookup_by: lbUser.id,
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
          console.error(`Failed to lookup ${asin}:`, lookupErr)
          return {
            asin,
            error: lookupErr instanceof Error ? lookupErr.message : 'Lookup failed',
            source: 'error',
          } as Record<string, unknown>
        }),
        // Hard timeout: skip this ASIN after 65s
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.error(`[MI] ASIN ${asin} timed out after ${ASIN_TIMEOUT_MS / 1000}s — skipping`)
            resolve(null)
          }, ASIN_TIMEOUT_MS)
        ),
      ])

      if (asinResult) {
        competitorsData.push(asinResult)
      } else {
        // Timed out — add error entry so user sees it was skipped
        competitorsData.push({
          asin,
          error: `Skipped: timed out after ${ASIN_TIMEOUT_MS / 1000}s`,
          source: 'error',
        })
      }
    }

    // ========== STEP 3: Save collected data & show products for selection ==========
    // Reviews + Q&A are now fetched AFTER user confirms product selection (in backgroundAnalyze)
    const keywordSearchData = keywordsList.length === 1
      ? allKeywordSearchData[0] || {}
      : { keywords: allKeywordSearchData }

    await admin.from('lb_market_intelligence').update({
      status: 'awaiting_selection',
      top_asins: topAsins,
      competitors_data: competitorsData,
      keyword_search_data: keywordSearchData,
      oxylabs_calls_used: oxylabsCallsUsed,
      progress: {
        step: 'awaiting_selection',
        current: 0,
        total: 0,
        message: `Found ${topAsins.length} products. Select which to analyze.`,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    return NextResponse.json({
      status: 'awaiting_selection',
      asins_found: topAsins.length,
      competitors_fetched: competitorsData.filter(c => !c.error).length,
      oxylabs_calls_used: oxylabsCallsUsed,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    try {
      const admin = createAdminClient()
      await admin.from('lb_market_intelligence').update({
        status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)
    } catch { /* swallow */ }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
