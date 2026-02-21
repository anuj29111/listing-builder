# Apify Integration Plan: Amazon Review Extraction

**Date:** February 2026
**Phase:** 7 (Research Acquisition)
**Status:** Planning

---

## 1. Actor Selection Strategy

Apify has multiple Amazon review scraper actors. We need a **multi-actor strategy** because:
- Individual actors can break when Amazon changes anti-scraping measures
- Different actors have different strengths (volume, AI summaries, pricing)
- We need coverage across all 10 marketplaces

### Recommended Actor Priority

| Priority | Actor | ID | Monthly Cost | Max Reviews | Why |
|:--------:|-------|-----|-------------|-------------|-----|
| **1 (Primary)** | Junglee | `junglee/amazon-reviews-scraper` | $40 + usage | 500/ASIN | Most established, Apify-maintained, URL-based input matches our `lb_countries.amazon_domain`, highest reliability |
| **2 (Fallback)** | Delicious Zebu | `delicious_zebu/amazon-reviews-scraper-with-advanced-filters` | $35 + usage | 1,000+/ASIN | AI summaries (CustomersSay, ReviewAspects), ASIN-based input, 72 monthly users, good rating (4.4/5) |
| **3 (Volume)** | Neatrat | `neatrat/amazon-reviews-scraper` | $25 + usage | 10,000+/ASIN | Cheapest, keyword-cycling for massive volume, but poor rating (1.9/5) and only 5 monthly users |
| **4 (Existing)** | Oxylabs | N/A | Already paying | ~3-4/ASIN | Keep as last-resort fallback via `amazon_product` top reviews |

**Recommendation:** Start with **Junglee only**. Add Delicious Zebu as fallback once Junglee is proven. Neatrat only if we need 1000+ reviews per product.

### Actor Input/Output Schema Comparison

**Input differences:**

| Actor | ASIN Input | Marketplace | Max Reviews | Star Filter |
|-------|-----------|-------------|-------------|-------------|
| Junglee | `productUrls: [{ url }]` | Via URL domain | `maxReviews: number` | `filterByRatings: string[]` |
| Delicious Zebu | `ASIN_or_URL: string[]` | Via URL domain or ASIN | `maxReviews: number` | `filterByRating: string` |
| Neatrat | `asin: string` (comma-sep) | Via prefix `de:B00...` | `pagesToScrape: number` | `ratings: number[]` |

**Output differences:**

| Field (Ours) | Junglee | Delicious Zebu | Neatrat |
|-------------|---------|----------------|---------|
| `id` | `reviewUrl` (parse) | `PageUrl` (parse) | `PageUrl` (parse) |
| `title` | `reviewTitle` | `ReviewTitle` | `ReviewTitle` |
| `author` | (not returned) | `Reviewer` | `Reviewer` |
| `rating` | `reviewRatingStars` | `Score` | `Score` |
| `content` | `reviewDescription` | `ReviewContent` | `ReviewContent` |
| `timestamp` | `reviewedIn` (parse) | `ReviewDate` | `ReviewDate` |
| `is_verified` | `reviewIsVerified` | `Verified` | `Verified` |
| `helpful_count` | `reviewReaction` (parse) | `HelpfulCounts` | `HelpfulCounts` |
| `product_attributes` | `variant` | `VariantASIN` | `Variant` |
| `images` | `reviewImages` | `Images` | `Images` |

---

## 2. Integration Architecture

### Where Apify Plugs In

The entire system downstream expects `OxylabsReviewItem[]`. Apify replaces **only the data source**, not the storage, analysis, or UI.

```
User clicks "Fetch Reviews" in ReviewsClient.tsx
  ↓
POST /api/asin-reviews
  ↓
[NEW] Try Apify first (via src/lib/apify.ts)
  ↓ If Apify fails...
[EXISTING] Fallback to Oxylabs amazon_product
  ↓
Transform → OxylabsReviewItem[]
  ↓
Deduplicate by review ID
  ↓
Upsert lb_asin_reviews (existing logic, unchanged)
  ↓
Return response with source: 'apify' | 'oxylabs'
  ↓
ReviewsClient displays (unchanged)
  ↓
Market Intelligence reads from lb_asin_reviews cache (unchanged)
```

### Interface Boundary

