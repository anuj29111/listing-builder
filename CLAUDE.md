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
| **Table Prefix** | `lb_` (18 tables, 62 RLS policies) |
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
OPENAI_API_KEY=                 # DALL-E 3 (Phase 9)
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
20. **Image builder dual entry** — `/listings/[id]` (tabs: Content/Main/Secondary/Video Thumbnails/Swatches) and `/images` (standalone with context picker + drafts panel). Both use shared section components.
21. **Workshop image_type column** — `lb_image_workshops.image_type` supports `'main'`, `'secondary'`, `'video_thumbnail'`, `'swatch'`. Filter workshops by `image_type` when loading for each tab.
22. **Bullet variations format** — New listings store 9 variations per bullet as flat array: `[seo_concise, seo_medium, seo_longer, benefit_concise, ..., balanced_longer]`. Old listings may have 3-element arrays. `flattenBullet()` in API route handles both.
23. **SectionCard approval** — `final_text` replaces `is_approved` toggle. Section is "approved" when `final_text.trim()` is non-empty. `is_approved` DB column is derived from `final_text` on save.
24. **Phased generation (cascading keyword waterfall)** — Listing generation uses 4 sequential API calls: Title (16384 tokens) → Bullets (32768) → Description+SearchTerms (16384) → Backend (8192). Each phase sees full research data + confirmed output from prior phases + keyword coverage tracker. API route: `/api/listings/generate` with `phase` parameter. Batch route auto-cascades all 4 phases. Never limit token budgets — full data in every phase.
25. **Competitor analysis** — Stored as `analysis_type='competitor_analysis'` in `lb_research_analysis`. Max 5 competitors, 5000 chars each. Uses dedicated API route `/api/research/analyze/competitors`.
26. **Admin settings keys are lowercase** — `lb_admin_settings.key` is case-sensitive. Always use lowercase: `anthropic_api_key`, `openai_api_key`, `google_ai_api_key`, `higgsfield_api_key`, `higgsfield_api_secret`. UI now has pre-filled slots.
27. **Gemini model 404** — `gemini-2.0-flash-exp` returns 404. Needs updating to a valid model in `src/lib/gemini.ts`. Fix in next session.
28. **Image builder 5 tabs** — Listing detail + standalone `/images` both show: Content, Main, Secondary, Video Thumbnails, Swatches. Tab bar has `overflow-x-auto` for mobile.
29. **Image Builder drafts panel** — `/images` page shows saved workshops as clickable draft cards. Clicking resumes the draft by setting context + active tab.
30. **SP Prompts xlsx parsing** — `sp_prompts` file type accepts xlsx/csv. xlsx is parsed server-side (dynamic `import('xlsx')`) → converted to clean CSV before Supabase storage. Wired into Q&A analysis pipeline with niche-filtering (Claude filters prompts by category).
31. **Product Mapper** — `lb_products` table (ASIN unique key). `/products` page with search, category filter, CRUD, xlsx/csv import. Import upserts on ASIN in batches of 100.

---

## Database

18 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**Key tables:** `lb_users`, `lb_categories`, `lb_countries`, `lb_research_files`, `lb_research_analysis`, `lb_product_types`, `lb_products`, `lb_listings`, `lb_listing_sections`, `lb_listing_chats`, `lb_image_generations`, `lb_image_chats`, `lb_image_workshops`, `lb_batch_jobs`, `lb_admin_settings`, `lb_sync_logs`, `lb_export_logs`, `lb_aplus_modules`

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.

**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs

`docs/SCHEMA.md` (DDL) | `docs/SESSION-LOG.md` (history) | `docs/RESEARCH-FORMATS.md` (CSV specs) | `docs/PHASE-DETAILS.md` (phases 7-8)

---

## Pending Tasks

- **Fix Gemini model** — Update `gemini-2.0-flash-exp` → valid model name in `src/lib/gemini.ts` (returns 404)
- **Phased Generation e2e Testing:**
  1. New listing wizard — verify 4-phase flow: Generate Titles → confirm → Generate Bullets → confirm → Description → Backend
  2. Keyword coverage panel — verify score climbs across phases (30% → 60% → 85% → 95%+)
  3. SectionCard in wizard — "Use" buttons copy to final text, confirm buttons advance phases
  4. Re-generation — regenerate a phase, verify downstream phases reset
- **Session 15 Enhancement Testing:**
  1. Test Competitor Analysis — Research page → paste competitors → analyze → verify saved
  2. Test Optimize Existing mode — wizard toggle → paste listing → verify optimized variations
  3. Test Q&A Verification — listing detail → "Verify Q&A Coverage" → coverage matrix
  4. Test Image Stack Recommendations — secondary images tab → "Get Recommendations"
- **Image Builder e2e Testing:**
  1. Test all 4 image flows: main, secondary, video thumbnails, swatch
  2. Test drafts panel: generate → navigate away → return → click draft → verify resume
  3. Verify DB persistence across navigation
