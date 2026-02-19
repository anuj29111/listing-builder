import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { fetchReviews, lookupAsin } from '@/lib/oxylabs'
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
    const pagesToFetch = Math.min(pages || 10, 50)
    const sortBy = sort_by || 'recent'

    // Strategy: Try amazon_reviews source first (full pagination)
    // If unsupported, fall back to amazon_product top reviews
    let allReviews: OxylabsReviewItem[] = []
    let totalReviews: number | null = null
    let overallRating: number | null = null
    let ratingDistribution: Array<{ rating: number; percentage: string }> | null = null
    let rawResponses: Record<string, unknown>[] = []
    let totalPagesAvailable = 0
    let source: 'amazon_reviews' | 'amazon_product' = 'amazon_reviews'

    // Try amazon_reviews first
    const firstResult = await fetchReviews(trimmedAsin, oxylabsDomain, 1, 1, sortBy)

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
      if (pagesToFetch > 1 && data.reviews && data.reviews.length > 0) {
        const batchSize = 10
        let currentPage = 2
        let pagesRemaining = pagesToFetch - 1

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
    } else {
      // Fallback to amazon_product top reviews
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
        'id, asin, country_id, marketplace_domain, total_reviews, overall_rating, total_pages_fetched, sort_by, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50)

    if (search) {
      query = query.ilike('asin', `%${search}%`)
    }
    if (country_id) {
      query = query.eq('country_id', country_id)
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
