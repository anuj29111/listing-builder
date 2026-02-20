import { createAdminClient } from '@/lib/supabase/server'

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
  const { username, password } = await getCredentials()

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
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

  if (!response.ok) {
    const text = await response.text()
    return {
      success: false,
      error: `Oxylabs API error (${response.status}): ${text}`,
    }
  }

  const json = await response.json()

  // Oxylabs returns { results: [{ content: { ... } }] }
  const content = json.results?.[0]?.content
  if (!content) {
    return { success: false, error: 'No results returned from Oxylabs' }
  }

  return { success: true, data: content as OxylabsProductResult }
}

export async function searchKeyword(
  keyword: string,
  domain: string,
  pages: number = 1
): Promise<{ success: boolean; data?: OxylabsSearchResponse; error?: string }> {
  const { username, password } = await getCredentials()

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
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

  if (!response.ok) {
    const text = await response.text()
    return {
      success: false,
      error: `Oxylabs API error (${response.status}): ${text}`,
    }
  }

  const json = await response.json()

  const content = json.results?.[0]?.content
  if (!content) {
    return { success: false, error: 'No search results returned from Oxylabs' }
  }

  return { success: true, data: content as OxylabsSearchResponse }
}

export async function fetchReviews(
  asin: string,
  domain: string,
  startPage: number = 1,
  pages: number = 1,
  sortBy: string = 'recent'
): Promise<{ success: boolean; data?: OxylabsReviewsResponse; error?: string }> {
  const { username, password } = await getCredentials()

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
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

  if (!response.ok) {
    const text = await response.text()
    return {
      success: false,
      error: `Oxylabs API error (${response.status}): ${text}`,
    }
  }

  const json = await response.json()

  const content = json.results?.[0]?.content
  if (!content) {
    return { success: false, error: 'No reviews returned from Oxylabs' }
  }

  return { success: true, data: content as OxylabsReviewsResponse }
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
  const { username, password } = await getCredentials()

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
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

  if (!response.ok) {
    const text = await response.text()
    return {
      success: false,
      error: `Oxylabs API error (${response.status}): ${text}`,
    }
  }

  const json = await response.json()

  const content = json.results?.[0]?.content
  if (!content) {
    return { success: false, error: 'No Q&A data returned from Oxylabs' }
  }

  return { success: true, data: content as OxylabsQnAResponse }
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

    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
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

    if (!response.ok) {
      const text = await response.text()
      // If rate limited but we have some results, return what we have
      if (allProducts.length > 0) {
        return {
          success: true,
          data: { products: allProducts, totalPages, pagesScraped },
        }
      }
      return {
        success: false,
        error: `Oxylabs API error (${response.status}): ${text}`,
      }
    }

    const json = await response.json()

    if (json.message) {
      // Rate limit or other error from Oxylabs
      if (allProducts.length > 0) {
        return {
          success: true,
          data: { products: allProducts, totalPages, pagesScraped },
        }
      }
      return { success: false, error: json.message }
    }

    const results = json.results || []
    let foundProducts = false

    for (const result of results) {
      const content = result?.content
      if (!content || typeof content !== 'object') continue

      pagesScraped++

      // Capture total pages from first result
      if (totalPages === 0 && content.last_visible_page) {
        totalPages = content.last_visible_page
      }

      const organic = content.results?.organic || []
      for (const item of organic) {
        const asin = item.asin
        if (!asin || seen.has(asin)) continue
        seen.add(asin)
        foundProducts = true

        allProducts.push({
          asin,
          title: item.title || '',
          price: item.price ?? null,
          rating: item.rating ?? null,
          reviews_count: item.reviews_count ?? null,
          is_prime: item.is_prime ?? false,
          url_image: item.url_image ?? null,
          manufacturer: item.manufacturer ?? null,
          sales_volume: item.sales_volume ?? null,
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
