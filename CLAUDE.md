# Amazon Listing Builder Platform

## Quick Reference

| Key | Value |
|-----|-------|
| **Framework** | Next.js 14.0.4 + TypeScript (App Router, `src/` directory) |
| **Styling** | Tailwind CSS + shadcn/ui (HSL variables, `darkMode: ['class']`) |
| **State** | Zustand (`use<Name>Store`) |
| **Database** | Supabase PostgreSQL (project `yawaopfqkkvdqtsagmng`, shared DB) |
| **Auth** | Google OAuth via Supabase Auth (`@chalkola.com` only) |
| **Deployment** | Railway (auto-deploy from GitHub `main`) |
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

**Generates:** Title, 5 bullet points, description, search terms, subject matter — per product, per marketplace.

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

**Deploy:** commit → push to `main` → Railway auto-deploys (Nixpacks).
**If auto-deploy fails:** use `railway up` CLI to force deploy.
**Health check:** `GET /api/health`

---

## Gotchas

1. **`NEXT_PUBLIC_*` vars** — Inlined at build time. Always hardcode production URLs in login/callback routes.
2. **Supabase key rotation** — If 401 errors, verify with `get_publishable_keys` MCP tool and update Railway env vars.
3. **Route groups** — Don't create redirect-only `page.tsx` inside route groups (missing manifest error).
4. **Nixpacks** — Don't use `output: 'standalone'` — Nixpacks overwrites `.next/standalone`.
5. **Middleware** — Must run Supabase client for ALL routes (including `/auth/callback`) for cookie propagation.
6. **FormData uploads** — Never set `Content-Type` header manually; browser adds multipart boundary.
7. **DataDive CSV BOM** — Strip `\uFEFF` before header detection. Filter empty strings from headers.
8. **Railway auto-deploy** — Can silently fail. Verify with `list-deployments` timestamps; use `railway up` as fallback.
9. **TypeScript Set** — Use `Array.from(new Set())` not `[...new Set()]`. Use `new Set<string>(TUPLE)` to widen type.
10. **Supabase Redirect URLs** — Each app sharing the project needs its callback URL added to Auth config.
11. **Claude JSON responses** — Newer models return ```json fences despite instructions. Always `stripMarkdownFences()` before `JSON.parse()`.
12. **Supabase Storage MIME types** — `lb-research-files` bucket allows: csv, excel, txt, markdown, json, octet-stream. Update if adding new file formats.
13. **Large CSV analysis** — Reviews CSV can exceed 200K token limit. `truncateCSVContent()` in claude.ts handles this with even sampling.
14. **Analysis source column** — `lb_research_analysis` has `source` column (`csv`/`file`/`merged`). UNIQUE on `(category_id, country_id, analysis_type, source)`. All consumers pick best source: merged > csv > file. Legacy `'primary'` was migrated out.
15. **Research page coordination** — `ResearchPageClient` wraps `ResearchStatusMatrix` + `ResearchClient`. Matrix click → sets selection → scrolls to research section. State lives in parent, passed as `externalCategoryId`/`externalCountryId`.
19. **Supabase join returns array** — `select('field:table(cols)')` returns array not object. Normalize with `Array.isArray(x) ? x[0] || null : x` before passing to components.
20. **Image builder dual entry** — `/listings/[id]` and `/images` (standalone). Both show 5 tabs: Content/Main/Secondary/Video Thumbnails/Swatches. `image_type` column filters workshops per tab.
22. **Bullet variations format** — 9 variations per bullet as flat array. Old listings may have 3-element arrays. `flattenBullet()` handles both.
23. **SectionCard approval** — `final_text` replaces `is_approved` toggle. Section is "approved" when `final_text.trim()` is non-empty. `is_approved` DB column is derived from `final_text` on save.
24. **Phased generation** — 4 sequential API calls: Title → Bullets → Description+SearchTerms → Backend. Each phase sees full research + prior confirmed output + keyword tracker. API: `/api/listings/generate` with `phase` param. Batch route auto-cascades.
25. **Competitor analysis** — Stored as `analysis_type='competitor_analysis'` in `lb_research_analysis`. Max 5 competitors, 5000 chars each. Uses dedicated API route `/api/research/analyze/competitors`.
26. **Admin settings keys are lowercase** — `lb_admin_settings.key` is case-sensitive. Always use lowercase: `anthropic_api_key`, `openai_api_key`, `google_ai_api_key`. UI has pre-filled slots. Higgsfield API keys removed (uses queue-based approach via automator).
27. **Image providers** — IDs: `openai` (GPT Image 1.5), `gemini` (Flash + Nano Banana Pro), `higgsfield` (queue-based via `hf_prompt_queue` → Edge Function → `fnf.higgsfield.ai`). Models: `nano-banana-pro`, `chatgpt`, `seedream`, `soul`. Model selection: `getEffectiveModelId()` → `model_id` → queue insert.
29. **Image Builder drafts panel** — `/images` page shows saved workshops as clickable draft cards. Clicking resumes the draft.
30. **SP Prompts xlsx parsing** — `sp_prompts` file type accepts xlsx/csv. xlsx is parsed server-side (dynamic `import('xlsx')`) → converted to clean CSV before Supabase storage. Wired into Q&A analysis pipeline with niche-filtering (Claude filters prompts by category).
31. **Product Mapper** — `lb_products` table (ASIN unique key). `/products` page with search, category filter, CRUD, xlsx/csv import. Import upserts on ASIN in batches of 100.
32. **Railway worktrees** — `railway up` uploads ALL worktrees. If any worktree has stale code with build errors, deploy fails. Always `git merge main --ff-only` in all worktrees before deploying.
34. **`.railwayignore`** — Created to exclude worktrees/non-code dirs from `railway up` uploads. Without it, upload times out.
35. **ASIN Lookup via Oxylabs** — `/asin-lookup` page uses Oxylabs E-Commerce Scraper API (`realtime.oxylabs.io/v1/queries`). Credentials stored as `oxylabs_username`/`oxylabs_password` in `lb_admin_settings`. `source: "amazon_product"`, `domain` derived from `lb_countries.amazon_domain` by stripping `amazon.` prefix. Free tier: 2,000 results. Paid: $0.50/1K.
36. **`lb_asin_lookups` table** — UNIQUE on `(asin, country_id)`, upserts on re-lookup. `raw_response` JSONB preserves full payload. 30+ extracted fields.
37. **`lb_keyword_searches` table** — UNIQUE on `(keyword, country_id)`. Stores organic_results, sponsored_results, amazons_choices, suggested_results as JSONB arrays.
38. **ASIN Lookup page is 4-tabbed** — `/asin-lookup` has: "ASIN Lookup" | "Keyword Search" | "Reviews" | "Market Intelligence". `AsinLookupPageClient` wraps all 4 clients.
39. **`lb_asin_reviews` table** — Stores reviews per ASIN+country+sort. UNIQUE on `(asin, country_id, sort_by)`. Reviews stored as JSONB array. Each review: id, title, author, rating, content, timestamp, is_verified, helpful_count, product_attributes, images.
40. **Oxylabs `amazon_reviews` source NOT available on free plan** — API returns "Unsupported source". Fallback uses `amazon_product` top reviews (~13 per product). Code auto-detects: tries `amazon_reviews` first, falls back to `lookupAsin()`. When plan is upgraded, full pagination works with zero code changes.
41. **Keyword search URLs are relative** — Oxylabs returns relative URLs. `toAbsoluteAmazonUrl()` prepends `https://www.{marketplace_domain}`.
43. **Market Intelligence Module (enhanced)** — 4th tab on `/asin-lookup`. `lb_market_intelligence` table. Multi-keyword input → deduplicate ASINs → product selection (checkboxes) → 4-phase Claude analysis (Reviews → Q&A → Market → Strategy, 16384 tokens each, ~65K total). Status flow: `pending → collecting → awaiting_selection → analyzing → completed/failed`. User-selectable `reviews_per_product` (100-500, default 200). Full reviews via `fetchReviews()` + Q&A via `fetchQuestions()`. "Our Product" badges via `lb_products` matching. Competitor cards: expandable, all images, lightbox, Amazon links, review export CSV. Live history search filter.
44. **Oxylabs return types** — `searchKeyword()`, `lookupAsin()`, `fetchQuestions()` all return `{ success, data?, error? }`, NOT the data directly. Always check `.success` and unwrap `.data`.
45. **`lb_asin_questions` table** — Stores Q&A per ASIN+country. UNIQUE on `(asin, country_id)`. 7-day cache TTL. Auto-fetched during ASIN Lookup and Market Intelligence collection. Each question: question, answer, votes, author, date.
46. **ASIN Lookup auto-fetches Q&A** — `POST /api/asin-lookup` fetches Q&A alongside product data. Cached in `lb_asin_questions`. `GET /api/asin-questions?asin=X&country_id=Y` returns cached Q&A. AsinResultCard shows Q&A section in expanded details.

