import { createAdminClient, createClient } from '@/lib/supabase/server'
import { fetchReviews, fetchQuestions } from '@/lib/oxylabs'
import {
  analyzeMarketIntelligencePhase1Reviews,
  analyzeMarketIntelligencePhase2QnA,
  analyzeMarketIntelligencePhase3Market,
  analyzeMarketIntelligencePhase4Strategy,
} from '@/lib/claude'

const CACHE_HOURS = 168 // 7 days

async function updateMI(id: string, updates: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('lb_market_intelligence')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error(`[MI ${id}] Failed to update:`, error)
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
    const PER_ASIN_TIMEOUT = 65_000 // 65s hard timeout per ASIN fetch
    const reviewsData: Record<string, Array<Record<string, unknown>>> = {}

    for (let i = 0; i < selectedAsins.length; i++) {
      const asin = selectedAsins[i]

      await updateMI(id, {
        progress: {
          step: 'review_fetch',
          current: i,
          total: selectedAsins.length,
          message: `Fetching reviews for ${asin} (${i + 1}/${selectedAsins.length})...`,
        },
      })

      const reviewResult = await Promise.race([
        (async () => {
          // Check cache
          const { data: cachedReviews } = await supabase
            .from('lb_asin_reviews')
            .select('reviews')
            .eq('asin', asin)
            .eq('country_id', record.country_id as string)
            .gte('updated_at', cacheThreshold)
            .single()

          if (cachedReviews?.reviews) {
            return cachedReviews.reviews as Array<Record<string, unknown>>
          }

          // Fetch fresh
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

          // Fallback: top_reviews from product lookup
          const comp = competitorsRaw.find(c => c.asin === asin)
          return (comp?.top_reviews || null) as Array<Record<string, unknown>> | null
        })().catch(() => {
          const comp = competitorsRaw.find(c => c.asin === asin)
          return (comp?.top_reviews || null) as Array<Record<string, unknown>> | null
        }),
        new Promise<null>((resolve) => setTimeout(() => {
          console.error(`[MI ${id}] Review fetch for ${asin} timed out — skipping`)
          resolve(null)
        }, PER_ASIN_TIMEOUT)),
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

      // Rate-limit delay between Oxylabs calls
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
        }, PER_ASIN_TIMEOUT)),
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
