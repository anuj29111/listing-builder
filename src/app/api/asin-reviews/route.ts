import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { fetchReviews, fetchReviewsViaWebScraper, lookupAsin } from '@/lib/oxylabs'
import type { OxylabsReviewItem } from '@/lib/oxylabs'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { asin, country_id, pages, sort_by } = body as {
      asin: string
      country_id: string
      pages?: number
      sort_by?: string
    }

    if (!asin?.trim() || !country_id) {
      return NextResponse.json(
        { error: 'asin and country_id are required' },
        { status: 400 }
      )
    }

    const trimmedAsin = asin.trim().toUpperCase()
    if (!/^[A-Z0-9]{10}$/.test(trimmedAsin)) {
      return NextResponse.json(
        { error: 'Invalid ASIN format (must be 10 alphanumeric characters)' },
        { status: 400 }
      )
    }

    // Fetch country
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')
    // pages=0 means "all", otherwise use requested count (default 10)
    const fetchAll = pages === 0
    const pagesToFetch = fetchAll ? 9999 : (pages || 10)
    const sortBy = sort_by || 'recent'

    // Strategy: Try amazon_reviews source first (full pagination)
    // If unsupported, fall back to amazon_product top reviews
    let allReviews: OxylabsReviewItem[] = []
    let totalReviews: number | null = null
    let overallRating: number | null = null
    let ratingDistribution: Array<{ rating: number; percentage: string }> | null = null
    let rawResponses: Record<string, unknown>[] = []
    let totalPagesAvailable = 0
    let source: 'amazon_reviews' | 'amazon_web_scraper' | 'amazon_product' = 'amazon_reviews'
    let fallbackReason: string | null = null

    // Strategy: Try 3 sources in order:
    // 1. amazon_reviews (dedicated reviews source — requires specific plan)
    // 2. amazon web scraper (scrape reviews page URL directly)
    // 3. amazon_product (top reviews only — last resort)

    const firstResult = await fetchReviews(trimmedAsin, oxylabsDomain, 1, 1, sortBy)
    let useWebScraper = false

    if (!firstResult.success) {
      console.error(
        `[Reviews] amazon_reviews source failed for ${trimmedAsin} on ${oxylabsDomain}:`,
        firstResult.error
      )
      // Try web scraper fallback before amazon_product
      useWebScraper = true
    }

    if (firstResult.success && firstResult.data) {
      // amazon_reviews source works — fetch all requested pages
      source = 'amazon_reviews'
      const data = firstResult.data
      totalReviews = data.reviews_count ?? null
      overallRating = data.rating ?? null
      ratingDistribution = data.rating_stars_distribution ?? null
      totalPagesAvailable = data.pages || 0
      rawResponses.push(data as unknown as Record<string, unknown>)

      if (data.reviews && data.reviews.length > 0) {
        allReviews.push(...data.reviews)
      }

      // Fetch remaining pages if needed
      const maxPages = fetchAll ? (totalPagesAvailable || pagesToFetch) : pagesToFetch
      if (maxPages > 1 && data.reviews && data.reviews.length > 0) {
        const batchSize = 10
        let currentPage = 2
        let pagesRemaining = maxPages - 1

        while (pagesRemaining > 0) {
          const batchPages = Math.min(pagesRemaining, batchSize)
          const result = await fetchReviews(trimmedAsin, oxylabsDomain, currentPage, batchPages, sortBy)

          if (!result.success || !result.data) break

          rawResponses.push(result.data as unknown as Record<string, unknown>)
          if (result.data.reviews && result.data.reviews.length > 0) {
            allReviews.push(...result.data.reviews)
          } else {
            break
          }

          if (result.data.reviews.length < batchPages * 10) break
          currentPage += batchPages
          pagesRemaining -= batchPages
        }
      }
    } else if (useWebScraper) {
      // Fallback #1: Try 'amazon' web scraper source with direct reviews page URL
      console.log(`[Reviews] Trying web scraper fallback for ${trimmedAsin} on ${oxylabsDomain}`)
      const wsResult = await fetchReviewsViaWebScraper(trimmedAsin, oxylabsDomain, 1, sortBy)

      if (wsResult.success && wsResult.data && wsResult.data.reviews?.length > 0) {
        source = 'amazon_web_scraper'
        const data = wsResult.data
        totalReviews = data.reviews_count ?? null
        overallRating = data.rating ?? null
        ratingDistribution = data.rating_stars_distribution ?? null
        totalPagesAvailable = data.pages || 0
        rawResponses.push(data as unknown as Record<string, unknown>)
        allReviews.push(...data.reviews)

        // Fetch remaining pages via web scraper
        const maxPages = fetchAll ? (totalPagesAvailable || pagesToFetch) : pagesToFetch
        if (maxPages > 1) {
          let currentPage = 2
          let pagesRemaining = maxPages - 1

          while (pagesRemaining > 0) {
            const result = await fetchReviewsViaWebScraper(trimmedAsin, oxylabsDomain, currentPage, sortBy)
            if (!result.success || !result.data || !result.data.reviews?.length) break

            rawResponses.push(result.data as unknown as Record<string, unknown>)
            allReviews.push(...result.data.reviews)

            if (result.data.reviews.length < 10) break
            currentPage++
            pagesRemaining--
          }
        }
        fallbackReason = null // Clear since web scraper worked
      } else {
        // Web scraper also failed — log and continue to amazon_product
        console.error(
          `[Reviews] Web scraper also failed for ${trimmedAsin} on ${oxylabsDomain}:`,
          wsResult.error
        )
        fallbackReason = `amazon_reviews: ${firstResult.error || 'unsupported'}; web_scraper: ${wsResult.error || 'no reviews'}`
      }
    }

    // Fallback #2: amazon_product top reviews (last resort)
    if (allReviews.length === 0) {
      source = 'amazon_product'
      const productResult = await lookupAsin(trimmedAsin, oxylabsDomain)

      if (!productResult.success || !productResult.data) {
        return NextResponse.json(
          { error: productResult.error || 'Failed to fetch product data' },
          { status: 502 }
        )
      }

      const product = productResult.data
      totalReviews = product.reviews_count ?? null
      overallRating = product.rating ?? null
      ratingDistribution = (product.rating_stars_distribution ?? []).map((d) => ({
        rating: d.rating,
        percentage: String(d.percentage),
      }))
      totalPagesAvailable = 1
      rawResponses.push({ source: 'amazon_product', reviews: product.reviews })

      // Map product reviews to OxylabsReviewItem format
      if (product.reviews && product.reviews.length > 0) {
        allReviews = product.reviews.map((r) => ({
          id: r.id,
          title: r.title,
          author: r.author,
          rating: r.rating,
          content: r.content,
          timestamp: r.timestamp,
          is_verified: r.is_verified,
          helpful_count: r.helpful_count || 0,
          product_attributes: (r as Record<string, unknown>).product_attributes as string || null,
          images: [],
        }))
      }
    }

    // Deduplicate reviews by id
    const seen = new Set<string>()
    const uniqueReviews = allReviews.filter((r) => {
      if (!r.id || seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    // Upsert into lb_asin_reviews
    const { data: saved, error: saveErr } = await supabase
      .from('lb_asin_reviews')
      .upsert(
        {
          asin: trimmedAsin,
          country_id,
          marketplace_domain: country.amazon_domain,
          total_reviews: totalReviews,
          overall_rating: overallRating,
          rating_stars_distribution: ratingDistribution,
          total_pages_fetched: Math.ceil(uniqueReviews.length / 10) || 1,
          reviews: uniqueReviews,
          raw_response:
            rawResponses.length === 1 ? rawResponses[0] : { batches: rawResponses },
          sort_by: sortBy,
          fetched_by: lbUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'asin,country_id,sort_by' }
      )
      .select('id')
      .single()

    if (saveErr) {
      console.error('Failed to save reviews:', saveErr)
    }

    return NextResponse.json({
      id: saved?.id,
      asin: trimmedAsin,
      marketplace: country.amazon_domain,
      total_reviews: totalReviews,
      overall_rating: overallRating,
      rating_stars_distribution: ratingDistribution,
      total_pages_available: totalPagesAvailable,
      reviews_fetched: uniqueReviews.length,
      reviews: uniqueReviews,
      sort_by: sortBy,
      source,
      fallback_reason: fallbackReason,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get('search')?.trim()
    const country_id = searchParams.get('country_id')

    let query = supabase
      .from('lb_asin_reviews')
      .select(
        'id, asin, country_id, marketplace_domain, total_reviews, overall_rating, total_pages_fetched, sort_by, tags, notes, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50)

    if (search) {
      query = query.ilike('asin', `%${search}%`)
    }
    if (country_id) {
      query = query.eq('country_id', country_id)
    }

    const tag = searchParams.get('tag')
    if (tag) {
      query = query.contains('tags', [tag])
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
