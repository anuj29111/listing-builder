import { createAdminClient } from '@/lib/supabase/server'

const OXYLABS_TIMEOUT_MS = 60_000 // 60 seconds

/**
 * Full Oxylabs request with timeout — covers connection, response body, AND JSON parsing.
 * Returns parsed JSON or throws on timeout.
 */
async function oxylabsFetch(options: RequestInit, timeoutMs = OXYLABS_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
      ...options,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Oxylabs API error (${response.status}): ${text}`)
    }

    const json = await response.json()
    return json as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

interface OxylabsCredentials {
  username: string
  password: string
}

async function getCredentials(): Promise<OxylabsCredentials> {
  try {
    const adminClient = createAdminClient()
    const [usernameResult, passwordResult] = await Promise.all([
      adminClient
        .from('lb_admin_settings')
        .select('value')
        .eq('key', 'oxylabs_username')
        .single(),
      adminClient
        .from('lb_admin_settings')
        .select('value')
        .eq('key', 'oxylabs_password')
        .single(),
    ])

    if (usernameResult.data?.value && passwordResult.data?.value) {
      return {
        username: usernameResult.data.value,
        password: passwordResult.data.value,
      }
    }
  } catch {
    // DB lookup failed, fall through to env vars
  }

  const username = process.env.OXYLABS_USERNAME
  const password = process.env.OXYLABS_PASSWORD

  if (!username || !password) {
    throw new Error(
      'Oxylabs credentials not found. Set them in Admin Settings or as environment variables (OXYLABS_USERNAME, OXYLABS_PASSWORD).'
    )
  }

  return { username, password }
}

// --- Amazon Product types ---

export interface OxylabsProductResult {
  url: string
  asin: string
  title: string
  manufacturer: string
  product_name: string
  description: string
  bullet_points: string
  rating: number
  price: number
  price_upper: number
  price_sns: number
  price_initial: number
  price_shipping: number
  price_buybox: number
  currency: string
  stock: string
  reviews_count: number
  images: string[]
  category: Array<{ ladder: Array<{ url: string; name: string }> }>
  variation: Array<{
    asin: string
    selected: boolean
    dimensions: Record<string, string>
    tooltip_image: string
  }>
  featured_merchant: {
    name?: string
    seller_id?: string
    link?: string
    is_amazon_fulfilled?: boolean
    shipped_from?: string
  }
  sales_rank: Array<{ rank: number; ladder: Array<{ url: string; name: string }> }>
  is_prime_eligible: boolean
  is_prime_pantry: boolean
  is_addon_item: boolean
  deal_type: string
  coupon: string
  coupon_discount_percentage: number
  discount: { percentage: number }
  amazon_choice: boolean
  parent_asin: string
  answered_questions_count: number
  has_videos: boolean
  sales_volume: string
  max_quantity: number
  pricing_count: number
  pricing_url: string
  pricing_str: string
  product_dimensions: string
  product_details: Record<string, unknown>
  product_overview: Array<{ title: string; description: string }>
  delivery: Array<{ type: string; date: { from: string; by: string } }>
  buybox: Array<{
    name: string
    price: number
    stock: string
    condition: string
    delivery_type: string
    delivery_details: Array<{ type: string; date: { by: string; from: string } }>
  }>
  lightning_deal: {
    percent_claimed: string
    price_text: string
    expires: string
  }
  rating_stars_distribution: Array<{ rating: number; percentage: string }>
  reviews: Array<{
    id: string
    title: string
    author: string
    rating: number
    content: string
    timestamp: string
    is_verified: boolean
    helpful_count: number
  }>
  sns_discounts: unknown[]
  brand: string
  item_form: string
  other_sellers: string
  developer_info: Record<string, unknown>
  store_url: string
  warranty_and_support: {
    description: string
    links: Array<{ title: string; url: string }>
  }
  [key: string]: unknown
}

// --- Amazon Search types ---

export interface OxylabsSearchResultItem {
  asin: string
  url: string
  title: string
  price: number
  price_upper: number
  price_strikethrough: number
  currency: string
  rating: number
  reviews_count: number
  pos: number
  rel_pos: number
  url_image: string
  is_prime: boolean
  is_sponsored: boolean
  is_amazons_choice: boolean
  best_seller: boolean
  manufacturer: string
  pricing_count: number
  sales_volume: string
  coupon_discount: number
  coupon_discount_type: string
  shipping_information: string
  variations: Array<{
    asin: string
    title: string
    price: number
    price_strikethrough: number
    not_available: boolean
  }>
}

export interface OxylabsSearchResponse {
  url: string
  page: number
  pages: number
  query: string
  results: {
    paid: OxylabsSearchResultItem[]
    organic: OxylabsSearchResultItem[]
    suggested: OxylabsSearchResultItem[]
    amazons_choices: OxylabsSearchResultItem[]
  }
  total_results_count: number
  parse_status_code: number
}

// --- Amazon Reviews types ---

export interface OxylabsReviewItem {
  id: string
  title: string
  author: string
  rating: number
  content: string
  timestamp: string
  is_verified: boolean
  helpful_count: number
  product_attributes: string | null
  images: string[]
}

export interface OxylabsReviewsResponse {
  url: string
  asin: string
  page: number
  pages: number
  reviews_count: number
  rating: number
  rating_stars_distribution: Array<{ rating: number; percentage: string }>
  reviews: OxylabsReviewItem[]
  parse_status_code: number
}

// --- Seller Product types ---

export interface SellerProduct {
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

export interface SellerProductsResult {
  products: SellerProduct[]
  totalPages: number
  pagesScraped: number
}

// --- API functions ---

export async function lookupAsin(
  asin: string,
  domain: string
): Promise<{ success: boolean; data?: OxylabsProductResult; error?: string }> {
  try {
    const { username, password } = await getCredentials()

    const json = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'amazon_product',
        domain,
        query: asin,
        parse: true,
      }),
    })

    // Oxylabs returns { results: [{ content: { ... } }] }
    const results = json.results as Array<Record<string, unknown>> | undefined
    const content = results?.[0]?.content
    if (!content) {
      return { success: false, error: 'No results returned from Oxylabs' }
    }

    return { success: true, data: content as OxylabsProductResult }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: `Timed out after ${OXYLABS_TIMEOUT_MS / 1000}s` }
    }
    return { success: false, error: msg }
  }
}

export async function searchKeyword(
  keyword: string,
  domain: string,
  pages: number = 1
): Promise<{ success: boolean; data?: OxylabsSearchResponse; error?: string }> {
  try {
    const { username, password } = await getCredentials()

    const json = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'amazon_search',
        domain,
        query: keyword,
        pages,
        parse: true,
      }),
    })

    const results = json.results as Array<Record<string, unknown>> | undefined
    const content = results?.[0]?.content
    if (!content) {
      return { success: false, error: 'No search results returned from Oxylabs' }
    }

    return { success: true, data: content as OxylabsSearchResponse }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: `Timed out after ${OXYLABS_TIMEOUT_MS / 1000}s` }
    }
    return { success: false, error: msg }
  }
}

export async function fetchReviews(
  asin: string,
  domain: string,
  startPage: number = 1,
  pages: number = 1,
  sortBy: string = 'recent'
): Promise<{ success: boolean; data?: OxylabsReviewsResponse; error?: string }> {
  try {
    const { username, password } = await getCredentials()

    const json = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'amazon_reviews',
        domain,
        query: asin,
        start_page: startPage,
        pages,
        parse: true,
        context: [{ key: 'sort_by', value: sortBy }],
      }),
    })

    const results = json.results as Array<Record<string, unknown>> | undefined
    const content = results?.[0]?.content as Record<string, unknown> | undefined
    if (!content) {
      const statusCode = results?.[0]?.status_code
      console.error(`[fetchReviews] No content for ${asin} on ${domain}. status_code=${statusCode}, results_count=${results?.length}`)
      return { success: false, error: `No reviews content returned (status_code=${statusCode})` }
    }

    return { success: true, data: content as unknown as OxylabsReviewsResponse }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: `Timed out after ${OXYLABS_TIMEOUT_MS / 1000}s` }
    }
    return { success: false, error: msg }
  }
}

// Fallback: fetch reviews via 'amazon' web scraper source with direct reviews page URL
export async function fetchReviewsViaWebScraper(
  asin: string,
  domain: string,
  page: number = 1,
  sortBy: string = 'recent'
): Promise<{ success: boolean; data?: OxylabsReviewsResponse; error?: string }> {
  try {
    const { username, password } = await getCredentials()

    const reviewsUrl = `https://www.amazon.${domain}/product-reviews/${asin}?sortBy=${sortBy}&pageNumber=${page}`

    const json = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'amazon',
        url: reviewsUrl,
        parse: true,
      }),
    })

    const results = json.results as Array<Record<string, unknown>> | undefined
    const result = results?.[0]
    const content = result?.content as Record<string, unknown> | undefined

    if (!content) {
      const statusCode = result?.status_code
      console.error(`[fetchReviewsViaWebScraper] No content for ${asin} on ${domain}. status_code=${statusCode}`)
      return { success: false, error: `No content from web scraper (status_code=${statusCode})` }
    }

    // The 'amazon' source with a reviews page URL should return parsed review data
    // Map to OxylabsReviewsResponse format
    const reviews: OxylabsReviewItem[] = ((content.reviews || []) as Array<Record<string, unknown>>).map((r: Record<string, unknown>) => ({
      id: String(r.id || r.review_id || ''),
      title: String(r.title || ''),
      author: String(r.author || ''),
      rating: Number(r.rating || 0),
      content: String(r.content || r.text || ''),
      timestamp: String(r.timestamp || r.date || ''),
      is_verified: Boolean(r.is_verified || r.verified_purchase),
      helpful_count: Number(r.helpful_count || r.helpful_votes || 0),
      product_attributes: r.product_attributes ? String(r.product_attributes) : null,
      images: Array.isArray(r.images) ? r.images.map(String) : [],
    }))

    return {
      success: true,
      data: {
        url: (content.url as string) || reviewsUrl,
        asin: (content.asin as string) || asin,
        page: (content.page as number) || page,
        pages: (content.pages as number) || (content.last_page as number) || 0,
        reviews_count: (content.reviews_count as number) || (content.total_reviews as number) || 0,
        rating: (content.rating as number) || 0,
        rating_stars_distribution: (content.rating_stars_distribution || content.rating_distribution || []) as Array<{ rating: number; percentage: string }>,
        reviews,
        parse_status_code: (content.parse_status_code as number) || 12000,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: `Timed out after ${OXYLABS_TIMEOUT_MS / 1000}s` }
    }
    return { success: false, error: msg }
  }
}

