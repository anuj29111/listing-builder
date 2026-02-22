import { createAdminClient } from '@/lib/supabase/server'

const APIFY_MAX_WAIT_SECS = 300 // 5 minutes total max wait
const APIFY_POLL_WAIT_SECS = 60 // Long-poll up to 60s per poll request

// Actor: delicious_zebu/amazon-reviews-scraper-with-advanced-filters
const ACTOR_ID = 'delicious_zebu~amazon-reviews-scraper-with-advanced-filters'

// --- Output types from the actor ---

export interface ApifyReviewItem {
  PageUrl: string
  ProductLink: string
  ASIN: string
  Brand: string
  ProductTitle: string
  ParentId: string
  ReviewDate: string
  Images: string[]
  Score: number
  Reviewer: string
  ReviewerUrl?: string
  ReviewTitle: string
  ReviewContent: string
  Verified: string
  Variant: string
  VariantASIN: string
  HelpfulCounts: number
  TotalRating?: number
  TotalReviewCount?: number
  RatingDistribution?: Record<string, string>
  CustomersSay?: string
  ReviewAspects?: Array<{
    aspect: string
    positive: number
    negative: number
    mixed?: number
    total?: number
  }>
}

export interface ApifyRunResult {
  id: string
  status: string
  defaultDatasetId: string
  statusMessage: string
  stats: {
    computeUnits: number
    durationMillis: number
  }
}

export interface ApifyReviewsResult {
  reviews: ApifyReviewItem[]
  customersSay: string | null
  reviewAspects: Array<Record<string, unknown>> | null
  totalFetched: number
  runId: string
  datasetId: string
  status: string
  computeUnits: number
  durationMs: number
}

// --- Token retrieval ---

async function getApifyToken(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'apify_api_token')
      .single()

    if (data?.value) return data.value
  } catch {
    // Fall through to env var
  }

  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    throw new Error(
      'Apify API token not found. Set it in Admin Settings or as APIFY_API_TOKEN environment variable.'
    )
  }
  return token
}

// --- Run management ---

async function startActorRun(
  token: string,
  input: Record<string, unknown>
): Promise<ApifyRunResult> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?waitForFinish=${APIFY_POLL_WAIT_SECS}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Apify API error (${response.status}): ${text}`)
  }

  const result = (await response.json()) as { data: ApifyRunResult }
  return result.data
}

async function pollRunUntilDone(
  token: string,
  runId: string
): Promise<ApifyRunResult> {
  const startTime = Date.now()
  const maxWaitMs = APIFY_MAX_WAIT_SECS * 1000

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?waitForFinish=${APIFY_POLL_WAIT_SECS}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to poll run status: ${response.status}`)
    }

    const result = (await response.json()) as { data: ApifyRunResult }
    const { status } = result.data

    if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(status)) {
      return result.data
    }

    // Short pause before next long-poll
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Apify run did not complete within ${APIFY_MAX_WAIT_SECS}s`)
}

async function fetchDatasetItems(
  token: string,
  datasetId: string
): Promise<ApifyReviewItem[]> {
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset items: ${response.status}`)
  }

  return (await response.json()) as ApifyReviewItem[]
}

// --- Main fetch function ---

