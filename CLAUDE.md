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

**Deploy:** commit → push to `main` → Railway auto-deploys (Nixpacks).
**If auto-deploy fails:** use `railway up` CLI to force deploy.
**Health check:** `GET /api/health`

---

## Gotchas

1. **`NEXT_PUBLIC_*` vars** — Inlined at build time. Hardcode production URLs in login/callback routes.
2. **Supabase key rotation** — 401 errors → verify with `get_publishable_keys` MCP tool and update Railway env vars.
3. **Route groups** — Don't create redirect-only `page.tsx` inside route groups (missing manifest error).
4. **Nixpacks** — Don't use `output: 'standalone'`. **Middleware** — Must run Supabase client for ALL routes for cookie propagation.
5. **FormData uploads** — Never set `Content-Type` header manually. **DataDive CSV BOM** — Strip `\uFEFF` before header detection.
6. **Railway auto-deploy** — Can silently fail. Use `railway up` as fallback. **TypeScript Set** — Use `Array.from(new Set())`.
7. **Supabase Redirect URLs** — Each app needs its callback URL added to Auth config.
8. **Claude JSON responses** — Always `stripMarkdownFences()` before `JSON.parse()`.
9. **Supabase Storage MIME types** — `lb-research-files`: csv, excel, txt, markdown, json, octet-stream.
10. **Large CSV analysis** — `truncateCSVContent()` handles >200K token CSVs with even sampling.
11. **Analysis source column** — `lb_research_analysis.source`: `csv`/`file`/`merged`. UNIQUE on `(category_id, country_id, analysis_type, source)`. Consumers pick: merged > csv > file.
12. **Research page coordination** — `ResearchPageClient` wraps `ResearchStatusMatrix` + `ResearchClient`. Matrix click → sets selection → scrolls.
19. **Supabase join returns array** — `select('field:table(cols)')` returns array not object. Normalize with `Array.isArray(x) ? x[0] || null : x`.
20. **Image builder** — Dual entry: `/listings/[id]` and `/images` (standalone). 5 tabs. `image_type` column filters workshops per tab. Drafts panel resumes saved workshops.
21. **Listings** — Bullet variations: 3 per bullet (was 9, reduced for clarity). SectionCard: `final_text` = approved. Phased generation: 4 sequential API calls via `/api/listings/generate` with `phase` param. Title generation has post-gen length validation with retry (LLMs can't count chars). Bullets support 5-10 dynamically. Collapsible bullet containers in wizard + review. Auto-advance from generation to Review step.
22. **Competitor analysis** — `analysis_type='competitor_analysis'` in `lb_research_analysis`. Max 5 competitors, 5000 chars each.
23. **Admin settings keys are lowercase** — `anthropic_api_key`, `openai_api_key`, `google_ai_api_key`.
24. **Image providers** — `openai` (GPT Image 1.5), `gemini` (Flash + Nano Banana Pro), `higgsfield` (queue-based via `hf_prompt_queue`). Models: `nano-banana-pro`, `chatgpt`, `seedream`, `soul`.
25. **SP Prompts xlsx parsing** — xlsx parsed server-side (`import('xlsx')`) → CSV. Wired into Q&A analysis with niche-filtering.
26. **Product Mapper** — `lb_products` table (ASIN unique key). `/products` page. Import upserts on ASIN in batches of 100.
27. **Railway worktrees + `.railwayignore`** — Exclude worktree dirs or `railway up` times out. Merge main into all worktrees before deploying.
28. **ASIN Lookup via Oxylabs** — Oxylabs E-Commerce Scraper API. Credentials in `lb_admin_settings`. `domain` from `lb_countries.amazon_domain` minus `amazon.` prefix. `searchKeyword()`, `lookupAsin()`, `fetchQuestions()` return `{ success, data?, error? }` — always unwrap `.data`.
29. **ASIN Lookup page is 5-tabbed** — "ASIN Lookup" | "Keyword Search" | "Reviews" | "Market Intelligence" | "Collections". Tables: `lb_asin_lookups` (UNIQUE asin+country), `lb_keyword_searches` (UNIQUE keyword+country), `lb_asin_reviews` (UNIQUE asin+country+sort_by), `lb_market_intelligence`, `lb_asin_questions` (7-day cache TTL). Keyword search URLs are relative — `toAbsoluteAmazonUrl()` prepends domain.
30. **Oxylabs `amazon_reviews` NOT on free plan** — Fallback uses `amazon_product` top reviews. Code auto-detects. Full pagination works when upgraded.
31. **Market Intelligence** — Multi-keyword → deduplicate ASINs → product selection → 4-phase Claude analysis (Reviews → Q&A → Market → Strategy, 16384 tokens each). Status: `pending → collecting → awaiting_selection → analyzing → completed/failed`. `reviews_per_product` 100-500. "Our Product" badges via `lb_products`. Competitor cards: expandable, lightbox, CSV export.
32. **ASIN Lookup auto-fetches Q&A** — `POST /api/asin-lookup` fetches Q&A alongside product data. Cached in `lb_asin_questions`.
33. **Collections, Tags & Notes** — All 4 research tables have `tags TEXT[]` (GIN-indexed) + `notes TEXT`. `lb_collections` + `lb_collection_items` (junction, CASCADE). API: `/api/collections` CRUD, `/api/tags` autocomplete. PATCH on all 4 entity `[id]` routes. Shared: `TagInput`, `NotesEditor`, `CollectionPicker`. Zustand `collection-store`. 5th Collections tab. Inline tag badges + notes indicator on history rows.

---

## Database

25 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**Key tables:** `lb_users`, `lb_categories`, `lb_countries`, `lb_research_files`, `lb_research_analysis`, `lb_product_types`, `lb_products`, `lb_listings`, `lb_listing_sections`, `lb_listing_chats`, `lb_image_generations`, `lb_image_chats`, `lb_image_workshops`, `lb_batch_jobs`, `lb_admin_settings`, `lb_sync_logs`, `lb_export_logs`, `lb_aplus_modules`, `lb_asin_lookups`, `lb_keyword_searches`, `lb_asin_reviews`, `lb_market_intelligence`, `lb_asin_questions`, `lb_collections`, `lb_collection_items`

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.

**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs

`docs/SCHEMA.md` (DDL) | `docs/SESSION-LOG.md` (history) | `docs/RESEARCH-FORMATS.md` (CSV specs) | `docs/PHASE-DETAILS.md` (phases 7-8)

34. **Seller Pull** — `/seller-pull` pulls catalog via Oxylabs `amazon_search` with `merchant_id`. Multi-country tabs from `lb_admin_settings` `seller_ids` JSON. Smart auto-categorization from `lb_products`. Bundle detection. Flow: Pull → Import → Scrape Details → Discover Variations.
35. **Seller Pull API** — `/api/seller-pull` (pull), `/api/seller-pull/import` (upsert), `/api/seller-pull/scrape` (sequential lookup), `/api/seller-pull/variations` (discover siblings). `fetchSellerProducts()` paginates 3 pages/batch, max 20 pages.
36. **Seller variation discovery** — Only ~1 child per variation in search. `lookupAsin()` on parent ASINs finds hidden siblings.
37. **Map iteration** — Use `Array.from(map.entries()).forEach()` to avoid `--downlevelIteration` errors.
38. **Creative Brief layer** — `lb_image_workshops` has `creative_brief JSONB`, `product_photos TEXT[]`, `product_photo_descriptions JSONB`. Brief is generated via `POST /api/images/workshop/creative-brief` (uses all research + Market Intelligence). Prepended to `buildImageResearchContext()` and propagates to ALL 6 prompt builders automatically.
39. **Product photo upload** — `POST /api/images/workshop/upload-photos` (FormData → Supabase Storage `lb-images/product-photos/{workshopId}/`). `POST /api/images/workshop/analyze-photos` → Claude Vision base64 analysis. Anthropic SDK 0.24.3 requires base64 images not URL-based — use `fetchImageAsBase64()` helper.
40. **ConceptCard `imageType` prop** — Controls which metadata fields show inline. Main: camera_angle, frame_fill, emotional_target, lighting. Secondary: target_audience, mood, layout_type + color swatches + sub_headline + usp always visible. Thumbnail: camera, mood, lighting. Swatch: minimal.
41. **Workshop 3-state flow** — State 1: no workshop → "Start Workshop" button. State 2: workshop exists, no prompts → `WorkshopProductPhotos` + `CreativeBriefPanel` + "Generate Concepts" CTA. State 3: prompts exist → collapsible research context + concept cards. `skip_prompt_generation: true` flag creates empty workshop for photo-first flow.
44. **Reference images in generation** — Product photos passed as visual references to OpenAI (`images.edit()` with `toFile()`) and Gemini (`inlineData` parts). `fetchReferenceImages()` fetches ONCE per batch at route level, reused across all prompts. Higgsfield skips (queue-based). Prompt prefixed with branding instruction.
45. **OpenAI edit vs generate** — `images.edit()` uses `gpt-image-1` model (not `gpt-image-1.5`). Accepts up to 16 reference images as `Uploadable[]`. `images.generate()` remains for text-only prompts with `gpt-image-1.5`.

42. **Listing quality rules** — Titles: 185-200 chars (post-gen validation + retry). Bullets: sentence case only (NO ALL CAPS except acronyms), 180-250 chars, 3 balanced variations per bullet (post-gen validation + retry, same as titles). Search terms: no word repetition from title/bullets/desc, lowercase, no brand/ASINs. Backend attributes: 25+ Amazon categories.
43. **DB constraints for bullets** — `lb_listing_sections_section_type_check` includes `bullet_6` through `bullet_10`. `lb_countries`: `bullet_limit=250`, `bullet_count=10`.
46. **Listing section UNIQUE constraint** — `lb_listing_sections` has UNIQUE on `(listing_id, section_type)`. All section inserts use `.upsert(..., { onConflict: 'listing_id,section_type' })` to prevent duplicates on retry/re-generation.
47. **Bullet variations format** — `BulletsPhaseResult.bullets` is `string[][]` (not nested strategy objects). Each bullet gets 3 flat variations. `normalizeBullet()` handles legacy format backward compat.

44. **Own Product badge** — ASIN Lookup rows show green "Own" badge for ASINs in `lb_products`. Batch API: `GET /api/products/check-asins?asins=...`. Collection badges (colored initials) also inline on rows.
45. **Oxylabs source limitations** — `amazon_reviews` source returns "Unsupported source" on current plan. `amazon` web scraper can't parse URLs. Fallback: `amazon_product` top reviews (~13). Code auto-detects and shows clean message.

---

## Pending Tasks

- **Market Intelligence — Background Jobs:** Refactor MI to run analysis in background (like Seller Pull jobs pattern). Currently blocks the UI during 4-phase Claude analysis. Use `lb_batch_jobs` or new `lb_market_intelligence_jobs` table with status tracking.
- **e2e Testing (all modules):** Phased generation (4-phase wizard + keyword coverage), Image Builder (all 5 tabs + drafts), ASIN Lookup (expanded fields + Q&A), Keyword Search (organic/sponsored tabs), Market Intelligence (single + multi-keyword, product selection, 4-phase analysis, Q&A, lightbox, CSV export, Our Product badges, live search), Seller Pull (multi-country, smart categories, bundle toggle, import/scrape/variations flow)
- **Oxylabs `amazon_reviews` Source:** Contact Oxylabs to enable `amazon_reviews` source on plan. Code is ready — auto-detects and falls back.
- **Seller Pull — Automated Periodic Pulls:** Automate regular pulls at intervals (not yet built)