The canonical type is `OxylabsReviewItem` (rename is optional -- it's the review shape):

```typescript
interface OxylabsReviewItem {
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
```

All Apify actor outputs must be normalized to this shape. Everything downstream (DB storage, MI analysis, UI) works without changes.

---

## 3. Implementation Plan

### Step 1: Install Apify Client + Store API Token

```bash
npm install apify-client
```

Store `APIFY_API_TOKEN` in:
- `lb_admin_settings` (key: `apify_api_token`) -- primary
- `.env.local` `APIFY_API_TOKEN` -- fallback

### Step 2: Create `src/lib/apify.ts`

Core module with:

**a) Actor configuration registry:**
```typescript
const ACTORS = {
  junglee: {
    id: 'junglee/amazon-reviews-scraper',
    buildInput: (asin, domain, maxReviews, starFilter, sort) => ({
      productUrls: [{ url: `https://www.${domain}/dp/${asin}` }],
      maxReviews: maxReviews || 500,
      filterByRatings: starFilter || ['allStars'],
      proxyCountry: 'AUTO_SELECT_PROXY_COUNTRY',
    }),
    normalizeOutput: (items) => items.map(jungleeToReviewItem),
  },
  delicious_zebu: {
    id: 'delicious_zebu/amazon-reviews-scraper-with-advanced-filters',
    buildInput: (asin, domain, maxReviews, starFilter, sort) => ({
      ASIN_or_URL: [`https://www.${domain}/dp/${asin}`],
      maxReviews: maxReviews || 1000,
      filterByRating: starFilter?.[0] || 'allStars',
    }),
    normalizeOutput: (items) => items.map(deliciousZebuToReviewItem),
  },
  neatrat: {
    id: 'neatrat/amazon-reviews-scraper',
    buildInput: (asin, domain, maxReviews, starFilter, sort) => {
      const prefix = domain.replace('amazon.', '').replace('www.', '')
      return {
        asin: `${prefix}:${asin}`,
        ratings: [1, 2, 3, 4, 5],
        pagesToScrape: Math.min(Math.ceil((maxReviews || 100) / 10), 10),
        sortBy: sort === 'recent' ? 'recent' : 'top',
      }
    },
    normalizeOutput: (items) => items.map(neatratToReviewItem),
  },
}
```

**b) Normalizer functions** (one per actor → `OxylabsReviewItem`):

```typescript
// Junglee → OxylabsReviewItem
function jungleeToReviewItem(item): OxylabsReviewItem {
  return {
    id: item.reviewUrl?.split('/').pop() || `junglee-${Date.now()}`,
    title: item.reviewTitle || '',
    author: 'Amazon Customer', // junglee doesn't return author
    rating: item.reviewRatingStars || 0,
    content: item.reviewDescription || '',
    timestamp: parseJungleeDate(item.reviewedIn), // "Reviewed in US on Aug 30, 2022"
    is_verified: Boolean(item.reviewIsVerified),
    helpful_count: parseHelpfulCount(item.reviewReaction), // "One person found this helpful"
    product_attributes: item.variant || null,
    images: item.reviewImages || [],
  }
}

// Delicious Zebu → OxylabsReviewItem
function deliciousZebuToReviewItem(item): OxylabsReviewItem {
  return {
    id: item.PageUrl?.split('/').pop() || `dz-${Date.now()}`,
    title: item.ReviewTitle || '',
    author: item.Reviewer || 'Amazon Customer',
    rating: Number(item.Score) || 0,
    content: item.ReviewContent || '',
    timestamp: item.ReviewDate || '',
    is_verified: item.Verified === 'True' || item.Verified === true,
    helpful_count: Number(item.HelpfulCounts) || 0,
    product_attributes: item.VariantASIN || null,
    images: Array.isArray(item.Images) ? item.Images : [],
  }
}
```

**c) Main fetch function with actor fallback:**

```typescript
export async function fetchReviewsViaApify(
  asin: string,
  domain: string,     // e.g. 'amazon.com'
  maxReviews: number,
  sort: 'recent' | 'helpful' = 'recent',
  actorPreference?: string  // override which actor to use
): Promise<{
  success: boolean
  reviews: OxylabsReviewItem[]
  totalFound: number
  source: string
  error?: string
}>
```

**d) Run + poll logic:**

```typescript
// Option A: Synchronous (short runs < 5 min)
const run = await client.actor(actorId).call(input, { waitSecs: 300 })

// Option B: Async with polling (long runs)
const run = await client.actor(actorId).start(input)
const finished = await client.run(run.id).waitForFinish({ waitSecs: 600 })
const { items } = await client.dataset(finished.defaultDatasetId).listItems()
```

### Step 3: Update `/api/asin-reviews/route.ts`

Modify the POST handler to try Apify first:

```typescript
// Try Apify
const apifyResult = await fetchReviewsViaApify(asin, country.amazon_domain, pages * 10, sortBy)

