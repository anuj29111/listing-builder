# Phase Details

> Detailed specs for each phase. Moved out of CLAUDE.md. Only Phases 7 and 8 are NOT STARTED.

## Phase 7: Research Acquisition (Apify/DataDive) — NOT STARTED

**What:** Automated scraping integrations for reviews, keywords, Q&A.
**Depends on:** Phase 2
**Key files:**
- `lib/apify.ts` — Apify API wrapper
- `api/research/scrape/route.ts` — Trigger scraping jobs
- Scraping status tracking UI
**Verify:** Enter ASINs, trigger review scrape, results auto-populate research files.

## Phase 8: Google Drive Integration — NOT STARTED

**What:** Sync research files from Google Drive automatically.
**Depends on:** Phase 2
**Key files:**
- `lib/google-drive.ts` — Google Drive API wrapper
- `api/sync/google-drive/route.ts` — Sync trigger + polling
- Sync status UI
**Verify:** Connect Drive folder, sync detects new files, auto-registers in system.
