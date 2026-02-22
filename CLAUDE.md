# Amazon Listing Builder Platform

## Quick Reference

| Key | Value |
|-----|-------|
| **Framework** | Next.js 14.0.4 + TypeScript (App Router, `src/` directory) |
| **Styling** | Tailwind CSS + shadcn/ui (HSL variables, `darkMode: ['class']`) |
| **State** | Zustand (`use<Name>Store`) |
| **Database** | Supabase PostgreSQL (project `yawaopfqkkvdqtsagmng`, shared DB) |
| **Auth** | Google OAuth via Supabase Auth (`@chalkola.com` only) |
| **Deployment** | Railway (`railway up` CLI — auto-deploy unreliable) |
| **Production URL** | `https://listing-builder-production.up.railway.app` |
| **GitHub** | `anuj29111/listing-builder` |
| **Table Prefix** | `lb_` (21 tables, 66 RLS policies) |
| **Storage Buckets** | `lb-research-files`, `lb-images` |
| **Brands** | Chalkola, Spedalon, Funcils |

---

## Project Overview

Internal tool for 10-15 people managing Amazon FBA brands across 8-10 international marketplaces.

**Core architecture:** Research analyzed once per category/country by Claude AI, cached as JSONB, reused for all products in that category.

**Data flow:** CSV upload → Supabase Storage → Claude Analysis → Cached JSONB → Listing Generation → Modular Chat Refinement → Export

**Generates:** Title, 5-10 bullet points, description, search terms, subject matter — per product, per marketplace.

---

## Phase Tracker

| Phase | Name | Status |
|-------|------|--------|
| 0-6 | Foundation through Speed Mode | **ALL COMPLETED** |
| 7 | Research Acquisition (Apify/DataDive) | NOT STARTED |
| 8 | Google Drive Integration | NOT STARTED |
| 9 | Image Builder | **COMPLETED** |
| 10 | A+ Content + Polish | **COMPLETED** |

**Next:** Phase 7 or 8 (both depend only on Phase 2, can run in parallel).

---

## Key Conventions

**Naming:** Tables `lb_snake_case` | Components `PascalCase.tsx` | Files `kebab-case.ts` | Types `PascalCase` interfaces

**Components:** Server Components by default, `'use client'` only when needed. API routes for all mutations. Direct Supabase reads OK for client-side data.

**Supabase:** `@supabase/ssr` with `client.ts` (browser) + `server.ts` (server + admin). Always wrap `auth.uid()` in `(SELECT auth.uid())` for RLS performance.

**TypeScript:** Strict mode, no `any`, all responses typed via `types/database.ts`.

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://yawaopfqkkvdqtsagmng.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
ANTHROPIC_API_KEY=              # Or set via Admin Settings UI
OPENAI_API_KEY=                 # GPT Image 1.5 (Phase 9)
GOOGLE_AI_API_KEY=              # Gemini (Phase 9)
GOOGLE_SERVICE_ACCOUNT_EMAIL=   # Phase 8
GOOGLE_PRIVATE_KEY=             # Phase 8
GOOGLE_DRIVE_ROOT_FOLDER_ID=    # Phase 8
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

**Railway env vars (set):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NODE_ENV`

---

## Development & Deployment

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build — ALWAYS test before pushing
npm run start        # Production server
npm run lint         # ESLint
```

**Deploy:** commit → push to `main` → `railway up` CLI to deploy (Nixpacks). Railway "Redeploy" button re-uses old image — does NOT pull new code.
**NEVER rely on Railway auto-deploy or dashboard Redeploy** — always use `railway up` from local with latest `main`.
**Health check:** `GET /api/health`

---

## Gotchas