if (apifyResult.success && apifyResult.reviews.length > 0) {
  source = 'apify'
  allReviews = apifyResult.reviews
} else {
  // Fallback to existing Oxylabs logic
  source = 'oxylabs'
  // ... existing fetchReviews() code
}
```

Add `apify_actor` to the response so we know which actor was used.

### Step 4: Update Admin Settings

Add to admin settings page:
- `apify_api_token` -- API token input
- `apify_preferred_actor` -- dropdown to select preferred actor (junglee/delicious_zebu/neatrat)

### Step 5: Update `lb_asin_reviews` Source Tracking

The `source` field in the API response already exists. Ensure the upsert stores:
```typescript
source: 'apify',  // or 'apify_junglee', 'apify_delicious_zebu'
```

### Step 6: Wire into Market Intelligence

In `src/lib/market-intelligence.ts`, the `backgroundAnalyze()` function at line 91 already calls `fetchReviews()`. Update to try Apify first:

```typescript
// Phase A: Review collection
const apifyResult = await fetchReviewsViaApify(asin, oxylabsDomain, reviewPages * 10)
if (apifyResult.success) {
  allReviews = apifyResult.reviews
} else {
  // Existing Oxylabs fallback
  const result = await fetchReviews(asin, oxylabsDomain, 1, reviewPages)
  allReviews = result.data?.reviews || []
}
```

---

## 4. Async vs Sync Execution

Apify actors take **seconds to minutes** depending on review count. Two approaches:

### Option A: Synchronous (Recommended for MVP)

Use `client.actor().call()` which blocks until completion. Set timeout to 5 minutes.

**Pros:** Simple. Same UX as current Oxylabs flow.
**Cons:** Long request times for large review counts. Risk of Next.js function timeout.

### Option B: Async with Webhook (Recommended for Production)

1. Start actor run → return run ID immediately
2. Actor completion triggers webhook to `/api/apify-webhook`
3. Webhook handler fetches results, stores in DB, updates status
4. Frontend polls for completion via existing status check pattern

**Implementation:**
```typescript
// Start run with ad-hoc webhook
const webhookPayload = btoa(JSON.stringify([{
  eventTypes: ['ACTOR.RUN.SUCCEEDED'],
  requestUrl: `${APP_URL}/api/apify-webhook`,
  payloadTemplate: '{"runId":"{{resource.id}}","datasetId":"{{resource.defaultDatasetId}}","asin":"<ASIN>"}'
}]))

const run = await client.actor(actorId).start(input, {
  webhooks: webhookPayload
})
```

**Recommendation:** Start with Option A (sync), migrate to Option B when we hit timeout issues.

---

## 5. Error Handling & Fallback Chain

```
Try Apify (preferred actor from admin settings)
  ↓ fails?
Try Apify (next actor in priority list)
  ↓ fails?
Try Oxylabs amazon_product (top reviews fallback)
  ↓ fails?
Return cached reviews from lb_asin_reviews (if < 7 days old)
  ↓ no cache?
Return error with explanation
```

Error scenarios:
- **Actor timeout:** Set 5-min timeout, fall to next actor
- **Actor failed status:** Log error, fall to next actor
- **Empty results:** Treat as failure, fall to next actor
- **API token invalid:** Log, fall to Oxylabs
- **Rate limited:** Apify client auto-retries (8 retries, exponential backoff)

---

## 6. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/lib/apify.ts` | Apify client wrapper, actor configs, normalizers, fetch function |

### Modified Files

| File | Change |
|------|--------|
| `src/app/api/asin-reviews/route.ts` | Try Apify before Oxylabs in POST handler |
| `src/lib/market-intelligence.ts` | Try Apify before Oxylabs in Phase A review collection |
| `src/components/admin/AdminSettings.tsx` | Add `apify_api_token` and `apify_preferred_actor` fields |
| `src/types/database.ts` | Add `source?: 'apify' \| 'oxylabs'` to review type if not already present |
| `package.json` | Add `apify-client` dependency |

### No Changes Needed

| File | Why |
|------|-----|
| `lb_asin_reviews` table | JSONB `reviews` column accepts any array. `source` tracking via existing field. |
| `ReviewsClient.tsx` | Already displays `source` badge. Works with any `OxylabsReviewItem[]`. |
| `src/lib/oxylabs.ts` | Keep as-is. Still used for ASIN lookup, keyword search, Q&A. |
| Claude analysis phases | Reads reviews generically from `lb_asin_reviews` cache. Source-agnostic. |

---

## 7. Cost Estimate

### Monthly Fixed Costs

| Actor | Rental | Notes |
|-------|--------|-------|
| Junglee (primary) | $40/month | Unlimited runs, pay platform usage on top |
| Delicious Zebu (fallback) | $35/month | Only rent if Junglee proves insufficient |
| Apify Platform (Starter) | $29/month | Includes $29 in credits |

**MVP cost: $69/month** (Junglee + Starter plan)

### Per-Run Variable Costs

Platform usage per run depends on memory and duration:
- Typical review scrape: 256MB memory, 2-5 min runtime
- = ~0.02-0.02 CU per run
- = ~$0.006-$0.006 per run at Starter rate ($0.30/CU)

**For 100 products/month at 500 reviews each:** ~$0.60 in platform usage + $69 fixed = ~$70/month total

### Comparison to Current (Oxylabs)

We're already paying for Oxylabs. Apify adds ~$70/month but delivers **500 reviews per product instead of 3-4** — a 125x improvement in review data for Market Intelligence analysis.

---

## 8. Implementation Order

1. **Install `apify-client` + add env var** (5 min)
2. **Create `src/lib/apify.ts`** with Junglee actor only (2 hours)
3. **Test with 1 ASIN** via admin console (30 min)
4. **Update `/api/asin-reviews`** to try Apify first (1 hour)
5. **Update Market Intelligence** review collection (30 min)
6. **Add admin settings** for API token (30 min)
7. **Test end-to-end** with all 10 marketplaces (1 hour)
8. **Add Delicious Zebu fallback** if needed (1 hour later)
