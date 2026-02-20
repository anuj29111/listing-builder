import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { lookupAsin } from '@/lib/oxylabs'

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

    // Get country for domain
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')

    const results: Array<{
      asin: string
      success: boolean
      error?: string
      parent_asin?: string
      title?: string
    }> = []

    // Sequential lookups with delay
    for (const rawAsin of asins) {
      const asin = rawAsin.trim().toUpperCase()

      try {
        const result = await lookupAsin(asin, oxylabsDomain)

        if (!result.success || !result.data) {
          results.push({ asin, success: false, error: result.error || 'No data returned' })
          continue
        }

        const data = result.data

        // Upsert into lb_asin_lookups
        const { error: upsertErr } = await supabase
          .from('lb_asin_lookups')
          .upsert(
            {
              asin,
              country_id: country.id,
              marketplace_domain: country.amazon_domain,
              title: data.title || null,
              brand: data.brand || data.manufacturer || null,
              price: data.price ?? null,
              price_upper: data.price_upper ?? null,
              price_sns: data.price_sns ?? null,
              price_initial: data.price_initial ?? null,
              price_shipping: data.price_shipping ?? null,
              currency: data.currency || null,
              rating: data.rating ?? null,
              reviews_count: data.reviews_count ?? null,
              bullet_points: data.bullet_points || null,
              description: data.description || null,
              images: data.images || null,
              sales_rank: data.sales_rank || null,
              category: data.category || null,
              featured_merchant: data.featured_merchant || null,
              variations: data.variation || null,
              is_prime_eligible: data.is_prime_eligible ?? false,
              stock: data.stock || null,
              deal_type: data.deal_type || null,
              coupon: data.coupon || null,
              coupon_discount_percentage: data.coupon_discount_percentage ?? null,
              discount_percentage: data.discount?.percentage ?? null,
              amazon_choice: data.amazon_choice ?? false,
              parent_asin: data.parent_asin || null,
              answered_questions_count: data.answered_questions_count ?? null,
              has_videos: data.has_videos ?? false,
              sales_volume: data.sales_volume || null,
              max_quantity: data.max_quantity ?? null,
              pricing_count: data.pricing_count ?? null,
              product_dimensions: data.product_dimensions || null,
              product_details: data.product_details || null,
              product_overview: data.product_overview || null,
              delivery: data.delivery || null,
              buybox: data.buybox || null,
              lightning_deal: data.lightning_deal || null,
              rating_stars_distribution: data.rating_stars_distribution || null,
              sns_discounts: data.sns_discounts || null,
              top_reviews: data.reviews || null,
              raw_response: { results: [{ content: data }] },
              lookup_by: lbUser.id,
            },
            { onConflict: 'asin,country_id' }
          )

        if (upsertErr) {
          results.push({ asin, success: false, error: upsertErr.message })
        } else {
          results.push({
            asin,
            success: true,
            parent_asin: data.parent_asin || undefined,
            title: data.title || undefined,
          })

          // Also update lb_products with parent_asin if we discovered one
          if (data.parent_asin) {
            await supabase
              .from('lb_products')
              .update({
                parent_asin: data.parent_asin,
                brand: data.brand || data.manufacturer || undefined,
              })
              .eq('asin', asin)
          }
        }
      } catch (err) {
        results.push({
          asin,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }

      // Delay between lookups
      if (asins.indexOf(rawAsin) < asins.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    // Collect unique parent ASINs for variation discovery
    const parentAsins = Array.from(
      new Set(
        successful
          .map((r) => r.parent_asin)
          .filter((pa): pa is string => !!pa)
      )
    )

    return NextResponse.json({
      results,
      summary: {
        total: asins.length,
        successful: successful.length,
        failed: failed.length,
        unique_parent_asins: parentAsins.length,
        parent_asins: parentAsins,
      },
    })
  } catch (err) {
    console.error('Seller pull scrape error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
