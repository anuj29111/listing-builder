# Rufus Q&A Extractor — Playbook

Single source of truth for the Rufus Chrome extension + Amy Wees Rufus loop. Cap: 300 lines. Update inline; don't grow indefinitely.

## What this is
Chrome extension at `tools/rufus-chrome-extension/` that automates Q&A capture from Amazon's Rufus AI shopping assistant on product pages. Two modes:

1. **Auto chips** — extension clicks Rufus's suggested chip buttons until exhausted. Best for "what does Rufus volunteer about this ASIN" baseline data.
2. **Manual questions** — extension types your own questions into Rufus chat input, captures each answer. Best for the Amy Wees Rufus loop (5 framing Qs → 30-50 follow-ups → synthesize).

Captured Q&A flows to Listing Builder Supabase via `POST /api/rufus-qna` (tagged `source: 'rufus'`). Tab `lb_asin_questions`.

## Amy Wees 5-step loop (the playbook)

1. **Ask Rufus 5 framing Qs** about your ASIN (this is Pass 1):
   - What is this product for?
   - What do people like about this product?
   - What don't people like about this product?
   - What are people buying instead?
   - Why do people choose this over alternatives?

2. **Paste answers into Claude/ChatGPT** with this scaffold:
   > "I'm optimizing an Amazon listing for AI, SEO, and conversions. Here's the listing copy + Rufus feedback. Generate 30-50 deeper Rufus follow-up questions in buckets: category/intent, objections/trust, comparison logic, ingredients/formula, usage/lifestyle, results/expectations, packaging/convenience."

3. **Run those follow-ups through Rufus** (this is Pass 2). Output is typically ~120 pages.

4. **Claude synthesizes everything** into title / 5 bullets / description / 8 image briefs / A+ modules.

5. **Ship → re-test quarterly.**

The point: find places Rufus has the wrong belief about your product → fix in copy/images → conversion lifts.

## How to use the extension

### Setup (one-time)
1. Chrome → `chrome://extensions/` → Developer mode ON → Load unpacked → select `tools/rufus-chrome-extension/`
2. Click extension icon → settings (gear) → API URL + API key (admin sets `rufus_extension_api_key` in Listing Builder admin settings)
3. Sign in to Amazon in the same Chrome browser

### Run a manual-questions test
1. Click extension icon
2. Mode: **Manual questions**
3. Marketplace: e.g. US (amazon.com)
4. ASINs: paste one or more (one per line)
5. Custom questions: paste your prompts (one per line)
6. Click **Add to Queue** → click **Start**
7. Each ASIN: extension opens product page → opens Rufus → clicks "Start a new chat" (avoids context bleed) → types each Q → captures each A → posts to API
8. Click **CSV** to export when done

### Run an auto-chips test
Same flow but leave custom questions blank. Extension clicks Rufus's suggested chips until exhausted.

### Auto-process from backend (team workflow)
Toggle **Auto-process from backend ON** to poll Listing Builder's queue every 15s for ASINs queued there. Always uses auto-chips mode (backend doesn't supply per-ASIN custom questions).

## ⚠️ Critical Rufus gotchas (learned the hard way)

### 1. Rufus chat memory persists across page navigations
Rufus chat state is server-side per user. Navigating to a new product does NOT reset memory. Without intervention, asking "what are people buying instead?" on ASIN #2 returns "this was already covered earlier". **Fix: click `#rufus-panel-header-new-chat` (aria-label "Start a new chat") at the start of each session.** Extension does this in `askCustomQuestions` since v1.13.0. If running JS manually, call `document.querySelector('#rufus-panel-header-new-chat')?.click()` after Rufus opens.

### 2. Even after "new chat", Rufus remembers question wording
Truly fresh chat still gives short "already covered" answers if the same exact question wording appears in your account's broader Rufus history. **Fix: vary phrasing per ASIN.** Examples:
- Q4: "What are people buying instead?" → "Which competing brands do shoppers compare against?" → "Name 3 specific competitors and how each differs"
- Q5: "Why do people choose this?" → "What makes shoppers pick this Chalkola product over rivals?"