1. **`NEXT_PUBLIC_*` vars** — Inlined at build time. Hardcode production URLs in login/callback routes.
2. **Supabase key rotation** — 401 errors → verify with `get_publishable_keys` MCP tool and update Railway env vars.
3. **Route groups** — Don't create redirect-only `page.tsx` inside route groups (missing manifest error).
4. **Nixpacks** — Don't use `output: 'standalone'`. **Middleware** — Must run Supabase client for ALL routes for cookie propagation.
5. **FormData uploads** — Never set `Content-Type` header manually. **DataDive CSV BOM** — Strip `\uFEFF` before header detection.
6. **Railway deploy** — Auto-deploy and dashboard "Redeploy" are unreliable (re-use cached image). ALWAYS use `railway up` CLI. **TypeScript Set** — Use `Array.from(new Set())`.
7. **Supabase Redirect URLs** — Each app needs its callback URL added to Auth config.
8. **Claude JSON responses** — Always `stripMarkdownFences()` before `JSON.parse()`.
9. **Supabase Storage MIME types** — `lb-research-files`: csv, excel, txt, markdown, json, octet-stream.
10. **Large CSV analysis** — `truncateCSVContent()` handles >200K token CSVs with even sampling.
11. **Analysis source column** — `lb_research_analysis.source`: `csv`/`file`/`merged`. UNIQUE on `(category_id, country_id, analysis_type, source)`. Consumers pick: merged > csv > file.
12. **Research page coordination** — `ResearchPageClient` wraps `ResearchStatusMatrix` + `ResearchClient`. Matrix click → sets selection.
19. **Supabase join returns array** — `select('field:table(cols)')` returns array not object. Normalize with `Array.isArray(x) ? x[0] || null : x`.
20. **Image builder** — Dual entry: `/listings/[id]` and `/images` (standalone). 5 tabs. `image_type` column filters workshops per tab. Drafts panel resumes saved workshops.
21. **Listings** — 3 variations per bullet. Phased generation: 4 sequential API calls via `/api/listings/generate` with `phase` param. Title length validation + retry. Bullets 5-10 dynamic. Collapsible containers. Auto-advance to Review.
23. **Admin settings keys are lowercase** — `anthropic_api_key`, `openai_api_key`, `google_ai_api_key`, `apify_api_token`.
24. **Image providers** — `openai` (GPT Image 1.5), `gemini` (Flash + Nano Banana Pro), `higgsfield` (queue-based via `hf_prompt_queue`). Models: `nano-banana-pro`, `chatgpt`, `seedream`, `soul`.
25. **SP Prompts xlsx parsing** — xlsx parsed server-side → CSV. Wired into Q&A analysis with niche-filtering.
26. **Product Mapper** — `lb_products` table (ASIN unique key). `/products` page. Import upserts on ASIN in batches of 100.
28. **ASIN Lookup via Oxylabs** — Oxylabs E-Commerce Scraper API. Credentials in `lb_admin_settings`. `domain` from `lb_countries.amazon_domain` minus `amazon.` prefix. `searchKeyword()`, `lookupAsin()`, `fetchQuestions()` return `{ success, data?, error? }` — always unwrap `.data`.
29. **ASIN Lookup page is 5-tabbed** — "ASIN Lookup" | "Keyword Search" | "Reviews" | "Market Intelligence" | "Collections". Tables: `lb_asin_lookups`, `lb_keyword_searches`, `lb_asin_reviews`, `lb_market_intelligence`, `lb_asin_questions` (7-day TTL). All UNIQUE on entity+country. `toAbsoluteAmazonUrl()` for relative URLs.
51. **Apify review provider** — `src/lib/apify.ts`. Actor: `delicious_zebu~amazon-reviews-scraper-with-advanced-filters`. Token from `lb_admin_settings` key `apify_api_token`. Default provider. Background fetch: fire-and-forget → `lb_asin_reviews.status` (`pending → fetching → completed/failed`) + `error_message`. Frontend polls every 3s, auto-resumes on mount. Uses `createAdminClient()` for background DB writes. `max_reviews` is snake_case (actor ignores camelCase). Star ratings: validates `Score` range + `parseRatingFromTitle()` fallback. Images deduplicated. CSV export + image lightbox. Also wired into MI background analysis.
31. **Market Intelligence** — Multi-keyword → dedup ASINs → product selection → 4-phase Claude analysis (16384 tokens each). Status: `pending → collecting → awaiting_selection → analyzing → completed/failed`. "Our Product" badges. Competitor cards: expandable, lightbox, CSV export.
32. **ASIN Lookup auto-fetches Q&A** — `POST /api/asin-lookup` fetches Q&A alongside product data. Cached in `lb_asin_questions`.
33. **Collections, Tags & Notes** — All 4 research tables: `tags TEXT[]` (GIN) + `notes TEXT`. `lb_collections` + `lb_collection_items` (CASCADE). API: `/api/collections` CRUD, `/api/tags` autocomplete. 5th Collections tab.

