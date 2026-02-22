# Rufus Q&A Extractor — Chrome Extension

Automates the extraction of Q&A from Amazon's Rufus AI shopping assistant and sends data directly to the Listing Builder platform.

## How It Works

1. You paste a list of ASINs and select a marketplace
2. The extension opens each product page **one at a time** (sequential — never parallel)
3. It opens the Rufus chat, then auto-clicks suggested questions
4. **Keeps going until Rufus stops producing new questions** (no fixed count)
5. Extracts all Q&A pairs, de-duplicates exact matches
6. Sends results to the Listing Builder API
7. **Refreshes the page** before moving to the next product (resets Rufus chat state)

## Key Design Decisions

- **Sequential only** — Rufus chat state is per-page; running products in parallel would mix Q&A
- **Run until exhausted** — No fixed question count. Stops after 3 consecutive rounds with no new suggestions
- **Exact dedup** — Only exact (question + answer) pairs are duplicates. Same question with a different Rufus answer is KEPT (captures variation in how Rufus answers)
- **Page refresh between products** — Navigates to `about:blank` then to the next product URL, ensuring Rufus starts fresh
- **Amazon login required** — Rufus needs an authenticated Amazon session. The extension checks login status before extracting

## Installation (for each team member)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `tools/rufus-chrome-extension` folder from your local repo
5. The extension icon appears in your toolbar

## Setup

### 1. Generate an API Key (one-time, done by admin)

In the Listing Builder platform:
- Go to **Admin Settings**
- Add a new setting with key: `rufus_extension_api_key`
- Set the value to any secure random string (e.g., `openssl rand -hex 32`)
- Share this key with team members

### 2. Configure the Extension (each user)

1. Click the extension icon → gear icon (or right-click → Options)
2. Set:
   - **API URL**: `http://localhost:3000` (dev) or `https://listing-builder-production.up.railway.app` (prod)
   - **API Key**: The shared key from Admin Settings
   - **Delays**: Adjust if extraction is too fast/slow

### 3. Update DOM Selectors (Important!)

Amazon's Rufus UI may change over time. The extension needs CSS selectors to find:
- The Rufus chat open button
- Suggested question chips
- Chat message container
- Question/answer bubbles
- Loading indicator

**To find the correct selectors:**
1. Open an Amazon product page
2. Open Chrome DevTools (F12)
3. Click the Rufus button to open the chat
4. Use the element inspector to find the correct selectors for each element
5. Update them in the extension Options page

### 4. Sign In to Amazon

You must be logged into Amazon in the same Chrome browser. Rufus requires an authenticated session. The extension will warn you if it detects you're not logged in.

## Usage

1. Click the extension icon
2. Select the **marketplace** (e.g., US, UK, DE)
3. Paste ASINs (one per line) into the text area
4. Click **Add to Queue**
5. Click **Start** — extraction runs product by product
6. Watch progress — each product shows how many Q&A pairs were extracted
7. When done, click **CSV** to download results

### Controls

| Button | Action |
|--------|--------|
| **Start** | Begin processing pending items (sequential) |
| **Stop** | Pause after current product finishes |
| **Retry** | Re-queue all failed items |
| **CSV** | Export completed results as CSV |
| **Clear** | Remove completed/errored items from queue |

### Keyboard Shortcuts

- `Ctrl+Enter` in the ASIN text area → Add to Queue

## Data Flow

```
Extension extracts Q&A on Amazon page
         ↓
POST /api/rufus-qna (API key auth)
         ↓
Merge with existing lb_asin_questions
(de-dup by exact question+answer pair)
         ↓
Stored in Supabase — available in platform
```

Rufus questions are tagged with `source: 'rufus'` so they can be filtered separately from standard Amazon Q&A fetched via Oxylabs.

## API Response

The API returns dedup stats with each submission:

```json
{
  "success": true,
  "asin": "B0XXXXXXXXX",
  "questions_total": 45,
  "new_questions_added": 12,
  "duplicates_skipped": 8
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not logged into Amazon" | Sign in to Amazon in the same Chrome browser, then retry. |
| "Could not open Rufus chat panel" | Update the Rufus button selector in Options. Rufus may not be available in this marketplace. |
| "No questions found to click" | Update the question chip selector. Open DevTools to inspect the suggestion buttons. |
| API returns 401 | Check your API key matches what's in Admin Settings (`rufus_extension_api_key`). |
| Answers seem incomplete | Increase "Delay between clicks" in Settings (try 4000-5000ms). |
| Extension not loading on pages | Verify the URL matches a supported marketplace in manifest.json. |
| Queue stops after one product | Check the error on that product. If it's a login issue, sign in and retry. |