// --- Amazon Q&A types ---

export interface OxylabsQnAItem {
  question: string
  answer: string
  votes: number
  author?: string
  date?: string
}

export interface OxylabsQnAResponse {
  url: string
  asin: string
  page: number
  pages: number
  questions: OxylabsQnAItem[]
  parse_status_code: number
}

export async function fetchQuestions(
  asin: string,
  domain: string,
  pages: number = 1
): Promise<{ success: boolean; data?: OxylabsQnAResponse; error?: string }> {
  try {
    const { username, password } = await getCredentials()

    const json = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: JSON.stringify({
        source: 'amazon_questions',
        domain,
        query: asin,
        pages,
        parse: true,
      }),
    })

    const results = json.results as Array<Record<string, unknown>> | undefined
    const content = results?.[0]?.content
    if (!content) {
      return { success: false, error: 'No Q&A data returned from Oxylabs' }
    }

    return { success: true, data: content as OxylabsQnAResponse }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: `Timed out after ${OXYLABS_TIMEOUT_MS / 1000}s` }
    }
    return { success: false, error: msg }
  }
}

// --- Seller Product Pull ---

export async function fetchSellerProducts(
  sellerId: string,
  domain: string,
  maxPages: number = 20
): Promise<{ success: boolean; data?: SellerProductsResult; error?: string }> {
  const { username, password } = await getCredentials()
  const authHeader =
    'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')

  const allProducts: SellerProduct[] = []
  const seen = new Set<string>()
  let totalPages = 0
  let pagesScraped = 0

  // Paginate in batches of 3 to avoid rate limits
  const batchSize = 3

  for (let startPage = 1; startPage <= maxPages; startPage += batchSize) {
    const pagesToFetch = Math.min(batchSize, maxPages - startPage + 1)

    let json: Record<string, unknown>
    try {
      json = await oxylabsFetch({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          source: 'amazon_search',
          domain,
          query: ' ',
          start_page: startPage,
          pages: pagesToFetch,
          parse: true,
          context: [{ key: 'merchant_id', value: sellerId }],
        }),
      })
    } catch (err) {
      // If we have some results, return what we have
      if (allProducts.length > 0) {
        return {
          success: true,
          data: { products: allProducts, totalPages, pagesScraped },
        }
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Oxylabs API error',
      }
    }

    if (json.message) {
      // Rate limit or other error from Oxylabs
      if (allProducts.length > 0) {
        return {
          success: true,
          data: { products: allProducts, totalPages, pagesScraped },
        }
      }
      return { success: false, error: json.message as string }
    }

    const results = (json.results || []) as Array<Record<string, unknown>>
    let foundProducts = false

    for (const result of results) {
      const content = result?.content as Record<string, unknown> | undefined
      if (!content || typeof content !== 'object') continue

      pagesScraped++

      // Capture total pages from first result
      if (totalPages === 0 && content.last_visible_page) {
        totalPages = content.last_visible_page as number
      }

      const contentResults = content.results as Record<string, unknown> | undefined
      const organic = ((contentResults?.organic || []) as Array<Record<string, unknown>>)
      for (const item of organic) {
        const asin = item.asin as string
        if (!asin || seen.has(asin)) continue
        seen.add(asin)
        foundProducts = true

        allProducts.push({
          asin,
          title: (item.title as string) || '',
          price: (item.price as number) ?? null,
          rating: (item.rating as number) ?? null,
          reviews_count: (item.reviews_count as number) ?? null,
          is_prime: (item.is_prime as boolean) ?? false,
          url_image: (item.url_image as string) ?? null,
          manufacturer: (item.manufacturer as string) ?? null,
          sales_volume: (item.sales_volume as string) ?? null,
        })
      }
    }

    // Stop if we've reached the last page or no products found
    if (!foundProducts || startPage + pagesToFetch - 1 >= totalPages) {
      break
    }

    // Delay between batches to avoid rate limits
    if (startPage + batchSize <= maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  return {
    success: true,
    data: { products: allProducts, totalPages, pagesScraped },
  }
}