---

## Database

25 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.
**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs

34. **Seller Pull** — `/seller-pull` pulls catalog via Oxylabs `amazon_search` with `merchant_id`. Multi-country tabs from `lb_admin_settings` `seller_ids` JSON. Smart auto-categorization, bundle detection. Flow: Pull → Import → Scrape Details → Discover Variations. API: `/api/seller-pull` (pull/import/scrape/variations). `fetchSellerProducts()` paginates 3 pages/batch, max 20 pages. Variation discovery: `lookupAsin()` on parent ASINs finds hidden siblings.
37. **Map iteration** — Use `Array.from(map.entries()).forEach()` to avoid `--downlevelIteration` errors.
38. **Creative Brief layer** — `lb_image_workshops` has `creative_brief JSONB`, `product_photos TEXT[]`, `product_photo_descriptions JSONB`. Brief generated via `/api/images/workshop/creative-brief`. Propagates to ALL 6 prompt builders via `buildImageResearchContext()`.
39. **Product photo upload** — `/api/images/workshop/upload-photos` (FormData → Storage). `/api/images/workshop/analyze-photos` → Claude Vision base64. Anthropic SDK 0.24.3 requires base64 — use `fetchImageAsBase64()`.
40. **Workshop 3-state flow** — State 1: no workshop → "Start Workshop". State 2: workshop, no prompts → photos + brief + CTA. State 3: prompts → concept cards. `skip_prompt_generation: true` for photo-first flow. ConceptCard `imageType` prop controls metadata fields per tab.
41. **Reference images** — Product photos as visual refs: OpenAI (`images.edit()` + `toFile()`, `gpt-image-1` model, up to 16 refs), Gemini (`inlineData`). `fetchReferenceImages()` fetches ONCE per batch. `images.generate()` for text-only with `gpt-image-1.5`.

42. **Listing quality rules** — Titles: 185-200 chars (post-gen validation + retry). Bullets: sentence case only (NO ALL CAPS except acronyms), 180-250 chars, 3 variations per bullet. Search terms: no word repetition, lowercase, no brand/ASINs. Backend attributes: 25+ Amazon categories.
43. **DB constraints for bullets** — `lb_listing_sections_section_type_check` includes `bullet_6` through `bullet_10`. `lb_countries`: `bullet_limit=250`, `bullet_count=10`. UNIQUE on `(listing_id, section_type)` — always `.upsert()` with `onConflict`.
47. **Bullet variations format** — `BulletsPhaseResult.bullets` is `string[][]` (not nested strategy objects). Each bullet gets 3 flat variations. `normalizeBullet()` handles legacy format.

48. **MI background analysis** — `/collect` does keyword search + product lookup (~30s). `/select` fires `backgroundAnalyze()` (fire-and-forget) — fetches reviews + Q&A + 4-phase Claude analysis. No separate `/analyze` route. GET `[id]` has 30-min stale detection. Frontend auto-resumes on mount.

44. **Own Product badge** — Green "Own" badge for ASINs in `lb_products`. Batch API: `GET /api/products/check-asins?asins=...`. Collection badges also inline.
45. **Oxylabs source limitations** — `amazon_reviews` unsupported on current plan. Fallback: `amazon_product` top reviews (~13). Code auto-detects.
49. **MI in Research** — MI replaces Competitor Analysis. Bridge record: `lb_research_analysis` with `analysis_type='market_intelligence'`, `source='linked'`, `market_intelligence_id` FK. API: `GET/POST/DELETE /api/research/market-intelligence`. Product count: use `top_asins` fallback when `selected_asins` null. `analyzed_by` → `lbUser.id` (NOT `authUser.id`).
50. **MI auto-resolve in generation** — All listing + image routes auto-resolve linked MI from bridge record. `buildCompetitiveSection()` prefers MI over legacy competitor data. Flows into `buildSharedContext()`, `buildImageResearchContext()`, and all 8 image/video routes.

---

## Pending Tasks

- **e2e Testing:** All modules — Listings, Image Builder, ASIN Lookup, Keyword Search, Reviews, Market Intelligence, Seller Pull
- **Seller Pull — Automated Periodic Pulls:** Automate regular pulls at intervals (not yet built)