export async function fetchReviewsViaApify(
  asin: string,
  amazonDomain: string,
  maxReviews: number = 100,
  sortBy: string = 'recent',
  filterByRating: string = 'allStars'
): Promise<{ success: boolean; data?: ApifyReviewsResult; error?: string }> {
  try {
    const token = await getApifyToken()

    // Build Amazon product URL from domain (e.g., "amazon.com" → "https://www.amazon.com/dp/B0...")
    const productUrl = `https://www.${amazonDomain}/dp/${asin}`

    console.log(
      `[Apify] Starting review fetch for ${asin} on ${amazonDomain} (max ${maxReviews}, sort: ${sortBy})`
    )

    // Start actor run
    // NOTE: Actor has TWO filter mechanisms:
    //   - `filterByRating` (simple string) — we always set "allStars"
    //   - `filter_by_ratings` (array) — DEFAULTS to ["five_star"] if not set!
    //     Must explicitly send all ratings to avoid only getting 5-star reviews.
    const input: Record<string, unknown> = {
      ASIN_or_URL: [productUrl],
      sortBy: sortBy === 'helpful' ? 'helpful' : 'recent',
      filterByRating,
      // Explicitly set ALL advanced filters to avoid actor defaults filtering data
      filter_by_ratings: [
        'five_star',
        'four_star',
        'three_star',
        'two_star',
        'one_star',
      ],
      filter_by_verified_purchase_only: [
        'all_reviews',
        'avp_only_reviews',
      ],
      filter_by_mediaType: [
        'all_contents',
        'media_reviews_only',
      ],
      get_customers_say: true,
    }

    // Only set max_reviews if not fetching all
    // NOTE: Actor uses snake_case `max_reviews`, NOT camelCase `maxReviews`
    if (maxReviews > 0) {
      input.max_reviews = maxReviews
    }

    let run = await startActorRun(token, input)

    // If not yet finished, poll until done
    if (!['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(run.status)) {
      run = await pollRunUntilDone(token, run.id)
    }

    if (run.status !== 'SUCCEEDED') {
      return {
        success: false,
        error: `Apify run ${run.status}: ${run.statusMessage || 'Unknown error'}`,
      }
    }

    // Fetch results
    const items = await fetchDatasetItems(token, run.defaultDatasetId)

    // Extract AI summaries from first item (they appear on all items but are the same)
    const customersSay = items[0]?.CustomersSay || null
    const reviewAspects = (items[0]?.ReviewAspects as Array<Record<string, unknown>>) || null

    console.log(
      `[Apify] Completed: ${items.length} reviews fetched for ${asin} (${run.stats.computeUnits.toFixed(4)} CU, ${Math.round(run.stats.durationMillis / 1000)}s)`
    )

    return {
      success: true,
      data: {
        reviews: items,
        customersSay,
        reviewAspects,
        totalFetched: items.length,
        runId: run.id,
        datasetId: run.defaultDatasetId,
        status: run.status,
        computeUnits: run.stats.computeUnits || 0,
        durationMs: run.stats.durationMillis || 0,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Apify error'
    console.error(`[Apify] Error fetching reviews:`, msg)
    return { success: false, error: msg }
  }
}

// --- Normalize Apify review to match existing OxylabsReviewItem format ---

export function normalizeApifyReview(review: ApifyReviewItem): {
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
} {
  // Try to extract Amazon review ID from PageUrl
  // e.g., https://www.amazon.com/gp/customer-reviews/R3ABCXYZ123/...
  let reviewId = review.ParentId || ''
  if (!reviewId && review.PageUrl) {
    const match = review.PageUrl.match(/customer-reviews\/([A-Z0-9]+)/i)
    if (match) reviewId = match[1]
  }
  if (!reviewId) {
    // Generate a deterministic ID from review content
    reviewId = `apify-${hashCode(`${review.Reviewer}-${review.ReviewTitle}-${review.ReviewDate}`)}`
  }

  return {
    id: reviewId,
    title: review.ReviewTitle || '',
    author: review.Reviewer || '',
    rating:
      review.Score >= 1 && review.Score <= 5
        ? review.Score
        : parseRatingFromTitle(review.ReviewTitle),
    content: review.ReviewContent || '',
    timestamp: review.ReviewDate || '',
    is_verified:
      review.Verified === 'Verified Purchase' ||
      review.Verified === 'true' ||
      review.Verified === 'Yes',
    helpful_count: review.HelpfulCounts || 0,
    product_attributes: review.Variant || null,
    images: Array.isArray(review.Images) ? Array.from(new Set(review.Images)) : [],
  }
}

// Parse star rating from review title prefix like "5.0 out of 5 stars"
function parseRatingFromTitle(title: string): number {
  if (!title) return 0
  const match = title.match(/^(\d+(?:\.\d+)?)\s+out\s+of\s+\d+\s+stars?/i)
  if (match) return Math.round(parseFloat(match[1]))
  return 0
}

// Simple hash for generating deterministic IDs
function hashCode(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

// --- Background fetch for async Apify jobs ---

async function updateReviewRecord(
  id: string,
  updates: Record<string, unknown>
) {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('lb_asin_reviews')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error(`[Reviews ${id}] Failed to update:`, error)
}

export async function backgroundFetchReviews(
  recordId: string,
  asin: string,
  amazonDomain: string,
  maxReviews: number,
  sortBy: string
) {
  try {
    await updateReviewRecord(recordId, { status: 'fetching' })

    const result = await fetchReviewsViaApify(
      asin,
      amazonDomain,
      maxReviews,
      sortBy
    )

    if (!result.success || !result.data) {
      await updateReviewRecord(recordId, {
        status: 'failed',
        error_message: result.error || 'Failed to fetch reviews via Apify',
      })
      return
    }

    // Normalize and deduplicate
    const normalizedReviews = result.data.reviews.map(normalizeApifyReview)
    const seen = new Set<string>()
    const uniqueReviews = normalizedReviews.filter((r) => {
      if (!r.id || seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    // Extract product-level data from first review item
    const firstItem = result.data.reviews[0]
    const overallRating = firstItem?.TotalRating ?? null
    const totalReviewCount = firstItem?.TotalReviewCount ?? null
    // Convert rating distribution from {"5 star": "70%", "4 star": "20%", ...} to array format
    let ratingDistribution: Array<{ rating: number; percentage: string }> | null = null
    if (firstItem?.RatingDistribution) {
      ratingDistribution = Object.entries(firstItem.RatingDistribution)
        .map(([key, value]) => {
          const rating = parseInt(key) || 0
          return { rating, percentage: String(value).replace('%', '') }
        })
        .filter((d) => d.rating >= 1 && d.rating <= 5)
        .sort((a, b) => b.rating - a.rating)
    }

    await updateReviewRecord(recordId, {
      status: 'completed',
      total_reviews: totalReviewCount ?? uniqueReviews.length,
      overall_rating: overallRating,
      rating_stars_distribution: ratingDistribution,
      total_pages_fetched: Math.ceil(uniqueReviews.length / 10) || 1,
      reviews: uniqueReviews,
      raw_response: {
        provider: 'apify',
        runId: result.data.runId,
        datasetId: result.data.datasetId,
        computeUnits: result.data.computeUnits,
        durationMs: result.data.durationMs,
        customersSay: result.data.customersSay,
        reviewAspects: result.data.reviewAspects,
      },
      error_message: null,
    })

    console.log(
      `[Reviews ${recordId}] Background fetch complete: ${uniqueReviews.length} reviews for ${asin}`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[Reviews ${recordId}] Background fetch failed:`, msg)
    await updateReviewRecord(recordId, {
      status: 'failed',
      error_message: msg,
    })
  }
}
