# Amazon Review Extraction Services: Comparison Report

**Date:** February 2026
**Context:** Amazon moved extended reviews behind a login wall (Nov 2024), then tightened further (Feb 2025). Without authentication, only ~3-4 featured reviews are accessible on product pages. Full review history requires an authenticated session. This report evaluates services that can beat this wall.

**Current state in our codebase:** Oxylabs `amazon_reviews` source returns "Unsupported source" on our plan. Fallback uses `amazon_product` top reviews (~13 reviews max). See `src/lib/oxylabs.ts` lines 344-462.

---

## Quick Comparison Matrix

| Service | Full Reviews (100+) | Login Wall Solution | Price/1K Reviews | Multi-Marketplace | Recommended |
|---------|:-------------------:|--------------------|--------------------|:-----------------:|:-----------:|
| **Apify** | 500-10K+ | Star-filter bypass + cookies | ~$0.06-0.25 | 17+ markets | **YES** |
| **Bright Data** | 28M+ dataset | Pre-collected data / proxy | $0.90/1K req | Global | **Enterprise** |
| **Scrape.do** | Yes (with cookies) | Cookie injection | $0.12/1K req | Global + ZIP | **YES** |
| **Unwrangle** | ~500 per ASIN | System cookies (US/DE/GB) | ~$0.01/review | US, DE, GB auto | **YES (limited)** |
| **DataForSEO** | Up to 4,490 | Queue-based | $0.0015/product | Location targeting | Verify availability |
| **Decodo (Smartproxy)** | Likely | Proxy rotation | $0.32-0.88/1K | Global + ZIP | Maybe |
| **Outscraper** | Yes | Cloud-managed sessions | ~$3/1K records | Regional | Maybe |
| **Zyte (Scrapy)** | Depends on impl | AI + proxy | $0.40-1.80/1K | 19 countries | Technical teams |
| **ScraperAPI** | Limited | Proxy only | $0.48-2.45/1K | All domains | No |
| **ScrapingBee** | No (public only) | None (advises against) | $0.075/1K | All domains | No |
| **Oxylabs** | No (on our plan) | None confirmed | $0.50-1.35/1K | All domains | No (current) |
| **Keepa** | No (counts only) | N/A | 49EUR/mo | All | No (wrong tool) |
| **Jungle Scout/H10** | No | N/A | $39-249/mo | Varies | No (wrong tool) |

---

## Tier 1: Best Options

### 1. Apify (TOP RECOMMENDATION)

**Why it matters:** Multiple competing review scraper "actors" on the Apify marketplace. If one breaks when Amazon changes anti-scraping measures, switch to another. We previously used Apify, so there's existing familiarity.

**Login wall handling:** Several actors claim "No Login Needed" (updated July 2025). They use creative workarounds:
- **Star-rating filtering:** Scrape 5 star ratings x 100 reviews each = 500 reviews without login
- **Keyword variation technique:** Some actors claim 10,000+ reviews per ASIN
- **Cookie injection (optional):** `webdatalabs` actor supports authenticated cookies for 1,000+

**Key actors to evaluate:**

| Actor | Max Reviews | Login Needed | Last Updated |
|-------|------------|:------------:|:------------:|
| `neatrat` (Advanced & Lightning-Fast) | 10,000+ | No | July 2025 |
| `delicious_zebu` (Advanced Filters) | 1,000+ | No | July 2025 |
| `xmiso_scrapers` (Easy Scraper) | 1,000 | No | Aug 2025 |
| `junglee` | 500 | No | Active |
| `webdatalabs` (Extractor) | 1,000+ (cookies) | Optional | Active |

**Data fields:** Review URL, ASIN, Brand, Product Title, Review Date, Images, Rating, Reviewer Name & Profile, Title & Content, Verified Purchase, Variant details, Helpful votes. Some actors include AI-powered "CustomersSay" summaries and "ReviewAspects" sentiment breakdowns.

**Pricing:**
- Free tier: $5/month platform credits (~4,000 results)
- Pay-per-event on some actors
- ~$0.06-0.25 per 1,000 results at scale

