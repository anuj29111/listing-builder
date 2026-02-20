import { createAdminClient } from '@/lib/supabase/server'
import { fetchSellerProducts, lookupAsin } from '@/lib/oxylabs'
import type { SellerPullProduct, SellerPullScrapeResult } from '@/types'

// ─── Bundle Detection ─────────────────────────────────

const BUNDLE_KEYWORDS = ['bundle', 'bundled']
const BUNDLE_SEPARATOR = ' + '

export function isLikelyBundle(title: string, price: number | null, reviewsCount: number | null): boolean {
  const lower = title.toLowerCase()
  if (BUNDLE_KEYWORDS.some((kw) => lower.includes(kw))) return true
  if (title.includes(BUNDLE_SEPARATOR)) return true
  if (!price && (!reviewsCount || reviewsCount === 0)) return true
  return false
}

// ─── Category Matching ────────────────────────────────

export function buildCategoryMap(
  existingProducts: Array<{ asin: string; product_name: string; category: string }>
): Map<string, string> {
  const keywordToCategory = new Map<string, { category: string; count: number }>()

  for (const product of existingProducts) {
    if (!product.category || product.category === 'Uncategorized') continue

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

  const result = new Map<string, string>()
  Array.from(keywordToCategory.entries()).forEach(([keyword, { category, count }]) => {
    if (count >= 1) {
      result.set(keyword, category)
    }
  })

  return result
}

export function suggestCategory(
  title: string,
  keywordMap: Map<string, string>
): string | null {
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3)

  const categoryVotes = new Map<string, number>()
  for (const word of titleWords) {
    const category = keywordMap.get(word)
    if (category) {
      categoryVotes.set(category, (categoryVotes.get(category) || 0) + 1)
    }
  }

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

// ─── Product Classification ───────────────────────────

interface RawSellerProduct {
  asin: string
  title: string
  price: number | null
  rating: number | null
  reviews_count: number | null
  is_prime: boolean
  url_image: string | null
  manufacturer: string | null
  sales_volume: string | null
}

export function classifyProducts(
  rawProducts: RawSellerProduct[],
  existingProducts: Array<{ asin: string; product_name: string; category: string }>
): {
  products: SellerPullProduct[]
  categories: string[]
  summary: {
    total: number
    bundles: number
    bundles_with_sales: number
    non_bundles: number
    already_in_system: number
    new: number
    pages_scraped: number
    total_pages: number
  }
  autoSelectedAsins: string[]
  autoCategories: Record<string, string>
} {
  const existingAsins = new Map(existingProducts.map((p) => [p.asin, p]))
  const keywordMap = buildCategoryMap(existingProducts)
  const categories = Array.from(
    new Set(existingProducts.map((p) => p.category).filter(Boolean))
  ).sort()

  const products: SellerPullProduct[] = rawProducts.map((p) => {
    const existingProduct = existingAsins.get(p.asin)
    const isBundleResult = isLikelyBundle(p.title, p.price, p.reviews_count)
    const hasSales = !!(p.price && p.reviews_count && p.reviews_count > 0)

    let suggested_category: string | null = null
    if (existingProduct?.category) {
      suggested_category = existingProduct.category
    } else {
      suggested_category = suggestCategory(p.title, keywordMap)
    }

    return {
      ...p,
      is_bundle: isBundleResult,
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

  // Auto-select non-bundle new products
  const autoSelectedAsins = newProducts.map((p) => p.asin)

  // Auto-assign categories from suggestions
  const autoCategories: Record<string, string> = {}
  for (const p of products) {
    if (p.suggested_category) {
      autoCategories[p.asin] = p.suggested_category
    }
  }

  return {
    products,
    categories,
    summary: {
      total: products.length,
      bundles: bundles.length,
      bundles_with_sales: bundlesWithSales.length,
      non_bundles: nonBundles.length,
      already_in_system: existingInSystem.length,
      new: newProducts.length,
      pages_scraped: 0, // filled by caller
      total_pages: 0,   // filled by caller
    },
    autoSelectedAsins,
    autoCategories,
  }
}

// ─── Background Workers ───────────────────────────────

async function updateJob(jobId: string, updates: Record<string, unknown>) {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('lb_seller_pull_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId)

  if (error) {
    console.error(`Failed to update seller pull job ${jobId}:`, error)
  }
}

/**
 * Background pull: fetches seller products from Oxylabs, classifies them,
 * and updates the job row with results. Runs as fire-and-forget.
 */
export async function backgroundPull(
  jobId: string,
  sellerId: string,
  oxylabsDomain: string,
  countryId: string,
  country: { id: string; name: string; code: string }
): Promise<void> {
  try {
    const adminClient = createAdminClient()

    // Fetch from Oxylabs
    const result = await fetchSellerProducts(sellerId, oxylabsDomain)
    if (!result.success || !result.data) {
      await updateJob(jobId, {
        status: 'failed',
        error: result.error || 'Failed to fetch seller products',
      })
      return
    }

    // Get existing products for classification
    const { data: existingProducts } = await adminClient
      .from('lb_products')
      .select('asin, product_name, category')

    const classified = classifyProducts(
      result.data.products,
      existingProducts || []
    )

    // Fill in pagination info
    classified.summary.pages_scraped = result.data.pagesScraped
    classified.summary.total_pages = result.data.totalPages

    await updateJob(jobId, {
      status: 'pulled',
      pull_result: {
        products: classified.products,
        summary: classified.summary,
        categories: classified.categories,
        country: { id: country.id, name: country.name, code: country.code },
      },
      selected_asins: classified.autoSelectedAsins,
      product_categories: classified.autoCategories,
    })

    console.log(`[Seller Pull Job ${jobId}] Pull complete: ${classified.products.length} products`)
  } catch (error) {
    console.error(`[Seller Pull Job ${jobId}] Pull failed:`, error)
    await updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error during pull',
    })
  }
}

/**
 * Background scrape: looks up each ASIN via Oxylabs, upserts to lb_asin_lookups,
 * updates progress after each batch. Auto-chains to variation discovery if parent ASINs found.
 */
export async function backgroundScrape(
  jobId: string,
  asins: string[],
  countryId: string,
  oxylabsDomain: string,
  amazonDomain: string,
  userId: string
): Promise<void> {
  try {
    const adminClient = createAdminClient()
    const results: SellerPullScrapeResult[] = []
    const batchSize = 5

    for (let i = 0; i < asins.length; i += batchSize) {
      const batch = asins.slice(i, i + batchSize)

      for (const rawAsin of batch) {
        const asin = rawAsin.trim().toUpperCase()

        try {
          const result = await lookupAsin(asin, oxylabsDomain)

          if (!result.success || !result.data) {
            results.push({ asin, success: false, error: result.error || 'No data returned' })
            continue
          }

          const data = result.data

          // Upsert into lb_asin_lookups
          const { error: upsertErr } = await adminClient
            .from('lb_asin_lookups')
            .upsert(
              {
                asin,
                country_id: countryId,
                marketplace_domain: amazonDomain,
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
                lookup_by: userId,
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

            // Update lb_products with parent_asin if discovered
            if (data.parent_asin) {
              await adminClient
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

        // Delay between lookups (except last in batch)
        if (batch.indexOf(rawAsin) < batch.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      // Update progress after each batch
      await updateJob(jobId, {
        scrape_results: results,
        scrape_progress: { current: Math.min(i + batchSize, asins.length), total: asins.length },
      })

      // Delay between batches
      if (i + batchSize < asins.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Check for parent ASINs
    const parentAsins = Array.from(
      new Set(
        results
          .filter((r) => r.success && r.parent_asin)
          .map((r) => r.parent_asin!)
      )
    )

    if (parentAsins.length > 0) {
      console.log(`[Seller Pull Job ${jobId}] Scrape complete, found ${parentAsins.length} parent ASINs. Starting variation discovery...`)
      await updateJob(jobId, {
        status: 'discovering_variations',
        scrape_results: results,
        scrape_progress: { current: asins.length, total: asins.length },
      })
      // Auto-chain to variation discovery
      await backgroundDiscoverVariations(jobId, parentAsins, countryId, oxylabsDomain)
    } else {
      console.log(`[Seller Pull Job ${jobId}] Scrape complete, no parent ASINs found. Done.`)
      await updateJob(jobId, {
        status: 'done',
        scrape_results: results,
        scrape_progress: { current: asins.length, total: asins.length },
      })
    }
  } catch (error) {
    console.error(`[Seller Pull Job ${jobId}] Scrape failed:`, error)
    await updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error during scrape',
    })
  }
}

/**
 * Background variation discovery: looks up parent ASINs to find sibling variations.
 * If new variations found, sets status to awaiting_variation_selection. Otherwise done.
 */
export async function backgroundDiscoverVariations(
  jobId: string,
  parentAsins: string[],
  countryId: string,
  oxylabsDomain: string
): Promise<void> {
  try {
    const adminClient = createAdminClient()

    // Get existing ASINs from lb_products
    const { data: existingProducts } = await adminClient
      .from('lb_products')
      .select('asin')

    const existingAsins = new Set((existingProducts || []).map((p: { asin: string }) => p.asin))

    // Check cache in lb_asin_lookups
    const { data: cachedLookups } = await adminClient
      .from('lb_asin_lookups')
      .select('asin, variations, raw_response')
      .in('asin', parentAsins)
      .eq('country_id', countryId)

    const cachedMap = new Map(
      (cachedLookups || []).map((l: { asin: string; variations: unknown; raw_response: unknown }) => [l.asin, l])
    )

    interface DiscoveredVariation {
      asin: string
      title: string
      parent_asin: string
      is_new: boolean
      dimensions?: Record<string, string>
    }

    const allVariations: DiscoveredVariation[] = []

    for (const parentAsin of parentAsins) {
      try {
        const cached = cachedMap.get(parentAsin)
        let variations: Array<{
          asin: string
          title?: string
          dimensions?: Record<string, string>
        }> = []

        if (cached?.variations && Array.isArray(cached.variations)) {
          variations = cached.variations as typeof variations
        } else {
          const result = await lookupAsin(parentAsin, oxylabsDomain)
          if (!result.success || !result.data) {
            continue
          }

          variations = (result.data.variation || []).map((v: { asin: string; dimensions?: Record<string, string> }) => ({
            asin: v.asin,
            dimensions: v.dimensions,
          }))

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
      } catch {
        // Skip this parent, continue with others
      }
    }

    const newVariations = allVariations.filter((v) => v.is_new)

    if (newVariations.length > 0) {
      console.log(`[Seller Pull Job ${jobId}] Found ${newVariations.length} new variations. Awaiting selection.`)
      await updateJob(jobId, {
        status: 'awaiting_variation_selection',
        variation_results: allVariations,
        selected_variations: newVariations.map((v) => v.asin),
      })
    } else {
      console.log(`[Seller Pull Job ${jobId}] No new variations found. Done.`)
      await updateJob(jobId, {
        status: 'done',
        variation_results: allVariations,
      })
    }
  } catch (error) {
    console.error(`[Seller Pull Job ${jobId}] Variation discovery failed:`, error)
    await updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error during variation discovery',
    })
  }
}