### 3. Active turn has different class than completed turns
- Completed turns: `.rufus-papyrus-turn`
- **Currently streaming turn: `.rufus-papyrus-active-turn` (NOT also tagged `.rufus-papyrus-turn`)**
- Always query both classes: `document.querySelectorAll('.rufus-papyrus-turn, .rufus-papyrus-active-turn')`

### 4. React-friendly typing required
Setting `textarea.value = '...'` directly bypasses React's state — submit button stays disabled. Pattern that works:
```js
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
setter.call(input, text)
input.dispatchEvent(new Event('input', { bubbles: true }))
```

### 5. Wait for streaming via answer-text length stability, NOT loader classes
Amazon's loader classes change between UI versions. Robust signal: poll the latest turn's markdown-section text length; consider "done" when length is stable for 2.5s past 50 chars.

### 6. Question text confuses stability check
The latest turn's `textContent` includes the customer-question text (~50 chars even before answer arrives). Don't poll `turn.textContent.length` — poll only the answer's `markdownSection` divs.

### 7. Chrome MCP javascript_tool truncates output
Each `javascript_tool` response caps at ~1000 chars. For long Rufus answers, return both `head` (slice 0,800) AND `tail` (slice 800) in one call. For very long answers, use `slice(900)` / `slice(1900)` etc. in follow-up calls. Also: `?` `&` `=` characters trigger Chrome MCP's content filter — replace before returning (`s.replace(/[?&=]/g, ' ')`).

## Live DOM selectors (verified 2026-04-25)

| Element | Selector |
|---------|----------|
| Open Rufus button | `#nav-rufus-disco`, `[aria-label="Open Rufus panel"]` |
| Panel container | `#nav-flyout-rufus` |
| Question chip suggestions | `button.rufus-pill`, `.rufus-related-question-pill`, `li.rufus-carousel-card button` |
| Chat input textarea | `#rufus-text-area` (placeholder: "Ask Rufus a question") |
| Submit button | `#rufus-submit-button` (aria-label "Submit"); disabled when input empty |
| **New chat button** | `#rufus-panel-header-new-chat` (aria-label "Start a new chat") |
| Turn container | `.rufus-papyrus-turn` (id format: `interaction0`, `interaction1`, …) |
| Active streaming turn | `.rufus-papyrus-active-turn` |
| Customer question inside turn | `.rufus-customer-text` |
| Answer markdown sections | `div[data-csa-c-group-id^="markdownSection"]` |

All configurable via Settings → DOM Selectors. If Amazon changes the DOM, update there.

## Database schema

Captured Q&A lands in `lb_asin_questions` (Listing Builder Supabase):
- `asin` text
- `marketplace` text (e.g. `amazon.com`)
- `question` text
- `answer` text
- `source` text — `'rufus'` for extension data, `'amazon-qa'` for Oxylabs-scraped Q&A
- `created_at` timestamp

Telemetry/extraction logs in `lb_rufus_extraction_logs` (per-batch metadata for debugging).

API endpoint: `POST /api/rufus-qna` body `{ asin, marketplace, questions: [{question, answer}] }`. Auth: Bearer token from `rufus_extension_api_key` admin setting. Dedup: server merges with existing rows by exact `(question + answer)` pair.

## Pilot results (2026-04-25)

5 ASINs run through Pass 1 (5 framing Qs each) — saved at:
- `/Users/anuj/Desktop/Github/Chalkola ONE/rufus-pilot-B0846W6TN8/multi-asin/all_5_asins_pass1.csv`
- Google Sheet: https://docs.google.com/spreadsheets/d/189vJipkDnV_sPXZVfI1NmmTf-Drq7zybgnZylXHGm0w
- Per-ASIN markdown breakdowns in same folder

B0846W6TN8 (10 chalk markers w/ gold+silver) also has full Pass 2 (15 follow-ups) + listing recommendations:
- `rufus-pilot-B0846W6TN8/pass2_insights.md`
- `rufus-pilot-B0846W6TN8/listing_recommendations.md`

