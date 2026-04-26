# Rufus Full Automation — Build Plan + Handoff
## Context for the next Claude Code session
## Last updated: 2026-04-26 (after 6-ASIN pilot)

> **Read this top to bottom before touching any code.** Every gotcha listed below was learned by burning hours/tokens in the last session.

---

## Current state (what works today)

### ✅ DONE
- Chrome extension v1.13.0 with Manual mode (`tools/rufus-chrome-extension/`)
  - Auto-clicks "new chat" before typing (fixes cross-product memory bleed)
  - React-friendly typing into `#rufus-text-area`
  - Captures answers from `.rufus-papyrus-active-turn` then `.rufus-papyrus-turn`
  - POSTs to `/api/rufus-qna` with bearer key
- API endpoint `POST /api/rufus-qna` (CORS-enabled, deployed Apr 26)
  - Bearer auth via `lb_admin_settings.rufus_extension_api_key`
  - Dedup-merges into `lb_asin_questions` by exact (question + answer) pair
  - Preserves prior Oxylabs Q&A alongside Rufus Q&A
- 6-ASIN pilot data: 144 Q&A pairs in `lb_asin_questions` (B0G4VC9W5V, B089NN5R7Y, B07DKXHBDX, B07PQDFJW8, B086BNG4DY, B0846W6TN8) + per-ASIN synthesis docs at `Chalkola ONE/rufus-pilot-B0846W6TN8/multi-asin/`
- Backend queue exists (`lb_rufus_jobs` + `lb_rufus_job_items`) and extension polls it via `GET /api/rufus-qna/queue`

### ❌ NOT DONE — the gaps to close

| # | Gap | Why it matters |
|---|---|---|
| 1 | Queue table has no `custom_questions` column | Queue can only do Auto-chips, not Manual mode |
| 2 | No Pass 2 generator AI endpoint | Human (me) must design Pass 2 questions per ASIN |
| 3 | No synthesis generator AI endpoint | Human (me) writes synthesis markdown |
| 4 | No `/rufus-qna` page on listing-builder website | No way to trigger from UI |
| 5 | Extension queue-mode polling only does Auto-chips | Even if queue had custom_questions, extension wouldn't run them |
| 6 | Listing copy generator doesn't ingest `lb_asin_questions` | Q&A insights aren't auto-flowed into listing generation |
| 7 | Need a Chrome that's always-open + logged-in to Amazon | Rufus needs Amazon session; no server-side path |

---

## Build plan (in order — each step gates the next)

### Phase 1 — DB migration (~15 min)
Add columns to `lb_rufus_job_items`:
```sql
ALTER TABLE lb_rufus_job_items
  ADD COLUMN marketplace TEXT,
  ADD COLUMN loop_phase TEXT CHECK (loop_phase IN ('pass1','pass2','single')),
  ADD COLUMN custom_questions JSONB,
  ADD COLUMN parent_item_id UUID REFERENCES lb_rufus_job_items(id),
  ADD COLUMN synthesis_md TEXT,
  ADD COLUMN max_questions INT DEFAULT 50;
```

Add `lb_rufus_jobs.loop_mode` column:
```sql
ALTER TABLE lb_rufus_jobs
  ADD COLUMN loop_mode TEXT CHECK (loop_mode IN ('auto_chips','manual_questions','full_amy_loop')) DEFAULT 'auto_chips';
```

Use Supabase MCP `apply_migration` tool.

### Phase 2 — API endpoints (~2 hours)

**Files to create/modify in `src/app/api/rufus-qna/`:**

1. **`queue/route.ts`** — extend GET to return `custom_questions`, `loop_phase`, `marketplace`. Extend POST (already exists for completion reporting) to also accept item creation with `custom_questions`.