**Multi-marketplace:** 17+ markets (covers all our 10: US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Exception: `xmiso_scrapers` limited to Amazon.com only after Aug 2025 update.

**Integration:** REST API + webhooks + SDK (Python, Node.js). Actors run on Apify cloud. Can also be self-hosted.

**Risk:** Individual actors can break or be deprecated. Mitigate by maintaining references to 2-3 actors and falling back between them.

---

### 2. Bright Data (ENTERPRISE / PRE-COLLECTED DATA)

**Why it matters:** World's largest proxy network. Offers BOTH real-time scraping AND pre-collected datasets. The dataset option (28M+ reviews) sidesteps the login wall entirely -- the data was collected before/during the login wall transition.

**Login wall handling:**
- Real-time scraper: Proxy rotation + browser emulation (same limitations as others)
- Pre-collected datasets: Already collected, no wall to bypass

**Pricing:**
- Web Scraper API: $0.90/1K requests
- Pre-collected datasets: Starting at $250/100K records
- Free trial (no credit card)

**Data depth:** 686 fields across all Amazon data types (most of any provider).

**Multi-marketplace:** All major Amazon marketplaces globally.

**Integration:** REST API, compatible with 70+ AI platforms (LangChain, LlamaIndex, etc.). Natural-language query support. No-code option.

**Best for:** One-time bulk historical analysis, or teams needing guaranteed data delivery with budget for it.

---

### 3. Scrape.do (BEST PRICE/PERFORMANCE)

**Why it matters:** Lowest cost per request, fastest response times, dedicated Amazon endpoints.

**Login wall handling:** Provides cookie injection documentation. Supports authenticated requests.

**Pricing:**
- Free: 1,000 req/month (no expiration)
- Hobby: $29/month for 250K requests ($0.12/1K)
- Pro: $99/month for 1.25M requests

**Performance:** 100% success rate, 3,029ms avg response (fastest tested), 99.98% uptime.

**Multi-marketplace:** Granular geo-targeting with country + ZIP code level.

**Caveat:** Their own docs advise respecting Amazon ToS re: login-protected content.

---

## Tier 2: Solid with Trade-offs

### 4. Unwrangle (EASIEST FOR US/DE/GB)

**Login wall handling:** Offers `use_system_cookie=true` for US, DE, GB -- no cookie management needed on your end. Other markets require your own cookies.

**Review capacity:** ~500 per product (10 pages x 10 reviews, multiplied across star-rating filters and sort options).

**Pricing:**
- 1-2.5 credits/page (own cookie)
- 10 credits/page (system cookie)
- Plans: $10/10K credits to $99/100K credits

**Best for:** Quick wins on US/DE/GB without any cookie management overhead.

### 5. DataForSEO

**Review capacity:** Up to 4,490 reviews per request via `depth` parameter.

**Pricing:** Pay-as-you-go, $0.0015 per product, balance never expires.

**Data fields:** Review content, title, rating, publication date, verified purchase, helpful votes, reviewer profile, images, videos.

**WARNING:** Amazon Reviews endpoint was flagged as "temporarily unavailable" in recent docs. Verify before committing.

### 6. Decodo (formerly Smartproxy)

**Login wall handling:** Uses 125M+ proxy pool. Relies on rotation rather than cookie injection.

**Pricing:** $29/month for 90K requests ($0.32/1K).

Named "best proxy of 2025" for affordability. Multi-marketplace support.

### 7. Outscraper

**Login wall handling:** Cloud-based session management.

**Pricing:** First 5,000 reviews free monthly, then ~$3/1K records pay-as-you-go.

**Integration:** SDKs for Python, PHP, Node, Go, Java, Ruby. Zapier/Make integrations.

### 8. Zyte (Scrapy)

**Performance:** Fastest at extreme scale (2,000 requests per dollar at 12.5M requests). 2.58s avg response.

**Pricing:** $0.40/1K HTTP, $1.80/1K browser-rendered.

**Caveat:** Requires deep Scrapy framework knowledge. Best for technical teams needing massive scale.

---

## Tier 3: Not Suitable

| Service | Why Not |
|---------|---------|
| **Oxylabs** (current) | `amazon_reviews` unsupported on our plan. Even when available, limited by login wall. Reported billing issues. |
| **ScraperAPI** | Slow (22-40s on Amazon in benchmarks). Limited review extraction. |
| **ScrapingBee** | Explicitly advises against behind-login scraping. Public reviews only (~3-4 featured). |
| **Keepa** | Tracks review COUNT/RATING history over time. Does NOT provide review TEXT. Wrong tool. |
| **Jungle Scout / Helium 10** | Seller research tools. Surface review summaries, not bulk text extraction. Wrong tool. |
| **Rainforest API** | 3.5/5 Trustpilot. Reports of unreliable data, account access issues, problematic cancellation. |
| **Canopy API** | AI-driven review INSIGHTS, not raw extraction. Good for analysis, not bulk data. |

---

## The Amazon Login Wall: What Actually Happened

| Date | Change |
|------|--------|
| **Nov 5, 2024** | Extended reviews moved behind login. ~8 featured reviews remained public. |
| **Feb 26, 2025** | Further tightened. Even featured reviews reduced. Reviews page fully requires login. |
| **Current (2026)** | Only 3-4 featured reviews in product page HTML. Full history requires authenticated session. |

**How services beat it:**
1. **Star-rating filtering** (Apify): Access public review filter pages (1-star, 2-star, etc.) which each show ~100 reviews = 500 total without login
2. **Keyword variation** (Apify neatrat): Search within reviews by keyword, hitting different review subsets
3. **Cookie injection** (Scrape.do, Unwrangle, some Apify actors): Pass authenticated Amazon session cookies with requests
4. **System cookies** (Unwrangle): Service manages authenticated cookies for you (US/DE/GB only)
5. **Pre-collected datasets** (Bright Data): Data already collected before/during wall transition

---

## Recommendation for Our Platform

### Immediate (no code changes needed)
Continue using `amazon_product` top reviews (~3-4 featured) via Oxylabs for Market Intelligence. Already working.

### Phase 7 Enhancement: Integrate Apify

**Why Apify:**
- We previously used it (existing familiarity)
- Multiple competing actors = redundancy if one breaks
- Cheapest at scale ($0.06-0.25/1K reviews)
- 17+ marketplace support covers all our 10 markets
- REST API integrates cleanly with Next.js API routes
- Results return as JSON arrays matching our `OxylabsReviewItem` structure

**Integration plan:**
1. Create `src/lib/apify.ts` (API wrapper, actor selection, result normalization)
2. Create `POST /api/reviews/fetch` route (Apify actor trigger + polling)
3. Store results in `lb_asin_reviews` with existing cache TTL
4. Wire into Market Intelligence `backgroundAnalyze()` as primary review source
5. Keep Oxylabs `amazon_product` as fallback

**Recommended actors to start with:**
- Primary: `neatrat` (10K+ reviews, no login, updated July 2025)
- Fallback: `delicious_zebu` (1K+, advanced filters, no login)

### Backup Options
- **Scrape.do** ($0.12/1K) as secondary real-time fallback
- **Bright Data datasets** ($250/100K records) for one-time historical bulk analysis
- **Unwrangle** (`use_system_cookie=true`) for quick US/DE/GB extraction without cookie management

---

## Current Codebase Reference

| File | Purpose |
|------|---------|
| `src/lib/oxylabs.ts:344-462` | Current review fetch with `amazon_reviews` + `amazon_product` fallback |
| `src/app/api/asin-reviews/route.ts` | Review fetch API route |
| `src/lib/market-intelligence.ts:54-135` | MI Phase A: review collection for analysis |
| `src/components/asin-lookup/ReviewsClient.tsx` | Reviews UI (fetch form, history, review cards) |
| `src/types/database.ts` | `LbAsinReview` interface, `OxylabsReviewItem` structure |
| `docs/PHASE-DETAILS.md` | Phase 7 (Research Acquisition) -- NOT STARTED |
| `docs/RESEARCH-FORMATS.md` | Expected review CSV format from Apify/DataDive |

**DB tables:** `lb_asin_reviews` (UNIQUE: asin+country+sort_by), `lb_asin_lookups` (top_reviews), `lb_market_intelligence` (reviews_data)

**DB support already in place:** `lb_research_files.source` includes `'apify'`, `lb_sync_logs.sync_type` includes `'apify'`
