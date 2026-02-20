import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { fetchSellerProducts } from '@/lib/oxylabs'

// Bundle detection keywords (case-insensitive)
const BUNDLE_KEYWORDS = ['bundle', 'bundled']
const BUNDLE_SEPARATOR = ' + '

function isLikelyBundle(title: string, price: number | null, reviewsCount: number | null): boolean {
  const lower = title.toLowerCase()

  // Explicit bundle keywords
  if (BUNDLE_KEYWORDS.some((kw) => lower.includes(kw))) return true

  // Contains " + " separator between products
  if (title.includes(BUNDLE_SEPARATOR)) return true

  // No price AND no reviews = likely virtual/inactive listing
  if (!price && (!reviewsCount || reviewsCount === 0)) return true

  return false
}

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { country_id } = body as { country_id: string }

    if (!country_id) {
      return NextResponse.json({ error: 'country_id is required' }, { status: 400 })
    }

    // 1. Get seller ID from admin settings
    const { data: sellerIdsSetting } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'seller_ids')
      .single()

    if (!sellerIdsSetting?.value) {
      return NextResponse.json(
        { error: 'No seller IDs configured. Go to Settings → Admin → Amazon Seller IDs to add them.' },
        { status: 400 }
      )
    }

    let sellerIdsMap: Record<string, string>
    try {
      sellerIdsMap = JSON.parse(sellerIdsSetting.value)
    } catch {
      return NextResponse.json({ error: 'Invalid seller IDs configuration' }, { status: 500 })
    }

    const sellerId = sellerIdsMap[country_id]
    if (!sellerId) {
      return NextResponse.json(
        { error: 'No seller ID configured for this marketplace. Go to Settings → Admin → Amazon Seller IDs.' },
        { status: 400 }
      )
    }

    // 2. Get country record for domain mapping
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')

    // 3. Pull products from seller
    const result = await fetchSellerProducts(sellerId, oxylabsDomain)

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch seller products' },
        { status: 500 }
      )
    }

    // 4. Get existing ASINs from lb_products for comparison
    const { data: existingProducts } = await supabase
      .from('lb_products')
      .select('asin')

    const existingAsins = new Set((existingProducts || []).map((p) => p.asin))

    // 5. Categorize products
    const products = result.data.products.map((p) => ({
      ...p,
      is_bundle: isLikelyBundle(p.title, p.price, p.reviews_count),
      exists_in_system: existingAsins.has(p.asin),
    }))

    const bundles = products.filter((p) => p.is_bundle)
    const nonBundles = products.filter((p) => !p.is_bundle)
    const newProducts = nonBundles.filter((p) => !p.exists_in_system)
    const existingInSystem = nonBundles.filter((p) => p.exists_in_system)

    return NextResponse.json({
      products,
      seller_id: sellerId,
      country: {
        id: country.id,
        name: country.name,
        code: country.code,
      },
      summary: {
        total: products.length,
        bundles: bundles.length,
        non_bundles: nonBundles.length,
        already_in_system: existingInSystem.length,
        new: newProducts.length,
        pages_scraped: result.data.pagesScraped,
        total_pages: result.data.totalPages,
      },
    })
  } catch (err) {
    console.error('Seller pull error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
