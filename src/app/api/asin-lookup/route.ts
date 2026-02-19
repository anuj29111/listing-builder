import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { lookupAsin } from '@/lib/oxylabs'
import type { OxylabsProductResult } from '@/lib/oxylabs'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { asins, country_id } = body as {
      asins: string[]
      country_id: string
    }

    if (!asins?.length || !country_id) {
      return NextResponse.json(
        { error: 'asins (array) and country_id are required' },
        { status: 400 }
      )
    }
    if (asins.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 ASINs per request' },
        { status: 400 }
      )
    }

    // Fetch country to get amazon_domain
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    // Derive Oxylabs domain from amazon_domain
    // amazon.com → com, amazon.co.uk → co.uk, amazon.com.mx → com.mx
    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')

    const results: Array<{
      asin: string
      success: boolean
      error?: string
      data?: OxylabsProductResult
      saved_id?: string
    }> = []

    // Lookup each ASIN sequentially to respect rate limits
    for (const rawAsin of asins) {
      const asin = rawAsin.trim().toUpperCase()
      if (!/^[A-Z0-9]{10}$/.test(asin)) {
        results.push({ asin, success: false, error: 'Invalid ASIN format (must be 10 alphanumeric characters)' })
        continue
      }

      const result = await lookupAsin(asin, oxylabsDomain)

      if (!result.success || !result.data) {
        results.push({ asin, success: false, error: result.error || 'Unknown error' })
        continue
      }

      const data = result.data

      // Upsert into lb_asin_lookups
      const { data: saved, error: saveErr } = await supabase
        .from('lb_asin_lookups')
        .upsert(
          {
            asin,
            country_id,
            marketplace_domain: country.amazon_domain,
            raw_response: data,
            title: data.title || null,
            brand: data.manufacturer || null,
            price: data.price || data.price_buybox || null,
            currency: data.currency || null,
            rating: data.rating || null,
            reviews_count: data.reviews_count || null,
            bullet_points: data.bullet_points || null,
            description: data.description || null,
            images: data.images || [],
            sales_rank: data.sales_rank || [],
            category: data.category || [],
            featured_merchant: data.featured_merchant || null,
            variations: data.variation || [],
            is_prime_eligible: data.is_prime_eligible ?? null,
            stock: data.stock || null,
            lookup_by: lbUser.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'asin,country_id' }
        )
        .select('id')
        .single()

      if (saveErr) {
        console.error('Failed to save ASIN lookup:', saveErr)
      }

      results.push({
        asin,
        success: true,
        data,
        saved_id: saved?.id,
      })
    }

    return NextResponse.json({ results })
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
      .from('lb_asin_lookups')
      .select(
        'id, asin, country_id, marketplace_domain, title, brand, price, currency, rating, reviews_count, images, sales_rank, is_prime_eligible, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(100)

    if (search) {
      query = query.or(
        `asin.ilike.%${search}%,title.ilike.%${search}%,brand.ilike.%${search}%`
      )
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
