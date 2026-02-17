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
| **Table Prefix** | `lb_` (16 tables, 60 RLS policies) |
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

```
Dependency tree (all completed phases omitted):
Phase 2 (research upload) ─┬─ Phase 7 (Apify/DataDive)
                           └─ Phase 8 (Google Drive)
```

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
14. **Analysis source column** — `lb_research_analysis` has `source` column (`primary`/`csv`/`file`/`merged`). UNIQUE on `(category_id, country_id, analysis_type, source)`. All consumers must pick best source: merged > csv > file > primary.
15. **Stale processing detection** — Analysis stuck >5min in `processing` shows "Stuck — Retry" button. API route deletes+re-inserts on retry.
16. **Workshop state loss** — `useWorkshopStore` is Zustand (client-only). Navigating away loses all prompts/progress. Must persist to DB.
17. **Analysis source='primary' legacy** — Old analyses used `source='primary'`. New 3-row UI looks for `csv`/`file`/`merged`. Must handle `primary` records or migrate them.
18. **Research page coordination** — `ResearchPageClient` wraps `ResearchStatusMatrix` + `ResearchClient`. Matrix click → sets selection → scrolls to research section. State lives in parent, passed as `externalCategoryId`/`externalCountryId`.

---

## Database

17 tables prefixed `lb_`. Full DDL in `docs/SCHEMA.md`.

**Key tables:** `lb_users`, `lb_categories`, `lb_countries`, `lb_research_files`, `lb_research_analysis`, `lb_product_types`, `lb_listings`, `lb_listing_sections`, `lb_listing_chats`, `lb_image_generations`, `lb_image_chats`, `lb_image_workshops`, `lb_batch_jobs`, `lb_admin_settings`, `lb_sync_logs`, `lb_export_logs`, `lb_aplus_modules`

**RLS pattern:** All authenticated users can CRUD (except `lb_admin_settings` = admin only). All policies use `(SELECT auth.uid())` wrapper.

**10 countries seeded** in `lb_countries` (US, UK, DE, FR, CA, IT, ES, MX, AU, AE). Character limits stored per-country.

---

## Reference Docs (not loaded by default)

| File | Contents |
|------|----------|
| `docs/SCHEMA.md` | Full SQL DDL for all 16 tables, seed data, RLS patterns |
| `docs/SESSION-LOG.md` | Historical session notes (Sessions 1-9) |
| `docs/RESEARCH-FORMATS.md` | CSV format specs for keywords, reviews, Q&A |
| `docs/PHASE-DETAILS.md` | Specs for remaining phases (7, 8) |

---

## Pending Tasks

- **Research Analysis Bugs (next session — PRIORITY):**
  1. Third tab shows "Keywords — Analysis" — should be "Keywords — Merged"; similarly for Reviews/Q&A
  2. Merged tab has data even though merge was never run — old `primary` source records showing as merged? Check DB source values
  3. Reviews + Q&A show "Not run" despite completed analyses existing in DB — status sync issue between `AnalysisStatusPanel` and actual DB records. Likely the `source` field on old records is `primary` (not `csv`/`file`) so the 3-row breakdown doesn't find them
  4. Root cause: old analyses were created with `source='primary'` before the multi-source system. The new 3-row UI only looks for `csv`/`file`/`merged` — never `primary`. Need migration or UI fallback for `primary` records

- **Image Builder UX Redesign:**
  1. Merge Workshop + Image Builder into ONE unified experience (no separate pages)
  2. Listing-centric flow: image generation lives inside a listing, not standalone
  3. AI-first prompts, workshop state persisted to DB

## Pending User Actions

- Set `anthropic_api_key` in Admin Settings UI to enable Claude AI features
- Set `openai_api_key` in Admin Settings UI for DALL-E 3 image generation
- Set `google_ai_api_key` in Admin Settings UI for Gemini image generation
