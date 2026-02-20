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

// Smart category detection: build keyword → category map from existing products
function buildCategoryMap(
  existingProducts: Array<{ asin: string; product_name: string; category: string }>
): Map<string, string> {
  // Extract meaningful keywords from product names and map them to categories
  const keywordToCategory = new Map<string, { category: string; count: number }>()

  for (const product of existingProducts) {
    if (!product.category || product.category === 'Uncategorized') continue

    // Extract keywords from product name (2+ char words, lowercase)
    const words = product.product_name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 3)

    for (const word of words) {
      const existing = keywordToCategory.get(word)
      if (existing) {
        if (existing.category === product.category) {
          existing.count++
        }
      } else {
        keywordToCategory.set(word, { category: product.category, count: 1 })
      }
    }
  }

  // Only keep keywords that appear 2+ times for the same category (stronger signal)
  const result = new Map<string, string>()
  Array.from(keywordToCategory.entries()).forEach(([keyword, { category, count }]) => {
    if (count >= 1) {
      result.set(keyword, category)
    }
  })

  return result
}

function suggestCategory(
  title: string,
  existingProducts: Array<{ asin: string; product_name: string; category: string }>,
  keywordMap: Map<string, string>
): string | null {
  // 1. Check if this ASIN already exists with a category
  // (handled at the product level, not here)

  // 2. Try to match title keywords against the keyword map
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3)

  // Count category votes from matching keywords
  const categoryVotes = new Map<string, number>()
  for (const word of titleWords) {
    const category = keywordMap.get(word)
    if (category) {
      categoryVotes.set(category, (categoryVotes.get(category) || 0) + 1)
    }
  }

  // Return the category with most votes (if any)
  if (categoryVotes.size > 0) {
    let bestCategory = ''
    let bestVotes = 0
    Array.from(categoryVotes.entries()).forEach(([category, votes]) => {
      if (votes > bestVotes) {
        bestCategory = category
        bestVotes = votes
      }
    })
    if (bestCategory) return bestCategory
  }

  return null
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

    // 4. Get existing products with categories for smart categorization
    const { data: existingProducts } = await supabase
      .from('lb_products')
      .select('asin, product_name, category')

    const existingProductsList = existingProducts || []
    const existingAsins = new Map(
      existingProductsList.map((p) => [p.asin, p])
    )

    // Build keyword → category map
    const keywordMap = buildCategoryMap(existingProductsList)

    // Get unique categories for the dropdown
    const categories = Array.from(
      new Set(existingProductsList.map((p) => p.category).filter(Boolean))
    ).sort()

    // 5. Categorize products with smart category suggestions
    const products = result.data.products.map((p) => {
      const existingProduct = existingAsins.get(p.asin)
      const isBundle = isLikelyBundle(p.title, p.price, p.reviews_count)
      const hasSales = !!(p.price && p.reviews_count && p.reviews_count > 0)

      // Smart category: existing product category > keyword match > null
      let suggested_category: string | null = null
      if (existingProduct?.category) {
        suggested_category = existingProduct.category
      } else {
        suggested_category = suggestCategory(p.title, existingProductsList, keywordMap)
      }

      return {
        ...p,
        is_bundle: isBundle,
        has_sales: hasSales,
        exists_in_system: existingAsins.has(p.asin),
        suggested_category,
      }
    })

    const bundles = products.filter((p) => p.is_bundle)
    const bundlesWithSales = bundles.filter((p) => p.has_sales)
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
      categories,
      summary: {
        total: products.length,
        bundles: bundles.length,
        bundles_with_sales: bundlesWithSales.length,
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
