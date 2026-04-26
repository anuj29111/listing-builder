# Amazon Listing Builder Platform

## Quick Reference

| Key | Value |
|-----|-------|
| **Framework** | Next.js 14.0.4 + TypeScript (App Router, `src/` directory) |
| **Styling** | Tailwind CSS + shadcn/ui (HSL variables, `darkMode: ['class']`) |
| **State** | Zustand (`use<Name>Store`) |
| **Database** | Supabase PostgreSQL (project `yawaopfqkkvdqtsagmng`, shared DB) |
| **Auth** | Google OAuth via Supabase Auth (`@chalkola.com` only). Dev bypass: `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` in `.env.local` |
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
51. **Apify review provider** — `src/lib/apify.ts`. Actor: `delicious_zebu~amazon-reviews-scraper-with-advanced-filters`. Token: `apify_api_token`. Background fetch: fire-and-forget → status polling via `fetchingIdsRef` (ref avoids stale closure). `createAdminClient()` for background writes. `max_reviews` snake_case only — ALWAYS send it (0=no limit, omitting uses actor's tiny default). Actor fields: `ReviewScore`(string), `ReviewId`, `HelpfulCounts`(text), `Variant`(array), `Verified`(bool), aspects: `positiv`/`negativ`/`aspect_name`. Smart refresh + confirmation dialog. Paginated (25/page), collapsible. CSV includes image URLs. Wired into MI. Actor returns ~3.4x duplicates (multi-filter scraping) — dedup on `ReviewId` is correct and required.
31. **Market Intelligence** — Multi-keyword → parent-level dedup (highest `sales_volume` per `parent_asin`) → product selection (auto-saved to DB, BSR/badges) → parallel Apify reviews (`fetchReviewsParallel()`: 3s stagger, 15s poll, 75%+ threshold) → Q&A sequential → 4-phase Claude analysis. Primitives in `apify.ts`: `startApifyReviewRun`, `checkApifyRunStatus`, `fetchApifyDataset`. **Resilience**: `runMIPhase()` retries 3x for 429/5xx (60s/120s/240s backoff). 30s delay between phases. Each phase result persisted to `analysis_result` immediately. `progress.completed_phases` tracks done phases. Failed runs resumable via Resume button (skips review/Q&A fetch if data exists, skips completed Claude phases).
32. **ASIN Lookup auto-fetches Q&A** — `POST /api/asin-lookup` fetches Q&A alongside product data. Cached in `lb_asin_questions`.
33. **Collections, Tags & Notes** — All 4 research tables: `tags TEXT[]` (GIN) + `notes TEXT`. `lb_collections` + `lb_collection_items` (CASCADE). API: `/api/collections` CRUD, `/api/tags` autocomplete. 5th Collections tab.

---

## Database

25 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.
**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs

34. **Seller Pull** — `/seller-pull` pulls catalog via Oxylabs `amazon_search` with `merchant_id`. Multi-country tabs from `lb_admin_settings` `seller_ids` JSON. Smart auto-categorization, bundle detection. Flow: Pull → Import → Scrape Details → Discover Variations. `fetchSellerProducts()` paginates 3 pages/batch, max 20 pages.
37. **Map iteration** — Use `Array.from(map.entries()).forEach()` to avoid `--downlevelIteration` errors.
38. **Creative Brief layer** — `lb_image_workshops` has `creative_brief JSONB`, `product_photos TEXT[]`, `product_photo_descriptions JSONB`. Brief generated via `/api/images/workshop/creative-brief`. Propagates to ALL 6 prompt builders via `buildImageResearchContext()`.
39. **Product photo upload** — `/api/images/workshop/upload-photos` (FormData → Storage). `/api/images/workshop/analyze-photos` → Claude Vision base64. Anthropic SDK 0.24.3 requires base64 — use `fetchImageAsBase64()`.
40. **Workshop 3-state flow** — State 1: no workshop → "Start Workshop". State 2: workshop, no prompts → photos + brief + CTA. State 3: prompts → concept cards. `skip_prompt_generation: true` for photo-first flow. ConceptCard `imageType` prop controls metadata fields per tab.
41. **Reference images** — Product photos as visual refs: OpenAI (`images.edit()` + `toFile()`, `gpt-image-1` model, up to 16 refs), Gemini (`inlineData`). `fetchReferenceImages()` fetches ONCE per batch. `images.generate()` for text-only with `gpt-image-1.5`.
42. **Listing quality rules** — Titles: 185-200 chars (validation + retry). Bullets: sentence case, 180-250 chars, 3 variations. Search terms: no repetition, lowercase, no brand/ASINs.
43. **DB constraints for bullets** — `bullet_6`–`bullet_10` in check constraint. `bullet_limit=250`, `bullet_count=10`. UNIQUE `(listing_id, section_type)` — always `.upsert()` with `onConflict`.
47. **Bullet variations format** — `BulletsPhaseResult.bullets` is `string[][]` (not nested strategy objects). Each bullet gets 3 flat variations. `normalizeBullet()` handles legacy format.
44. **Own Product badge** — Green "Own" badge for ASINs in `lb_products`. Batch API: `GET /api/products/check-asins?asins=...`. Collection badges also inline.
45. **Oxylabs source limitations** — `amazon_reviews` unsupported on current plan. Fallback: `amazon_product` top reviews (~13). Code auto-detects.
49. **MI in Research** — Bridge: `lb_research_analysis` with `analysis_type='market_intelligence'`, `source='linked'`, `market_intelligence_id` FK. `analyzed_by` → `lbUser.id` (NOT `authUser.id`).
50. **MI auto-resolve in generation** — All listing + image routes auto-resolve linked MI. `buildCompetitiveSection()` prefers MI over legacy competitor data.
52. **Apify review quirks** — `RatingTypeTotalReviews` unreliable (sometimes "5.0 out of 5 stars"), fallback if parsed < actual. Smart refresh: auto if >3 months or requesting more; `status: 'exists'` → confirmation dialog.
54. **Apify polling timeout** — `APIFY_MAX_WAIT_SECS = 3600` (60 min). Stale fetch recovery: >30 min → auto-reset to failed. NEVER deploy while fetching.
55. **Reviews history** — page.tsx MUST include `status, error_message` in SELECT. `refreshHistory()` on mount. Expanded view: full ReviewCards, 25/page pagination, no "+X more".
56. **`maxReviewsRequested`** — Stored in `raw_response` JSONB. Displayed as "(requested: X)" in results header and expanded view.

57. **Rufus Q&A Chrome Extension** — `tools/rufus-chrome-extension/` (MV3, **v1.13.0**). Two modes: **Auto-chips** (click Rufus's suggested chips until exhausted) and **Manual questions** (type your own — Amy Wees Rufus loop). Sequential, one ASIN at a time. POST `/api/rufus-qna` with bearer `rufus_extension_api_key`. Upserts to `lb_asin_questions` (`onConflict: asin,country_id`). **See [rufus.md](rufus.md) for the full playbook + DOM selectors + gotchas.**
58. **Rufus chat memory persists across page navigation** — server-side per user. v1.13.0 fix: `askCustomQuestions` clicks `#rufus-panel-header-new-chat` after opening Rufus, before typing. Even after that, Rufus dedup-shortens repeat questions across sessions — vary phrasing per ASIN if running across many products.
59. **Rufus active-turn class trap** — completed turns: `.rufus-papyrus-turn`. **Currently streaming turn: `.rufus-papyrus-active-turn` only** (NOT also tagged `.rufus-papyrus-turn`). Always query both. Wait-for-streaming heuristic: poll markdown-section text length, "done" when stable for 2.5s past 50 chars (loader classes change too often to rely on).
60. **Rufus typing requires React-friendly value setter** — `textarea.value = '...'` leaves submit button disabled. Use `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text)` then dispatch `input` + `change` events.
61. **Rufus telemetry** — Every extraction ships to `lb_rufus_extraction_logs` via `POST /api/rufus-qna/telemetry`. Row includes status, questions_found, batches_run, duration_ms, error_phase, `telemetry` JSONB (per-batch + selectors_hit), `dom_snapshot` TEXT (failures only, ≤300KB). Query: `SELECT asin,status,questions_found,error_phase FROM lb_rufus_extraction_logs ORDER BY created_at DESC LIMIT 20;`

62. **Research PDF download** — `src/lib/research-pdf.ts`. Print-to-PDF for keyword, review, Q&A analyses. Button in `AnalysisMeta` bar. Same pattern as `mi-pdf.ts`.

---

## Pending Tasks

- **Pre-listing data intake step:** Before listing generation, add an optional "Product Info" step that collects all available data upfront (images, existing listing details, competitor info). For new products: optional but presented first. For existing products: auto-pull current listing data. Listings engine should see everything before generation starts.
- **e2e Testing:** All modules — Listings, Image Builder, ASIN Lookup, Keyword Search, Reviews, Market Intelligence, Seller Pull
- **Seller Pull — Automated Periodic Pulls:** Automate regular pulls at intervals (not yet built)
- **🔴 RUFUS FULL AUTOMATION (next session):** 6-ASIN pilot done 2026-04-26 (144 Q&A in `lb_asin_questions`). To get to "Run Full Amy Loop from website" zero-touch: **see [RUFUS_AUTOMATION_PLAN.md](RUFUS_AUTOMATION_PLAN.md)** — 6-phase build (DB migration → API endpoints → extension v1.14 → /rufus-qna page → listing-gen integration → always-on Chrome runner). Est. 1-2 dev days. Has all DOM selectors, prompt templates, and gotchas pre-documented so the next session doesn't relearn.
- **Rufus extension v1.13.0:** Manual-questions mode works (`tools/rufus-chrome-extension/`). Reload in chrome://extensions, paste ASIN + 20 questions, click Start — extension runs Rufus end-to-end + auto-saves to DB via `/api/rufus-qna` (CORS deployed).
- **MI → Rufus Pipeline:** Flow selected MI ASINs into Rufus Q&A module for automated extraction (depends on Phase 4 of automation plan)

---

## ⚠️ Shared Supabase DB Pressure (Crash Prevention)

This repo connects to shared Supabase `yawaopfqkkvdqtsagmng` (ap-south-1, **Medium 4 GB RAM**) used by all Chalkola systems. Hot working set (~13-14 GB) exceeds RAM → crashes at peak IST (12-2 PM) recurring.

**This repo's role:** Listing automation, keyword research, Market Intelligence, Seller Pull, Rufus extraction. Reads from `products`/`product_variants` + keyword/review data. Lower write volume than Ads-API or Sp-API, but MI/Seller-Pull can trigger large reads against hot tables.

**Hot tables — always filter marketplace+date, never full-scan:** `ads_export_targets` (3.6 GB), `ads_sb_keyword_daily` (3.4 GB), `si_daily_ranks` (3.1 GB, 2.3M rows), `pop_sp_search_term_data` (1.2 GB, 85% cache hit), `pop_sp_search_term_data_daily` (1 GB), `sp_settlement_transactions` (598 MB), `si_keywords` (276 MB).

**Crash signature:** 5-min keepalive gap + clean `pg_postmaster_start_time` = Supabase platform OOM respawn. Find windows via `hf-token-keepalive` gaps >90s in `cron.job_run_details`.

**Coding rules for this repo:**
- Never `SELECT * FROM <hot_table>` without marketplace+date filters
- Avoid heavy reads during 12-2 PM IST peak window
- Batch operations (2000+ per batch) if writing
- pg_cron: no `cron.alter_job`, `current_setting('app.*')` = NULL, `VACUUM` can't run in pg_cron, `REFRESH MV CONCURRENTLY` needs unique index on COLUMNS not expressions
- Cache Sonnet/Haiku responses where possible (prompt caching enabled)

**Permanent fix:** upgrade Medium→Large ($110/mo, 8 GB RAM). Until then, minimize cross-repo DB reads.

*Last Updated: April 21, 2026 (Supabase compute ceiling — crash prevention rules added)*
