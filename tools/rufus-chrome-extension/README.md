# Rufus Q&A Extractor — Chrome Extension

Automates the extraction of Q&A from Amazon's Rufus AI shopping assistant and sends data directly to the Listing Builder platform.

## How It Works

1. You paste a list of ASINs and select a marketplace
2. The extension opens each product page in a tab
3. It clicks the Rufus chat button, then auto-clicks suggested questions
4. After clicking N questions, it extracts all Q&A pairs from the chat
5. Results are sent to the Listing Builder API and stored in `lb_asin_questions`
6. You can also export results as CSV

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `tools/rufus-chrome-extension` folder
5. The extension icon appears in your toolbar

## Setup

### 1. Generate an API Key

In the Listing Builder platform:
- Go to **Admin Settings**
- Add a new setting with key: `rufus_extension_api_key`
- Set the value to any secure random string (e.g., generate with `openssl rand -hex 32`)

### 2. Configure the Extension

1. Click the extension icon → gear icon (or right-click → Options)
2. Set:
   - **API URL**: `http://localhost:3000` (dev) or `https://listing-builder-production.up.railway.app` (prod)
   - **API Key**: The key you set in Admin Settings
   - **Questions per product**: How many Rufus questions to click (default: 20)
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
4. Use the element inspector to find the correct selectors
5. Update them in the extension Options page

## Usage

1. Click the extension icon
2. Select the **marketplace** (e.g., US, UK, DE)
3. Set **questions per product** count
4. Paste ASINs (one per line) into the text area
5. Click **Add to Queue**
6. Click **Start** to begin extraction
7. Watch progress in the queue list
8. When done, click **Export CSV** to download results

## Keyboard Shortcuts

- `Ctrl+Enter` in the ASIN text area → Add to Queue

## Data Flow

```
Chrome Extension → POST /api/rufus-qna → lb_asin_questions (Supabase)
                                        ↓
                                   Merged with existing Oxylabs Q&A
                                   (de-duplicated by question text)
```

Rufus questions are tagged with `source: 'rufus'` in the questions array so they can be filtered separately from standard Amazon Q&A fetched via Oxylabs.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Rufus button not found" | Update the Rufus button selector in Options. Amazon may have changed the DOM. |
| "No questions found to click" | Rufus may not be available for this product/marketplace. Or update the question chip selector. |
| API returns 401 | Check your API key matches what's in Admin Settings. |
| Extension not loading on Amazon pages | Check that the extension has permission for the marketplace URL in `manifest.json`. |
| Answers seem incomplete | Increase the "Delay between clicks" to give Rufus more time to respond. |
