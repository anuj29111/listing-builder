import { createAdminClient } from '@/lib/supabase/server'

const APIFY_MAX_WAIT_SECS = 3600 // 60 minutes total max wait (large fetches can take 30+ min)
const APIFY_POLL_WAIT_SECS = 60 // Long-poll up to 60s per poll request

// Actor: delicious_zebu/amazon-reviews-scraper-with-advanced-filters
const ACTOR_ID = 'delicious_zebu~amazon-reviews-scraper-with-advanced-filters'

// --- Output types from the actor ---

// Field names match the ACTUAL actor output (verified via dataset API)
export interface ApifyReviewItem {
  PageUrl: string
  ProductLink: string
  ASIN: string
  Brand: string
  ProductTitle: string
  ReviewId: string          // Actor uses ReviewId, NOT ParentId
  ReviewDate: string
  Images: string[]
  ReviewScore: string       // Actor returns STRING like "3.0", NOT number
  RatingTypeTotalReviews?: string  // e.g. "174 matching customer reviews"
  Reviewer: string
  ReviewerProfileUrl?: string
  ReviewerId?: string
  ReviewUrl?: string
  ReviewTitle: string
  ReviewContent: string
  Verified: boolean | string  // Actor returns boolean True/False
  Variant: string[] | string  // Actor returns ARRAY like ["Size: Bold Tip - 6mm"]
  VariantASIN: string
  HelpfulCounts: string     // Actor returns STRING like "1 person found this helpful"
  CustomersSay?: string
  ReviewAspects?: Array<{
    aspect_name: string     // Actor uses "aspect_name", NOT "aspect"
    positiv: string         // Actor uses "positiv" (typo), returns STRING
    negativ: string         // Actor uses "negativ" (typo), returns STRING
    'aspect-summary'?: string
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

    // NOTE: Actor uses snake_case `max_reviews`, NOT camelCase `maxReviews`
    // Always set max_reviews: 0 = no limit (fetch all), positive number = limit
    // If omitted, actor uses its own small default (~10-20 reviews)
    input.max_reviews = maxReviews

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
  // Actor uses ReviewId directly (e.g., "R3SQRYI1MLDO6G")
  let reviewId = review.ReviewId || ''
  if (!reviewId && review.PageUrl) {
    const match = review.PageUrl.match(/customer-reviews\/([A-Z0-9]+)/i)
    if (match) reviewId = match[1]
  }
  if (!reviewId) {
    reviewId = `apify-${hashCode(`${review.Reviewer}-${review.ReviewTitle}-${review.ReviewDate}`)}`
  }

  // ReviewScore is a STRING like "3.0" or "5.0" — parse it
  const parsedScore = parseFloat(String(review.ReviewScore))
  const rating = parsedScore >= 1 && parsedScore <= 5
    ? Math.round(parsedScore)
    : parseRatingFromTitle(review.ReviewTitle)

  // HelpfulCounts is a STRING like "1 person found this helpful" — parseInt extracts leading number
  const helpfulCount = parseInt(String(review.HelpfulCounts), 10) || 0

  // Variant is an ARRAY like ["Size: Bold Tip - 6mm"] — join into string
  const variant = Array.isArray(review.Variant)
    ? review.Variant.join(', ')
    : (review.Variant || null)

  // Verified is boolean True/False or string "True"/"Verified Purchase"
  const isVerified =
    review.Verified === true ||
    String(review.Verified).toLowerCase() === 'true' ||
    review.Verified === 'Verified Purchase' ||
    review.Verified === 'Yes'

  return {
    id: reviewId,
    title: review.ReviewTitle || '',
    author: review.Reviewer || '',
    rating,
    content: review.ReviewContent || '',
    timestamp: review.ReviewDate || '',
    is_verified: isVerified,
    helpful_count: helpfulCount,
    product_attributes: variant,
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

    // Calculate overall rating + distribution from actual review data
    // (Actor doesn't provide these as separate fields)
    const ratingsWithValues = uniqueReviews.filter((r) => r.rating >= 1 && r.rating <= 5)
    const overallRating = ratingsWithValues.length > 0
      ? Math.round((ratingsWithValues.reduce((sum, r) => sum + r.rating, 0) / ratingsWithValues.length) * 10) / 10
      : null

    // Calculate rating distribution percentages
    let ratingDistribution: Array<{ rating: number; percentage: string }> | null = null
    if (ratingsWithValues.length > 0) {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const r of ratingsWithValues) counts[r.rating] = (counts[r.rating] || 0) + 1
      ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
        rating: star,
        percentage: String(Math.round(((counts[star] || 0) / ratingsWithValues.length) * 100)),
      }))
    }

    // Parse total review count from RatingTypeTotalReviews string
    // e.g., "174 matching customer reviews" → 174
    // Note: Sometimes contains rating text like "5.0 out of 5 stars" → parseInt returns 5 (wrong!)
    // Fix: parsed value must be >= actual review count, otherwise discard
    const firstItem = result.data.reviews[0]
    const totalReviewCountStr = firstItem?.RatingTypeTotalReviews || ''
    const rawParsed = parseInt(totalReviewCountStr, 10) || null
    const parsedTotalCount = (rawParsed && rawParsed >= uniqueReviews.length) ? rawParsed : null

    // Normalize review aspects field names
    // Actor returns: { aspect_name, positiv, negativ, "aspect-summary" }
    // We normalize to: { aspect, positive, negative, summary }
    const normalizedAspects = result.data.reviewAspects
      ? result.data.reviewAspects.map((a) => ({
          aspect: String(a.aspect_name || a.aspect || '').replace(/\(\d+\)\s*$/, '').trim(),
          positive: parseInt(String(a.positiv ?? a.positive ?? 0), 10) || 0,
          negative: parseInt(String(a.negativ ?? a.negative ?? 0), 10) || 0,
          summary: String(a['aspect-summary'] || a.summary || ''),
        }))
      : null

    await updateReviewRecord(recordId, {
      status: 'completed',
      total_reviews: parsedTotalCount ?? uniqueReviews.length,
      overall_rating: overallRating,
      rating_stars_distribution: ratingDistribution,
      total_pages_fetched: Math.ceil(uniqueReviews.length / 10) || 1,
      reviews: uniqueReviews,
      raw_response: {
        provider: 'apify',
        maxReviewsRequested: maxReviews || 'all',
        runId: result.data.runId,
        datasetId: result.data.datasetId,
        computeUnits: result.data.computeUnits,
        durationMs: result.data.durationMs,
        customersSay: result.data.customersSay,
        reviewAspects: normalizedAspects,
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
