import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { lookupAsin } from '@/lib/oxylabs'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { parent_asins, country_id } = body as {
      parent_asins: string[]
      country_id: string
    }

    if (!parent_asins?.length || !country_id) {
      return NextResponse.json(
        { error: 'parent_asins (array) and country_id are required' },
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

    // Get existing ASINs from lb_products
    const { data: existingProducts } = await supabase
      .from('lb_products')
      .select('asin')

    const existingAsins = new Set((existingProducts || []).map((p) => p.asin))

    // Check if we already have the parent ASIN data in lb_asin_lookups
    const { data: cachedLookups } = await supabase
      .from('lb_asin_lookups')
      .select('asin, variations, raw_response')
      .in('asin', parent_asins)
      .eq('country_id', country_id)

    const cachedMap = new Map(
      (cachedLookups || []).map((l) => [l.asin, l])
    )

    interface DiscoveredVariation {
      asin: string
      title: string
      parent_asin: string
      is_new: boolean
      dimensions?: Record<string, string>
    }

    const allVariations: DiscoveredVariation[] = []
    const errors: Array<{ parent_asin: string; error: string }> = []

    for (const parentAsin of parent_asins) {
      try {
        // Check cache first
        const cached = cachedMap.get(parentAsin)
        let variations: Array<{
          asin: string
          title?: string
          dimensions?: Record<string, string>
        }> = []

        if (cached?.variations && Array.isArray(cached.variations)) {
          variations = cached.variations as typeof variations
        } else {
          // Need to look up the parent ASIN
          const result = await lookupAsin(parentAsin, oxylabsDomain)
          if (!result.success || !result.data) {
            errors.push({
              parent_asin: parentAsin,
              error: result.error || 'No data returned',
            })
            continue
          }

          variations = (result.data.variation || []).map((v) => ({
            asin: v.asin,
            dimensions: v.dimensions,
          }))

          // Delay between lookups
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        for (const v of variations) {
          if (!v.asin) continue
          allVariations.push({
            asin: v.asin,
            title: v.title || '',
            parent_asin: parentAsin,
            is_new: !existingAsins.has(v.asin),
            dimensions: v.dimensions,
          })
        }
      } catch (err) {
        errors.push({
          parent_asin: parentAsin,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const newVariations = allVariations.filter((v) => v.is_new)
    const existingVariations = allVariations.filter((v) => !v.is_new)

    return NextResponse.json({
      variations: allVariations,
      summary: {
        parent_asins_checked: parent_asins.length,
        total_variations_found: allVariations.length,
        new_variations: newVariations.length,
        already_in_system: existingVariations.length,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('Variation discovery error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
