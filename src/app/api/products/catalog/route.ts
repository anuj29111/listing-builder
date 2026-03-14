import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { CatalogProductData } from '@/types/database'

// Currency map for seller-pull fallback (pull_result has no currency field)
const COUNTRY_CURRENCY: Record<string, string> = {
  US: '$', CA: 'CA$', UK: '£', DE: '€', FR: '€', AE: 'AED ', AU: 'A$', IT: '€', ES: '€', MX: 'MX$',
}

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

    let lookupsByAsin: Record<string, CatalogProductData> = {}

    if (countryId) {
      // 1. Fetch scraped lookup data (preferred source)
      const { data: lookups } = await supabase
        .from('lb_asin_lookups')
        .select('asin, title, bullet_points, price, currency, rating, reviews_count, images')
        .eq('country_id', countryId)

      if (lookups) {
        for (const l of lookups) {
          const images = l.images as string[] | null
          lookupsByAsin[l.asin] = {
            title: l.title,
            bullet_points: l.bullet_points,
            price: l.price,
            currency: l.currency,
            rating: l.rating,
            reviews_count: l.reviews_count,
            image_url: images && images.length > 0 ? images[0] : null,
            source: 'lookup',
          }
        }
      }

      // 2. Fetch seller-pull data as fallback (for ASINs not in lookups)
      const { data: pullJob } = await supabase
        .from('lb_seller_pull_jobs')
        .select('pull_result')
        .eq('country_id', countryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pullJob?.pull_result?.products) {
        // Get country code for currency inference
        const { data: country } = await supabase
          .from('lb_countries')
          .select('code')
          .eq('id', countryId)
          .single()

        const currencySymbol = country ? (COUNTRY_CURRENCY[country.code] || '$') : '$'

        interface PullProduct {
          asin: string
          title?: string
          price?: string
          rating?: string
          reviews_count?: string
          url_image?: string
          sales_volume?: string
        }

        for (const p of pullJob.pull_result.products as PullProduct[]) {
          if (!p.asin || lookupsByAsin[p.asin]) continue // Skip if already have lookup data
          lookupsByAsin[p.asin] = {
            title: p.title || null,
            bullet_points: null, // pull_result doesn't have bullets
            price: p.price ? parseFloat(p.price) : null,
            currency: currencySymbol,
            rating: p.rating ? parseFloat(p.rating) : null,
            reviews_count: p.reviews_count ? parseInt(p.reviews_count, 10) : null,
            image_url: p.url_image || null,
            source: 'pull',
          }
        }
      }
    }

    return NextResponse.json({ products, lookupsByAsin })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