---

## Database

23 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**Key tables:** `lb_users`, `lb_categories`, `lb_countries`, `lb_research_files`, `lb_research_analysis`, `lb_product_types`, `lb_products`, `lb_listings`, `lb_listing_sections`, `lb_listing_chats`, `lb_image_generations`, `lb_image_chats`, `lb_image_workshops`, `lb_batch_jobs`, `lb_admin_settings`, `lb_sync_logs`, `lb_export_logs`, `lb_aplus_modules`, `lb_asin_lookups`, `lb_keyword_searches`, `lb_asin_reviews`, `lb_market_intelligence`, `lb_asin_questions`

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.

**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs

`docs/SCHEMA.md` (DDL) | `docs/SESSION-LOG.md` (history) | `docs/RESEARCH-FORMATS.md` (CSV specs) | `docs/PHASE-DETAILS.md` (phases 7-8)

---

## Seller Pull

47. **Seller Pull page** — `/seller-pull` pulls product catalog from Amazon via Oxylabs `amazon_search` with `merchant_id` context filter. Multi-country tabs from configured seller IDs in `lb_admin_settings` (key: `seller_ids`, JSON `{ country_id: seller_id }`). Smart auto-categorization: keyword-frequency map from existing `lb_products` suggests categories, per-product dropdown + "+" new category. Bundle detection: title keywords ("bundle", "bundled", " + ") + no-price/no-reviews heuristic. Bundles visible by default with toggle, "Has Sales" badge. Flow: Pull → Import → Scrape Details → Discover Variations. Each country tab maintains independent state.
48. **Seller Pull API routes** — `POST /api/seller-pull` (pull from Oxylabs), `POST /api/seller-pull/import` (upsert to `lb_products` with per-product categories), `POST /api/seller-pull/scrape` (sequential `lookupAsin()` with 1s delay), `POST /api/seller-pull/variations` (discover hidden variation siblings via parent ASIN).
49. **`fetchSellerProducts()` in oxylabs.ts** — Paginates in batches of 3 pages with 3s delay. Query: `" "` (space). Deduplicates by ASIN. Max 20 pages. Returns `SellerProduct[]` with asin, title, price, rating, reviews_count, is_prime, url_image, manufacturer, sales_volume.
50. **Seller search only shows ~1 child per variation** — Only 1 of 4 variation siblings appears in seller search results. Variation discovery step uses `lookupAsin()` on parent ASINs to find hidden siblings.
51. **Map iteration in TypeScript** — Use `Array.from(map.entries()).forEach()` instead of `for...of` on Maps to avoid `--downlevelIteration` errors.

---

## Pending Tasks

- **e2e Testing (all modules):** Phased generation (4-phase wizard + keyword coverage), Image Builder (all 5 tabs + drafts), ASIN Lookup (expanded fields + Q&A), Keyword Search (organic/sponsored tabs), Market Intelligence (single + multi-keyword, product selection, 4-phase analysis, Q&A, lightbox, CSV export, Our Product badges, live search), Seller Pull (multi-country, smart categories, bundle toggle, import/scrape/variations flow)
- **Oxylabs Plan Upgrade + Full Reviews Testing:**
  1. Upgrade Oxylabs plan to unlock `amazon_reviews` source
  2. Test with 500-1000 review product — verify full pagination works
  3. Code is ready — auto-detects source availability, no changes needed
- **Seller Pull — Automated Periodic Pulls:** User wants to automate regular pulls at intervals (not yet built)