2. **`generate-pass2/route.ts`** (NEW) — `POST` body `{ asin, marketplace }`:
   - Read Pass 1 answers from `lb_asin_questions` (filter `source='rufus'`, sort by created_at, take first 5 — they're Pass 1)
   - Call Claude (model from `lb_admin_settings.anthropic_api_key`, use `claude-opus-4-7` or current latest)
   - Prompt: "Given these 5 Pass 1 answers about [product], generate 15 product-specific follow-up questions for Rufus. Vary phrasing to avoid Rufus dedup."
   - Return `{ questions: string[] }`

3. **`generate-synthesis/route.ts`** (NEW) — `POST` body `{ asin, marketplace }`:
   - Read all `source='rufus'` questions from `lb_asin_questions`
   - Call Claude with the synthesis prompt (template at end of this doc)
   - Return `{ synthesis_md: string }`
   - Save to `lb_rufus_job_items.synthesis_md` for this ASIN's most recent completed item

4. **`run-loop/route.ts`** (NEW) — `POST` body `{ asin, marketplace }`:
   - Create `lb_rufus_jobs` row with `loop_mode='full_amy_loop'`
   - Create `lb_rufus_job_items` row: phase='pass1', custom_questions=[Amy's 5 framing Qs], status='pending'
   - Return job_id for UI to poll

5. **Orchestrator logic** — when extension reports `pass1` complete:
   - Auto-call `/api/rufus-qna/generate-pass2`
   - Insert new `lb_rufus_job_items` row with phase='pass2', custom_questions=15 generated, parent_item_id=pass1's id, status='pending'
   - When pass2 completes → call `/api/rufus-qna/generate-synthesis` → save synthesis

   Either as a service called from the completion-reporting endpoint, or as a background pg_cron job that scans for pass1-completed-without-pass2.

**Critical: CORS headers on ALL new routes.** Use the same `corsJson()` helper pattern from `route.ts` (already there).

### Phase 3 — Extension v1.14.0 (~30 min)

In `tools/rufus-chrome-extension/background.js`:
- Update `processQueueItem()` to read `custom_questions` from queue response
- If `custom_questions` is present + non-empty → use `ASK_CUSTOM_QUESTIONS` message type (Manual mode flow already exists in content.js)
- If absent → existing Auto-chips behavior
- Bump `manifest.json` version to `1.14.0`

### Phase 4 — Listing website `/rufus-qna` page (~3 hours)

Files to create:
- `src/app/rufus-qna/page.tsx` — server component
- `src/components/rufus-qna/RufusQnAClient.tsx` — exists already, EXTEND it
- `src/components/rufus-qna/AmyLoopRunner.tsx` (NEW) — dedicated full-loop UI

UI:
- ASIN input + marketplace dropdown
- Mode selector: "Single Pass 1 only" / "Full Amy Loop" / "Auto chips only"
- "Run" button → POSTs to `/api/rufus-qna/run-loop` (or appropriate endpoint per mode)
- Status panel polls `lb_rufus_job_items` every 5s:
  - "Pass 1 in progress... typed 3/5 questions"
  - "Pass 1 complete. Generating Pass 2 questions..."
  - "Pass 2 in progress... typed 7/15"
  - "Synthesizing..."
  - "Done. View synthesis ↓"
- Synthesis markdown rendered with react-markdown
- "Apply to Listing" button → opens listing builder with this ASIN preloaded

### Phase 5 — Listing copy generator integration (~3 hours)

Find the listing generation pipeline (likely `src/components/listings/wizard/StepPhasedGeneration.tsx` or similar). Add:
- Before calling Claude for listing copy, read `lb_asin_questions` for current ASIN
- Filter `source='rufus'` (skip Oxylabs Q&A which is different shape)
- Inject as system context: *"Here are Rufus Q&A insights for this product: [Q1: ...] [A1: ...] ... Use these to inform title, bullets, and image briefs."*
- Show "Insights from Rufus" panel in wizard so user can see what's being used

### Phase 6 — Always-on Chrome runner (half day)

Without this, the team's queue won't drain unless someone has Chrome open. Options:

**Option A — Mac mini in office** (cheapest, simplest)
- Mac mini logged in to Amazon
- Chrome with extension installed
- Extension's "Auto-process from backend" toggle ON
- Wake-on-schedule via `pmset` or just leave it on

**Option B — Cloud VM with Puppeteer**
- DigitalOcean droplet ($24/mo, 4GB RAM, can run Chrome headed)
- Install Chrome + extension (load unpacked)
- VNC or noVNC for occasional Amazon re-login (Amazon kicks sessions periodically)
- Set up health check that pings if extension stops polling

**Option C — Reuse Mac M2 Ultra runner** (already running for Ads-API per CLAUDE.md)
- Same machine, install Chrome + extension as a separate workload
- Cron-restart if it crashes

Document the chosen option in `Listing/rufus.md` after setup.

---

## Critical learnings from the pilot (DO NOT relearn these)

### Rufus DOM gotchas
1. **Active turn class is different from completed turn class:** streaming = `.rufus-papyrus-active-turn`, completed = `.rufus-papyrus-turn`. Always query both: `'.rufus-papyrus-turn, .rufus-papyrus-active-turn'`.
2. **Question text is in the same turn as the answer** — when polling for "answer length stable," poll only the markdown sections, not the whole turn (the question text alone is >30 chars and would falsely trigger stability).
3. **Live selectors (verified 2026-04-26):**
   - Open Rufus button: `#nav-rufus-disco`
   - Chat input textarea: `#rufus-text-area`
   - Submit button: `#rufus-submit-button` (gets `disabled` class until input has text)
   - New chat button: `#rufus-panel-header-new-chat`
   - Turn container: `.rufus-papyrus-turn` (ids `interaction0..N`)
   - Customer question: `.rufus-customer-text`
   - Answer markdown sections: `div[data-csa-c-group-id^="markdownSection"]`

### React typing pattern (required, not optional)
```js
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
input.focus()
setter.call(input, text)
input.dispatchEvent(new Event('input', { bubbles: true }))
input.dispatchEvent(new Event('change', { bubbles: true }))
```
Setting `input.value = text` directly leaves submit button disabled.

### Wait-for-streaming heuristic
Don't rely on Amazon's loader classes (they change between UI versions). Poll the latest active-turn's markdown-section text length. Consider "done" when length is stable for 2.5s past 50 chars.

### Rufus chat memory persists across "new chat"
The `#rufus-panel-header-new-chat` button creates a fresh visible chat but Rufus's user-level memory persists. If you ask "What are people buying instead?" twice in 24h, Rufus replies "this was already covered" with a 150-char dedup response.

**Mitigation:** Vary phrasing per ASIN. Examples:
- Q4 framing: "What are people buying instead?" → "Which competing brands do shoppers compare?" → "Name 3 specific competitors and how each differs"
- Q5 framing: "Why do people choose this?" → "What makes shoppers pick this Chalkola over rivals?" → "What's the single biggest reason buyers pick this?"

### CORS is now enabled on `/api/rufus-qna`
Deployed Apr 26. Other rufus-qna routes (`/queue`, `/telemetry`, etc.) do NOT have CORS yet — add when extending them.

### API key + auth
- Bearer key in `lb_admin_settings.rufus_extension_api_key`: `7e07bf4cc511e19652114eea89232b50216b5979c2b66c5cca5ed030d1624f60`
- Validation: see `validateApiKey()` in `route.ts`
- Country lookup: `lb_countries` where `amazon_domain='amazon.com'` returns `id='8feabc97-3927-43e3-8c5b-747eac6de404'` (US)

### Question dedup logic
`lb_asin_questions` is keyed by `(asin, country_id)` (one row per ASIN per marketplace). Questions are JSONB array. Each entry: `{question, answer, votes:0, source:'rufus'}`. Server-side dedup is exact (question + answer) match — same question with different answer is KEPT.

### Sandbox network
- Sandbox bash CAN reach Supabase via Python urllib (verified)
- Sandbox bash CANNOT reach Railway via curl (DNS blocked)
- Sandbox bash CAN reach Railway via Python urllib (verified) — so Python upload scripts work
- Chrome MCP can fetch from any origin in the open browser tab

### Supabase MCP gotchas
- `execute_sql` accepts long queries but typing 50KB into tool args is expensive
- For bulk JSONB inserts, prefer the API endpoint over inline SQL

### Railway deploy
- `mcp__railway__deploy` triggers a fresh deploy from current local repo state
- Build takes ~2-3 min; verify with curl + cache-bust query param

---

## Synthesis prompt template (for Phase 2 step 3)

```
You are reviewing Rufus AI Q&A pairs captured from Amazon for the product [PRODUCT_TITLE] (ASIN [ASIN]).

Below are [N] question/answer pairs Rufus generated:

[QA_PAIRS_JOINED]

Write a `listing_recommendations.md` document for this ASIN with:

## 🔴 Top 3 critical changes
The 3 highest-impact listing changes (title, image, bullet copy) ranked by conversion lift potential.

## 🟡 Tier-2 fixes
4-6 secondary changes for image gallery, bullet refinements, FAQ.

## 🆕 Use-case images
Specific gallery image briefs based on use cases Rufus named.

## 🆚 Competitor positioning
Table comparing this product to competitors Rufus named, with each rival's edge and Chalkola's edge.

## ⚠️ Hidden risks Rufus flagged
Issues to address proactively in copy/images.

End with the strongest moat statement Rufus surfaced for this product.

Use markdown tables, bullets, and bold formatting. Keep it tight — every sentence must be actionable.
```

---

## Pass 2 generator prompt template (for Phase 2 step 2)

```
You are designing 15 Rufus follow-up questions for an Amazon product listing audit.

Product: [PRODUCT_TITLE]
ASIN: [ASIN]

Pass 1 answers from Rufus (5 framing questions):

Q1: What is this product for?
A1: [ANSWER]

Q2: What do people like about this product?
A2: [ANSWER]

Q3: What don't people like about this product?
A3: [ANSWER]

Q4: What are people buying instead?
A4: [ANSWER]

Q5: Why do people choose this product over alternatives?
A5: [ANSWER]

Generate 15 product-specific follow-up questions. Cover these buckets:
- Bucket 1 (3 Qs): Drill into the #1 buyer concern from Q3
- Bucket 2 (2 Qs): Probe the strongest differentiator from Q5
- Bucket 3 (2 Qs): Identify avatar use cases beyond what Q1 mentioned
- Bucket 4 (2 Qs): Direct comparison with each competitor named in Q4
- Bucket 5 (2 Qs): First-time buyer concerns + activation/usage instructions
- Bucket 6 (2 Qs): Surface compatibility / safety / kid-friendly
- Bucket 7 (2 Qs): Persuasive review themes + unique selling reframes

Each question MUST:
- Be specific to this product (not generic)
- Use varied phrasings (avoid repeating exact wording from Pass 1)
- Be answerable by Rufus (Rufus = Amazon's customer-facing AI assistant)

Return as JSON: { "questions": ["Q6 text", "Q7 text", ...] }
```

---

## Test plan (after building)

1. **Phase 1 verify:** Run a SELECT on `lb_rufus_job_items` after migration — confirm new columns exist
2. **Phase 2 verify:** POST to `/api/rufus-qna/run-loop` with a test ASIN. Check `lb_rufus_jobs` row created with `loop_mode='full_amy_loop'` + child item with phase='pass1' + Amy's 5 questions in `custom_questions`.
3. **Phase 3 verify:** Have Chrome with v1.14.0 + extension polling on. Watch extension picks up the queue item, runs Manual mode, posts back. Check `lb_asin_questions` row gets the 5 Pass 1 answers.
4. **Phase 2 step 5 (orchestrator) verify:** After Pass 1 completes, watch logs/DB for: pass2 generator called, new queue item created with 15 questions in `custom_questions`, extension picks it up. After pass2 completes, synthesis generator called, `synthesis_md` populated.
5. **Phase 4 verify:** Open `/rufus-qna` page, paste ASIN, click "Run Full Amy Loop". Watch status panel update through phases. View synthesis at end.
6. **Phase 5 verify:** Generate listing copy for a Rufus-completed ASIN. Confirm Q&A insights appear in the Claude prompt context.
7. **Phase 6 verify:** Disconnect your Chrome from polling. Queue an ASIN from `/rufus-qna` page. Confirm dedicated runner picks it up within 30s.

---

## Files this session created/modified (for context)

### New
- `tools/rufus-chrome-extension/manifest.json` v1.13.0
- `tools/rufus-chrome-extension/content.js` — added `askCustomQuestions` + new-chat click + React typing
- `tools/rufus-chrome-extension/background.js` — added `extractCustomQuestions` flow
- `tools/rufus-chrome-extension/popup.html` + popup.js — added Manual mode UI
- `tools/rufus-chrome-extension/options.html` + options.js — added rufusInput + rufusSubmit selectors
- `Listing/rufus.md` — full playbook (159 lines)
- `src/app/api/rufus-qna/route.ts` — added CORS headers + OPTIONS handler

### Pilot data location
- `Chalkola ONE/rufus-pilot-B0846W6TN8/multi-asin/` — 6 synthesis docs + master summary + raw JSON for B0G4VC9W5V
- DB: `lb_asin_questions` rows for all 6 ASINs (144 Q&A pairs total)

### Long-term reference
- `Listing/rufus.md` — extension usage + DOM selectors + gotchas
- `Listing/RUFUS_AUTOMATION_PLAN.md` — THIS FILE

---

## Quick reference for the next session

**Immediate first commands when picking this up:**
```bash
# 1. Check current state
cd /Users/anuj/Desktop/Github/Listing
git log --oneline -10  # see what shipped
cat RUFUS_AUTOMATION_PLAN.md  # this file

# 2. Verify pilot data still in DB (via Supabase MCP)
# SELECT asin, total_questions FROM lb_asin_questions WHERE asin IN ('B0G4VC9W5V','B089NN5R7Y','B07DKXHBDX','B07PQDFJW8','B086BNG4DY','B0846W6TN8');
# Should return 6 rows totaling 144 Q&A.

# 3. Test API still works
curl -X OPTIONS https://listing-builder-production.up.railway.app/api/rufus-qna -i | head -20
# Should show: Allow: GET, POST, OPTIONS, Access-Control-Allow-Origin: *

# 4. Start with Phase 1 (DB migration)
```

**Key contacts:**
- API key: `lb_admin_settings.rufus_extension_api_key` in Supabase project `yawaopfqkkvdqtsagmng`
- Rufus pilot data: `/Users/anuj/Desktop/Github/Chalkola ONE/rufus-pilot-B0846W6TN8/multi-asin/`
- Extension: `/Users/anuj/Desktop/Github/Listing/tools/rufus-chrome-extension/`
- Listing builder repo: `/Users/anuj/Desktop/Github/Listing/`

**Estimated total build time for full automation:** 1-2 dev days.
