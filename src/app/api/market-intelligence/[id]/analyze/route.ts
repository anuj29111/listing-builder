import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeMarketIntelligencePhase1, analyzeMarketIntelligencePhase2 } from '@/lib/claude'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const admin = createAdminClient()

    // 1. Validate record exists and is collected
    const { data: record, error: fetchErr } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }
    if (record.status !== 'collected') {
      return NextResponse.json(
        { error: `Cannot analyze: status is "${record.status}", expected "collected"` },
        { status: 400 }
      )
    }

    // 2. Set status to analyzing
    await admin.from('lb_market_intelligence').update({
      status: 'analyzing',
      progress: { step: 'phase_1', current: 0, total: 2, message: 'Phase 1: Analyzing market & competition...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // 3. Build aggregated data for Claude
    const competitorsRaw = (record.competitors_data || []) as Array<Record<string, unknown>>
    const keywordData = record.keyword_search_data as Record<string, unknown>
    const organicResults = (keywordData?.organic_results || []) as Array<Record<string, unknown>>

    // Filter out errored competitors
    const competitors = competitorsRaw.filter(c => !c.error).map(c => ({
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

    // Compute market stats
    const prices = competitors.map(c => c.price).filter((p): p is number => p !== null && p > 0)
    const ratings = competitors.map(c => c.rating).filter(r => r > 0)
    const totalReviews = competitors.reduce((sum, c) => sum + (c.reviews_count || 0), 0)
    const primeCount = competitors.filter(c => c.is_prime_eligible).length
    const choiceCount = competitors.filter(c => c.amazon_choice).length

    const data = {
      keyword: record.keyword,
      marketplace: record.marketplace_domain,
      searchResults,
      competitors,
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

    // 4. Phase 1: Market & Competitive Analysis
    const phase1 = await analyzeMarketIntelligencePhase1(data)

    // Update progress for phase 2
    await admin.from('lb_market_intelligence').update({
      progress: { step: 'phase_2', current: 1, total: 2, message: 'Phase 2: Building customer intelligence & strategy...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // 5. Phase 2: Customer Intelligence & Strategy
    const phase2 = await analyzeMarketIntelligencePhase2(data, phase1.result)

    // 6. Merge Phase 1 + Phase 2 into final result
    const mergedResult = {
      ...phase1.result,
      ...phase2.result,
    }

    const totalTokens = phase1.tokensUsed + phase2.tokensUsed

    // 7. Update record as completed
    await admin.from('lb_market_intelligence').update({
      status: 'completed',
      analysis_result: mergedResult,
      model_used: phase1.model,
      tokens_used: totalTokens,
      progress: { step: 'completed', current: 2, total: 2, message: 'Analysis complete.' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    return NextResponse.json({
      status: 'completed',
      model: phase1.model,
      tokens_used: totalTokens,
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