**Update 2026-04-26:** Full 6-ASIN pilot now in DB via direct API POST (CORS-enabled). Total 144 Rufus Q&A pairs across all 6 ASINs in `lb_asin_questions`.

## Cross-product strategic findings from the pilot

- 🔴 **Erasability/staining is the universal #1 complaint** across all chalk-marker SKUs. White SKUs hit 67% negative on staining — even higher than colored. Listing must address with porous-vs-non-porous chart + immediate-wipe rule.
- 🔴 **Underfilled tubes is B086BNG4DY's #1 complaint (62% negative)** — manufacturing/QC issue, not listing copy. Needs supplier investigation.
- 🔑 **Each Chalkola SKU has a clean differentiation moat:**
  - 6mm w/ gold+silver = events/weddings (metallics in base pack)
  - 24 NoPrep dual-tip = "no priming" + dot+brush combo
  - 30-pack 1mm = only fine-tip + 30-color combo
  - 4-pack white 3mm = reversible bullet/chisel at lowest price
  - 4-pack white 1mm = "only ultra-fine 1mm white under $15"
  - 36 watercolor = only all-in-one bundle (tubes + brushes + palette)
- 🆕 **Competitors Rufus names:** Chalky Crown, Bandle B., Chalk Ink, GOTIDEAL, Posca (paint marker, different category), ARTEZA, Shuttle Art, Winsor & Newton Cotman.
- ⚠️ **Bandle B. has 1-Year Manufacturer Warranty stated**; Chalkola has nothing stated → free conversion fix.
- ⚠️ **Bandle B. discloses ink volume (8g/pen)**; Chalkola doesn't → transparency gap.

## Extension version history

- **1.13.0 (2026-04-25)** — Custom-questions mode auto-clicks "Start a new chat" before asking. Avoids cross-product memory bleed.
- **1.12.0 (2026-04-25)** — Added custom-questions mode (`askCustomQuestions`) + UI toggle (Auto chips vs Manual questions) + selectors `rufusInput` / `rufusSubmit`.
- **1.11.0 and earlier** — Auto-chips mode only.

## API endpoint state (2026-04-26)
- `POST /api/rufus-qna` — CORS-enabled, accepts ASIN + marketplace + questions array, dedup-merges into `lb_asin_questions`
- `POST /api/rufus-qna/telemetry` — extension diagnostics, no CORS yet
- `GET /api/rufus-qna/queue` — extension polls for next ASIN; **does NOT yet support custom_questions** (queue runs Auto-chips only)
- `POST /api/rufus-qna/queue` — extension reports completion

## What still needs to be built (the gap to "fully automated from website")

For the FULL Amy Wees loop (Pass 1 → AI analyzes → Pass 2 → synthesis) to run automatically from the listing-builder website with zero Chrome popup interaction, **6 phases of work remain**:

| Phase | What | Effort |
|---|---|---|
| 1 | DB migration: add `custom_questions`, `loop_phase`, `synthesis_md` columns to `lb_rufus_job_items` | 15 min |
| 2 | API endpoints: `/run-loop`, `/generate-pass2`, `/generate-synthesis`, plus orchestrator | 2 hr |
| 3 | Extension v1.14.0: queue-mode runs Manual when `custom_questions` present | 30 min |
| 4 | Listing website `/rufus-qna` page UI with Run Full Amy Loop button + status panel | 3 hr |
| 5 | Wire `lb_asin_questions` into listing copy generator as Claude context | 3 hr |
| 6 | Always-on Chrome runner (Mac mini or cloud VM with extension polling) | half day |

**Detailed build plan + handoff:** see [`RUFUS_AUTOMATION_PLAN.md`](RUFUS_AUTOMATION_PLAN.md) — has phase-by-phase steps, code locations, prompt templates, gotchas to NOT relearn.

*Last updated: 2026-04-26 (6-ASIN pilot complete · 144 Q&A in DB · extension v1.13.0 · CORS deployed · automation plan documented)*
