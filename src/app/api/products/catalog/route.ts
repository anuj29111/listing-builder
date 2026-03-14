import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const countryId = searchParams.get('country_id')

    // Always fetch products
    const { data: products, error: prodError } = await supabase
      .from('lb_products')
      .select('*')
      .order('display_order', { ascending: true })
      .order('parent_name', { ascending: true, nullsFirst: false })
      .order('product_name')
      .limit(500)

    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 500 })
    }

    // Fetch available country IDs that have lookup data
    const { data: countryRows } = await supabase
      .from('lb_asin_lookups')
      .select('country_id')

    const availableCountryIds = Array.from(
      new Set((countryRows || []).map((r) => r.country_id))
    )

    // If country_id provided, fetch lookup data for that country
    let lookupsByAsin: Record<string, {
      title: string | null
      bullet_points: string | null
      price: number | null
      currency: string | null
      rating: number | null
      reviews_count: number | null
    }> = {}

    if (countryId) {
      const { data: lookups } = await supabase
        .from('lb_asin_lookups')
        .select('asin, title, bullet_points, price, currency, rating, reviews_count')
        .eq('country_id', countryId)

      if (lookups) {
        for (const l of lookups) {
          lookupsByAsin[l.asin] = {
            title: l.title,
            bullet_points: l.bullet_points,
            price: l.price,
            currency: l.currency,
            rating: l.rating,
            reviews_count: l.reviews_count,
          }
        }
      }
    }

    return NextResponse.json({ products, lookupsByAsin, availableCountryIds })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
