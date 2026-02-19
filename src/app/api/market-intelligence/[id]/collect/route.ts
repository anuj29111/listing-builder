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

    // 2. Set status to collecting
    await admin.from('lb_market_intelligence').update({
      status: 'collecting',
      progress: { step: 'keyword_search', current: 0, total: record.max_competitors + 1, message: 'Searching keyword...' },
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

    // 4. Keyword search — check cache first
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()
    let keywordSearchData: Record<string, unknown> | null = null

    const { data: cachedSearch } = await supabase
      .from('lb_keyword_searches')
      .select('*')
      .eq('keyword', record.keyword)
      .eq('country_id', record.country_id)
      .gte('updated_at', cacheThreshold)
      .single()

    if (cachedSearch) {
      keywordSearchData = {
        organic_results: cachedSearch.organic_results,
        sponsored_results: cachedSearch.sponsored_results,
        amazons_choices: cachedSearch.amazons_choices,
        total_results_count: cachedSearch.total_results_count,
        source: 'cache',
      }
    } else {
      // Fetch fresh from Oxylabs
      const searchResult = await searchKeyword(record.keyword, oxylabsDomain, 1)
      oxylabsCallsUsed++

      if (!searchResult.success || !searchResult.data) {
        await admin.from('lb_market_intelligence').update({
          status: 'failed', error_message: searchResult.error || 'Keyword search failed',
          updated_at: new Date().toISOString(),
        }).eq('id', params.id)
        return NextResponse.json({ error: searchResult.error || 'Keyword search failed' }, { status: 500 })
      }

      // Upsert to cache
      const organicResults = searchResult.data.results?.organic || []
      const sponsoredResults = searchResult.data.results?.paid || []
      const amazonsChoices = searchResult.data.results?.amazons_choices || []

      await admin.from('lb_keyword_searches').upsert({
        keyword: record.keyword,
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
        organic_results: organicResults,
        sponsored_results: sponsoredResults,
        amazons_choices: amazonsChoices,
        total_results_count: searchResult.data.total_results_count || 0,
        source: 'fresh',
      }
    }

    // Update progress
    await admin.from('lb_market_intelligence').update({
      progress: { step: 'keyword_search', current: 1, total: record.max_competitors + 1, message: 'Keyword search complete. Fetching products...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // 5. Extract top N organic ASINs
    const organicResults = (keywordSearchData.organic_results as Array<Record<string, unknown>>) || []
    const seenAsins = new Set<string>()
    const topAsins: string[] = []

    for (const item of organicResults) {
      const asin = item.asin as string
      if (asin && !seenAsins.has(asin)) {
        seenAsins.add(asin)
        topAsins.push(asin)
        if (topAsins.length >= record.max_competitors) break
      }
    }

    // 6. Fetch product data for each ASIN
    const competitorsData: Array<Record<string, unknown>> = []

    for (let i = 0; i < topAsins.length; i++) {
      const asin = topAsins[i]

      // Update progress
      await admin.from('lb_market_intelligence').update({
        progress: { step: 'asin_lookup', current: i + 2, total: record.max_competitors + 1, message: `Fetching ${asin} (${i + 1}/${topAsins.length})...` },
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)

      // Check cache
      const { data: cachedLookup } = await supabase
        .from('lb_asin_lookups')
        .select('*')
        .eq('asin', asin)
        .eq('country_id', record.country_id)
        .gte('updated_at', cacheThreshold)
        .single()

      if (cachedLookup) {
        competitorsData.push({
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
          images: cachedLookup.images,
          is_prime_eligible: cachedLookup.is_prime_eligible,
          amazon_choice: cachedLookup.amazon_choice,
          deal_type: cachedLookup.deal_type,
          coupon: cachedLookup.coupon,
          sales_volume: cachedLookup.sales_volume,
          sales_rank: cachedLookup.sales_rank,
          top_reviews: cachedLookup.top_reviews,
          source: 'cache',
        })
        continue
      }

      // Fetch fresh from Oxylabs
      try {
        const lookupResult = await lookupAsin(asin, oxylabsDomain)
        oxylabsCallsUsed++

        if (!lookupResult.success || !lookupResult.data) {
          throw new Error(lookupResult.error || 'Lookup failed')
        }

        const productResult = lookupResult.data

        // Upsert to lb_asin_lookups cache
        await admin.from('lb_asin_lookups').upsert({
          asin,
          country_id: record.country_id,
          marketplace_domain: country.amazon_domain,
          raw_response: productResult,
          title: productResult.title || null,
          brand: productResult.brand || null,
          price: productResult.price ?? null,
          price_upper: productResult.price_upper ?? null,
          price_sns: productResult.price_sns ?? null,
          price_initial: productResult.price_initial ?? null,
          price_shipping: productResult.price_shipping ?? null,
          currency: productResult.currency || null,
          rating: productResult.rating ?? null,
          reviews_count: productResult.reviews_count ?? null,
          bullet_points: productResult.bullet_points || null,
          description: productResult.description || null,
          images: productResult.images || [],
          sales_rank: productResult.sales_rank || null,
          category: productResult.category || null,
          featured_merchant: productResult.featured_merchant || null,
          variations: productResult.variation || null,
          is_prime_eligible: productResult.is_prime_eligible ?? false,
          stock: productResult.stock || null,
          deal_type: productResult.deal_type || null,
          coupon: productResult.coupon || null,
          coupon_discount_percentage: productResult.coupon_discount_percentage ?? null,
          discount_percentage: productResult.discount?.percentage ?? null,
          amazon_choice: productResult.amazon_choice ?? false,
          parent_asin: productResult.parent_asin || null,
          answered_questions_count: productResult.answered_questions_count ?? null,
          has_videos: productResult.has_videos ?? false,
          sales_volume: productResult.sales_volume || null,
          max_quantity: productResult.max_quantity ?? null,
          pricing_count: productResult.pricing_count ?? null,
          product_dimensions: productResult.product_dimensions || null,
          product_details: productResult.product_details || null,
          product_overview: productResult.product_overview || null,
          delivery: productResult.delivery || null,
          buybox: productResult.buybox || null,
          lightning_deal: productResult.lightning_deal || null,
          rating_stars_distribution: productResult.rating_stars_distribution || null,
          sns_discounts: productResult.sns_discounts || null,
          top_reviews: productResult.reviews || null,
          lookup_by: lbUser.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'asin,country_id' })

        competitorsData.push({
          asin,
          title: productResult.title,
          brand: productResult.brand,
          price: productResult.price,
          price_initial: productResult.price_initial,
          currency: productResult.currency,
          rating: productResult.rating,
          reviews_count: productResult.reviews_count,
          bullet_points: productResult.bullet_points,
          description: productResult.description,
          product_overview: productResult.product_overview,
          images: productResult.images,
          is_prime_eligible: productResult.is_prime_eligible,
          amazon_choice: productResult.amazon_choice,
          deal_type: productResult.deal_type,
          coupon: productResult.coupon,
          sales_volume: productResult.sales_volume,
          sales_rank: productResult.sales_rank,
          top_reviews: productResult.reviews,
          source: 'fresh',
        })
      } catch (lookupErr) {
        // Skip this ASIN but continue with others
        console.error(`Failed to lookup ${asin}:`, lookupErr)
        competitorsData.push({
          asin,
          error: lookupErr instanceof Error ? lookupErr.message : 'Lookup failed',
          source: 'error',
        })
      }
    }

    // 7. Update record with collected data
    await admin.from('lb_market_intelligence').update({
      status: 'collected',
      top_asins: topAsins,
      competitors_data: competitorsData,
      keyword_search_data: keywordSearchData,
      oxylabs_calls_used: oxylabsCallsUsed,
      progress: { step: 'collected', current: record.max_competitors + 1, total: record.max_competitors + 1, message: 'Data collection complete.' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    return NextResponse.json({
      status: 'collected',
      asins_found: topAsins.length,
      competitors_fetched: competitorsData.filter(c => !c.error).length,
      oxylabs_calls_used: oxylabsCallsUsed,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    // Try to mark as failed
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
