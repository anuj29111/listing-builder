/**
 * Rufus Q&A Extractor — Content Script
 *
 * STATELESS BATCH WORKER — runs on Amazon product pages.
 *
 * On command from the background worker:
 * 1. Checks Amazon login status
 * 2. Opens the Rufus chat panel
 * 3. Harvests all visible question pills
 * 4. Clicks up to N NEW questions (skipping previously-completed ones)
 * 5. Extracts Q&A pairs from the DOM
 * 6. Returns results + state to the background worker
 *
 * The BACKGROUND WORKER handles the refresh cycle between batches:
 * - Full page refresh (about:blank → product URL) resets Rufus conversation
 * - Background accumulates Q&A across batches and manages state
 * - This prevents topic drift by giving Rufus a fresh context each batch
 *
 * IMPORTANT: Content script is DESTROYED on page refresh. All state that
 * needs to persist across batches lives in background.js, passed via messages.
 */

// ─── Utilities ───────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait for an element matching the selector to appear in the DOM.
 * Uses MutationObserver for efficiency.
 */
function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) {
      resolve(existing)
      return
    }

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Element "${selector}" not found within ${timeoutMs}ms`))
    }, timeoutMs)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}

/**
 * Wait for a loading indicator to disappear.
 */
function waitForLoadingDone(selector, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)

    const check = () => {
      const el = document.querySelector(selector)
      if (!el) {
        clearTimeout(timer)
        resolve()
        return
      }
      setTimeout(check, 200)
    }
    check()
  })
}

/**
 * Find all elements matching ANY of the comma-separated selectors.
 */
function queryAll(selectorString) {
  try {
    return Array.from(document.querySelectorAll(selectorString))
  } catch {
    const selectors = selectorString.split(',').map((s) => s.trim())
    const results = []
    for (const s of selectors) {
      try {
        results.push(...document.querySelectorAll(s))
      } catch {
        // Skip invalid selectors
      }
    }
    return results
  }
}

/**
 * Extract the ASIN from the current page URL.
 */
function getAsinFromUrl() {
  const match = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/)
  return match ? match[1] : null
}

/**
 * Get the product title from the page for relevance checking.
 */
function getProductTitle() {
  const el = document.getElementById('productTitle') || document.getElementById('title')
  return el ? el.textContent.trim() : ''
}

/**
 * Extract meaningful keywords from text (words 3+ chars, no stop words).
 * Used to build topic profiles from product title + initial questions.
 *
 * How off-topic detection works:
 * 1. Keywords are extracted from the ACTUAL product title on the page (dynamic, not hardcoded)
 * 2. The first 5 questions can enrich the topic profile, but ONLY if they share at least
 *    one keyword with the product title (prevents early off-topic questions from polluting)
 * 3. After the seed phase, questions that share no keywords with the profile are off-topic
 * 4. After 5 consecutive off-topic questions, extraction stops
 */
const STOP_WORDS = new Set([
  // Common English
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
  'been', 'being', 'have', 'has', 'had', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'not', 'but', 'yet',
  'also', 'just', 'more', 'most', 'some', 'any', 'all', 'each', 'every',
  'very', 'too', 'only', 'own', 'same', 'than', 'then', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'how', 'what', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'other', 'another', 'such', 'like', 'over', 'under', 'again', 'once',
  // Question/generic words (common in Rufus questions)
  'tell', 'know', 'come', 'comes', 'make', 'made', 'use', 'used', 'good',
  'best', 'well', 'much', 'many', 'way', 'ways', 'get', 'got', 'need',
  'new', 'one', 'two', 'first', 'last', 'long', 'great', 'little',
  'right', 'big', 'high', 'low', 'small', 'large', 'old', 'different',
  'thing', 'things', 'able', 'work', 'works', 'help', 'look', 'want',
  // Product-generic words
  'product', 'item', 'buy', 'purchase', 'price', 'quality', 'review',
  'reviews', 'rating', 'recommend', 'worth', 'value', 'deal', 'compare',
  'versus', 'better', 'worse', 'similar', 'available', 'option', 'options',
  'set', 'pack', 'pcs', 'piece', 'count', 'size', 'color', 'colours',
  // Common in Rufus Q&A but not product-identifying
  'technique', 'techniques', 'method', 'methods', 'beginner', 'beginners',
  'learn', 'learning', 'start', 'started', 'starting', 'tips', 'easy', 'hard',
  'professional', 'project', 'projects', 'idea', 'ideas', 'type', 'types',
])

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
}

/**
 * Clean extracted question/answer text by stripping DOM artifacts.
 * Rufus DOM includes hidden metadata like "{}" from script tags,
 * screen-reader text, Amazon product listings, and other noise.
 */
function cleanExtractedText(text) {
  return text
    .replace(/\{\}/g, '')                         // All "{}" from script tags
    .replace(/Customer question\s*/gi, '')        // Screen-reader labels (all occurrences)
    .replace(/Rufus has completed generating a response/gi, '')
    .replace(/Your feedback has been submitted[^]*?Submit/gi, '') // Feedback UI
    .replace(/Resume response/gi, '')
    .replace(/Start of chat history/gi, '')
    .replace(/Load more/gi, '')
    .replace(/\(window\.AmazonUIPageJS[^]*?;/g, '') // Amazon scripts
    .replace(/window\.AmazonUIPageJS[^]*?;/g, '')
    .replace(/P\.now\([^)]*\)[^;]*;/g, '')        // Amazon P.now() calls
    .replace(/\{\\?"[A-Z_]+\\?":\\?"[^"]*\\?"[^}]*\}/g, '') // JSON config blobs
    .replace(/Add to cart/gi, '')                  // Product recommendation UI
    .replace(/FREE delivery[^.]*\./gi, '')
    .replace(/\d+\+? bought in past month/gi, '')
    .replace(/\d+% off/gi, '')
    .replace(/Limited time deal/gi, '')
    .replace(/See more details and confirm pricing[^]*?Learn more/gi, '')
    .replace(/Continue to site/gi, '')
    .replace(/Have questions\?/gi, '')
    .replace(/\s+/g, ' ')                         // Collapse whitespace
    .trim()
}

/**
 * Validate a Q&A pair is real content, not UI junk.
 * Returns false for garbage entries like Rufus panel UI text.
 */
function isValidQAPair(question, answer) {
  // Question must be substantial (at least 10 chars of real text)
  if (!question || question.length < 10) return false
  // Answer must be substantial
  if (!answer || answer.length < 20) return false
  // Reject known UI junk
  const junkPatterns = [
    /^Drag to reposition/i,
    /^Auto-minimize/i,
    /^Chat history/i,
    /^Load more/i,
    /^Start of chat/i,
    /^New chat/i,
    /^Get started/i,
    /^Minimizes the Rufus/i,
    /^Select All That Apply/i,
    /^This is irrelevant/i,
  ]
  for (const pattern of junkPatterns) {
    if (pattern.test(question) || pattern.test(answer)) return false
  }
  // Reject if answer is mostly script/config text
  if (answer.includes('AmazonUIPageJS') || answer.includes('PUISClients')) return false
  if (answer.includes('aapi-token-puis')) return false
  return true
}

/**
 * Check if the user is logged into Amazon.
 * Looks for common signed-in indicators in the nav bar.
 */
function checkAmazonLogin() {
  const accountEl = document.getElementById('nav-link-accountList')
  if (accountEl) {
    const text = accountEl.textContent || ''
    if (text.toLowerCase().includes('sign in')) {
      return { loggedIn: false, hint: 'Amazon nav shows "sign in" — not logged in' }
    }
    return { loggedIn: true }
  }

  const greetingEl = document.getElementById('nav-greeting')
  if (greetingEl) {
    const text = greetingEl.textContent || ''
    if (text.toLowerCase().includes('sign in') || text.toLowerCase().includes('hello, sign in')) {
      return { loggedIn: false, hint: 'Greeting shows "sign in"' }
    }
    return { loggedIn: true }
  }

  return { loggedIn: null, hint: 'Could not determine login status' }
}

// ─── Main Extraction Logic ───────────────────────────────────────

// Global ref to current extractor so ABORT_EXTRACTION can reach it
let currentExtractor = null

class RufusExtractor {
  /**
   * @param {Object} settings - Extraction settings (selectors, delays, batch size)
   * @param {string[]} completedQuestions - ALL questions handled in previous batches (for counting/off-topic)
   * @param {string[]} topicKeywords - Topic keywords built up from previous batches
   * @param {string[]} skippedSeeds - Initial pills already explored as seeds in previous batches
   */
  constructor(settings, completedQuestions = [], topicKeywords = [], skippedSeeds = []) {
    this.batchSize = settings.batchSize || 5
    this.delayBetweenClicks = settings.delayBetweenClicks || 3000
    this.selectors = settings.selectors || {}
    this.aborted = false

    // ALL questions handled in previous batches (for counting + follow-up skip)
    this._previouslyCompleted = new Set(completedQuestions)
    // Questions clicked in THIS batch only (for text-anchor DOM extraction)
    this._batchClicked = []
    // Live-captured Q&A pairs (captured immediately after each click)
    this._livePairs = []
    // All handled questions = previous + this batch (prevents re-clicking in SAME batch)
    this._allHandled = new Set(completedQuestions)

    // Initial pills already explored as seeds — skip these even though they're "initial"
    this._skippedSeeds = new Set(skippedSeeds)
    // Fresh pills: visible BEFORE any clicking (= initial/product-anchored pills)
    this._freshPills = new Set()
    // Track which initial pills this batch clicked (for background to update exploredSeeds)
    this._clickedInitials = []

    // Off-topic detection
    // titleKeywords = immutable anchor from product title.
    // topicKeywords = title keywords + keywords from on-topic clicked questions (may grow).
    // We gate follow-up clicks on titleKeywords primarily to prevent topic drift.
    this.titleKeywords = new Set(extractKeywords(getProductTitle()))
    this.topicKeywords = new Set([...this.titleKeywords, ...topicKeywords])
    this.seedPhaseSize = 5
    this.totalQuestionsHandled = completedQuestions.length
    this.consecutiveOffTopic = settings.consecutiveOffTopic || 0
    // Lowered from 5 → 3. Three consecutive off-topic hits is already drift.
    this.maxOffTopic = 3

    // Harvested pills from this page load
    this.harvestedPills = new Set()

    // Telemetry: which selectors matched what, which strategy won
    this._strategyUsed = null
    this._selectorsHit = {}    // e.g. { 'button.rufus-pill': 8, 'div[id^="interaction"]': 2, … }
  }

  /**
   * Record how many elements a given selector matched against a container.
   * Used for telemetry so we can spot when an Amazon selector stops matching.
   */
  _recordSelectorHit(selector, count) {
    if (selector && count !== undefined) this._selectorsHit[selector] = count
  }

  /**
   * Open the Rufus chat panel by clicking its trigger button.
   * Then wait for question chips to actually appear.
   */
  async openRufus() {
    try {
      const button = await waitForElement(this.selectors.rufusButton, 8000)
      button.click()
      await sleep(2000)

      // Wait for question chips to appear (up to 10 seconds)
      try {
        await waitForElement(this.selectors.questionChip, 10000)
        console.log('[Rufus] Question chips appeared')
      } catch {
        console.log('[Rufus] Question chips did not appear within 10s')
      }

      return true
    } catch {
      console.log('[Rufus] Rufus button not found, checking if already open...')
      const chat = document.querySelector(this.selectors.chatContainer)
      if (chat) {
        try {
          await waitForElement(this.selectors.questionChip, 10000)
        } catch {
          console.log('[Rufus] Rufus open but no question chips found')
        }
        return true
      }
      return false
    }
  }

  /**
   * Click up to batchSize NEW questions on THIS page load.
   *
   * INITIAL vs FOLLOW-UP pill logic:
   * - "Initial" pills = visible BEFORE any clicking (product-anchored by Rufus)
   * - "Follow-up" pills = appear AFTER clicking a question (conversation-contextual)
   *
   * After a page refresh, Rufus shows the same initial pills. We must:
   * - ALLOW re-clicking initial pills (they're seeds into follow-up trees)
   * - SKIP initial pills already explored as seeds in previous batches
   * - SKIP follow-up pills already clicked in any batch
   *
   * This way each batch explores a different seed's follow-up tree.
   */
  async clickBatch() {
    // ── Harvest fresh pills BEFORE clicking anything ──
    // These are the "initial" pills — product-anchored suggestions.
    // After refresh, these should be the same golden set.
    const preClickChips = queryAll(this.selectors.questionChip)
    for (const chip of preClickChips) {
      const text = chip.textContent.trim()
      if (text) {
        this._freshPills.add(text)
        this.harvestedPills.add(text)
      }
    }
    console.log(`[Rufus] Harvested ${this._freshPills.size} initial pills, ${this._skippedSeeds.size} seeds already explored`)

    let clicked = 0
    let consecutiveEmpty = 0
    const maxEmpty = 3

    while (clicked < this.batchSize && !this.aborted) {
      // Find available question chips
      const chips = queryAll(this.selectors.questionChip)

      // Harvest all visible pills (including follow-ups that appeared after clicking)
      for (const chip of chips) {
        const text = chip.textContent.trim()
        if (text) this.harvestedPills.add(text)
      }

      // ── Smart skip + priority logic: initial pills > follow-ups ──
      // We SORT so initial pills come first. Within a batch, this means we
      // click product-anchored seeds before diving into follow-up subtrees
      // (which is how Rufus drifts off-topic across multi-level follow-up chains).
      const unclicked = chips
        .filter((chip) => {
          const text = chip.textContent.trim()
          if (!text) return false

          // Is this an "initial" pill (visible before we clicked anything)?
          if (this._freshPills.has(text)) {
            // Initial pills CAN be re-clicked across batches (they're seeds into follow-up trees).
            // Only skip if: already explored as a seed OR already clicked THIS batch.
            return !this._skippedSeeds.has(text) && !this._batchClicked.includes(text)
          }

          // Follow-up pill: skip if handled in any batch (previous or current)
          return !this._allHandled.has(text)
        })
        // Sort: initial pills (seeds) FIRST, follow-ups last.
        // Prevents drift: seed exploration > deep dives into one topic subtree.
        .sort((a, b) => {
          const aIsSeed = this._freshPills.has(a.textContent.trim())
          const bIsSeed = this._freshPills.has(b.textContent.trim())
          if (aIsSeed && !bIsSeed) return -1
          if (!aIsSeed && bIsSeed) return 1
          return 0
        })

      if (unclicked.length === 0) {
        consecutiveEmpty++
        if (consecutiveEmpty >= maxEmpty) break
        // Scroll to trigger more suggestions
        const container = document.querySelector(this.selectors.chatContainer)
        if (container) container.scrollTop = container.scrollHeight
        await sleep(3000)
        continue
      }

      consecutiveEmpty = 0
      const target = unclicked[0]
      const questionText = target.textContent.trim()

      // ── Off-topic detection ──
      // Initial pills (seed) are ALWAYS allowed — Rufus itself anchored them to the product.
      // Follow-up pills must share a keyword with the product TITLE (or the topic profile,
      // which is seeded only from title-aligned questions).
      const questionKws = extractKeywords(questionText)
      const isInitial = this._freshPills.has(questionText)
      if (this.totalQuestionsHandled < this.seedPhaseSize) {
        // Seed phase: enrich topic profile ONLY from questions relevant to product title.
        const isRelevant = this.titleKeywords.size === 0 ||
          questionKws.some((kw) => this.titleKeywords.has(kw))
        if (isRelevant) {
          for (const kw of questionKws) this.topicKeywords.add(kw)
        }
        this.consecutiveOffTopic = 0
      } else if (!isInitial && this.titleKeywords.size > 0 && questionKws.length > 0) {
        // Post-seed follow-up: must overlap with TITLE keywords OR topic keywords.
        // TitleKeywords is the stable anchor; topicKeywords may have broadened.
        const matchesTitle = questionKws.some((kw) => this.titleKeywords.has(kw))
        const matchesTopic = questionKws.some((kw) => this.topicKeywords.has(kw))
        if (!matchesTitle && !matchesTopic) {
          this.consecutiveOffTopic++
          console.log(`[Rufus] Off-topic (${this.consecutiveOffTopic}/${this.maxOffTopic}): "${questionText.substring(0, 50)}..."`)
          // Mark as handled but DON'T click — skip this chip
          this._allHandled.add(questionText)
          this.totalQuestionsHandled++
          if (this.consecutiveOffTopic >= this.maxOffTopic) {
            console.log('[Rufus] Too many consecutive off-topic questions — stopping batch')
            break
          }
          continue
        } else {
          this.consecutiveOffTopic = 0
          // Only grow topic profile from TITLE-matching questions to prevent drift.
          if (matchesTitle) {
            for (const kw of questionKws) this.topicKeywords.add(kw)
          }
        }
      } else if (isInitial) {
        // Initial pill — trusted. Reset drift counter.
        this.consecutiveOffTopic = 0
      }

      // ── Click the question ──
      this._allHandled.add(questionText)
      this._batchClicked.push(questionText)
      this.totalQuestionsHandled++
      // Track if this was an initial pill (seed) or a follow-up
      if (this._freshPills.has(questionText)) {
        this._clickedInitials.push(questionText)
      }
      target.click()
      clicked++

      // Report progress to background
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_PROGRESS',
        data: { questionsClicked: this.totalQuestionsHandled, lastQuestion: questionText.substring(0, 60) },
      }).catch(() => {})

      console.log(`[Rufus] Clicked Q${this.totalQuestionsHandled} (batch click ${clicked}): "${questionText.substring(0, 50)}..."`)

      // Wait for answer to load
      if (this.selectors.loadingIndicator) {
        await sleep(500)
        await waitForLoadingDone(this.selectors.loadingIndicator, 15000)
      }
      await sleep(this.delayBetweenClicks)

      // ── Live-capture: extract the answer RIGHT NOW ──
      // The latest answer in the DOM belongs to the question we just clicked.
      // This eliminates the off-by-one alignment problem.
      const answerText = this._extractLatestAnswer()
      if (answerText) {
        this._livePairs.push({
          question: cleanExtractedText(questionText),
          answer: cleanExtractedText(answerText),
        })
        console.log(`[Rufus] Live-captured answer for Q${this.totalQuestionsHandled} (${answerText.length} chars)`)
      } else {
        console.log(`[Rufus] No answer captured for Q${this.totalQuestionsHandled}`)
      }
    }

    return clicked
  }

  /**
   * Extract all Q&A pairs from the chat history.
   *
   * Amazon's Rufus (as of 2026) uses `.rufus-papyrus-turn` elements (ids
   * `interaction0`, `interaction1`, …). Each turn contains one `.rufus-customer-text`
   * (the question) and one or more `div[data-csa-c-group-id^="markdownSection"]`
   * (answer sections — a single question may generate multiple paragraphs/sections).
   *
   * Primary strategy: iterate every turn; for each, grab the question + concat all
   * markdownSections. This is robust and matches what's on screen 1:1. Fallbacks
   * exist for future DOM changes.
   */
  extractQAPairs() {
    const rufusContainer = document.querySelector(this.selectors.chatContainer)
    this._recordSelectorHit(this.selectors.chatContainer, rufusContainer ? 1 : 0)
    if (!rufusContainer) {
      console.log('[Rufus] Chat container not found')
      this._strategyUsed = 'no-container'
      return []
    }

    let rawPairs = []
    let strategyUsed = 'none'

    // Telemetry: how many questions/answers the primary selectors match overall
    this._recordSelectorHit(this.selectors.questionBubble, rufusContainer.querySelectorAll(this.selectors.questionBubble).length)
    this._recordSelectorHit(this.selectors.answerBubble, rufusContainer.querySelectorAll(this.selectors.answerBubble).length)

    // ── Strategy 1 (PRIMARY): Turn-based extraction ──
    // Walk .rufus-papyrus-turn containers. Each turn = 1 Q + N answer sections.
    // This is the correct 1:1 mapping between screen and data.
    const turns = this._findTurns(rufusContainer)
    if (turns.length > 0) {
      for (const turn of turns) {
        const qa = this._extractFromTurn(turn)
        if (qa) rawPairs.push(qa)
      }
      if (rawPairs.length > 0) {
        strategyUsed = 'turn-based'
        console.log(`[Rufus] Strategy 1 (turn-based): ${rawPairs.length} pairs from ${turns.length} turns`)
      }
    }

    // ── Strategy 2 (FALLBACK): Live-captured pairs from this batch ──
    // Only used when turn-based finds nothing (e.g. Amazon changes DOM again).
    if (rawPairs.length === 0 && this._batchClicked.length > 0) {
      rawPairs = this._livePairs
      strategyUsed = this._livePairs.length > 0 ? 'live-capture' : 'live-capture-empty'
      console.log(`[Rufus] Live-capture fallback: ${rawPairs.length} pairs from ${this._batchClicked.length} clicked questions`)
    }

    // ── Strategy 3: Selector-based (separate Q/A lists) ──
    // WARNING: Cannot pair 1:1 because one turn may have multiple answer sections.
    // Only used as a last resort if turns can't be found. Pairs sequentially
    // starting from the last question working backwards.
    if (rawPairs.length === 0) {
      const questions = this._findAllQuestions(rufusContainer)
      const answers = this._findAllAnswers(rufusContainer)
      if (questions.length > 0 && answers.length > 0) {
        const len = Math.min(questions.length, answers.length)
        for (let i = 0; i < len; i++) {
          const q = cleanExtractedText(questions[i].textContent.trim())
          const a = cleanExtractedText(answers[i].textContent.trim())
          if (q && a && a.length > 15) {
            rawPairs.push({ question: q, answer: a })
          }
        }
        if (rawPairs.length > 0) {
          strategyUsed = 'selector-based'
          console.log(`[Rufus] Strategy 3 (selector-based): ${rawPairs.length} pairs`)
        }
      }
    }

    // ── Strategy 4: Structural walk ──
    if (rawPairs.length === 0) {
      const customerEls = this._findAllQuestions(rufusContainer)
      for (const qEl of customerEls) {
        const qText = cleanExtractedText(qEl.textContent.trim())
        if (!qText) continue

        let answerText = ''
        let current = qEl.parentElement
        for (let depth = 0; depth < 5 && current && current !== rufusContainer; depth++) {
          const siblings = Array.from(current.parentElement?.children || [])
          // Only look at siblings AFTER the question's container (answer follows question)
          const currentIdx = siblings.indexOf(current)
          for (let i = currentIdx + 1; i < siblings.length; i++) {
            const sibling = siblings[i]
            if (sibling.contains(qEl)) continue
            const sibText = sibling.textContent.trim()
            if (sibText && sibText !== qText && sibText.length > 15 && !sibText.endsWith('?')) {
              answerText = sibText
              break
            }
          }
          if (answerText) break
          current = current.parentElement
        }

        if (qText && answerText) {
          rawPairs.push({ question: qText, answer: cleanExtractedText(answerText) })
        }
      }
      if (rawPairs.length > 0) {
        strategyUsed = 'structural'
        console.log(`[Rufus] Strategy 4 (structural): ${rawPairs.length} pairs`)
      }
    }

    this._strategyUsed = strategyUsed
    console.log(`[Rufus] Extraction strategy: ${strategyUsed} (${rawPairs.length} raw pairs)`)

    // De-duplicate by exact (question + answer) pair AND validate quality
    const seen = new Set()
    const uniquePairs = []
    for (const pair of rawPairs) {
      const q = cleanExtractedText(pair.question)
      const a = cleanExtractedText(pair.answer)
      // Skip garbage entries (UI junk, scripts, etc.)
      if (!isValidQAPair(q, a)) {
        console.log(`[Rufus] Skipped junk entry: "${q.substring(0, 40)}..."`)
        continue
      }
      const key = `${q.toLowerCase().trim()}|||${a.toLowerCase().trim()}`
      if (!seen.has(key)) {
        seen.add(key)
        uniquePairs.push({ question: q, answer: a })
      }
    }

    return uniquePairs
  }

  // ── Live-capture: extract latest answer immediately after clicking ──

  /**
   * Find the most recently added answer in the chat DOM.
   * Called right after clicking a question and waiting for the response.
   *
   * Correct approach: find the LAST .rufus-papyrus-turn (or .rufus-papyrus-active-turn),
   * then concatenate ALL markdownSection divs inside it — a single question can
   * generate multiple answer sections (intro paragraph + list + comparison, etc.).
   */
  _extractLatestAnswer() {
    const container = document.querySelector(this.selectors.chatContainer)
    if (!container) {
      console.log('[LiveCapture] Container NOT FOUND:', this.selectors.chatContainer)
      return null
    }
    console.log(`[LiveCapture] Container found, textContent: ${container.textContent.trim().length} chars`)

    // Preferred: grab the latest turn (active or last history turn) and concat its sections
    const turnSelectors = ['.rufus-papyrus-active-turn', '.rufus-papyrus-turn']
    for (const turnSel of turnSelectors) {
      const turns = container.querySelectorAll(turnSel)
      if (turns.length === 0) continue
      const latestTurn = turns[turns.length - 1]
      const sections = latestTurn.querySelectorAll('div[data-csa-c-group-id^="markdownSection"]')
      if (sections.length > 0) {
        const text = Array.from(sections)
          .map((s) => s.textContent.trim())
          .filter((t) => t.length > 0)
          .join('\n\n')
        if (text && text.length > 15) {
          console.log(`[LiveCapture] HIT via turn "${turnSel}" (${sections.length} sections, ${text.length} chars): "${text.substring(0, 80)}..."`)
          return text
        }
      }
    }

    // Fallback: pick the last markdownSection anywhere in the container (legacy behavior)
    const answerSelectors = [
      'div[data-csa-c-group-id^="markdownSection"]',
      '[id^="section_groupId_text_template_"]',
      '[data-csa-c-type="container"][data-csa-c-group-id]',
      '[class*="markdown"][class*="section"]',
    ]

    for (const selector of answerSelectors) {
      try {
        const elements = container.querySelectorAll(selector)
        console.log(`[LiveCapture] Selector "${selector}": ${elements.length} matches`)
        if (elements.length > 0) {
          for (let i = elements.length - 1; i >= 0; i--) {
            const text = elements[i].textContent.trim()
            if (text && text.length > 15) {
              console.log(`[LiveCapture] HIT via selector "${selector}" (${text.length} chars): "${text.substring(0, 80)}..."`)
              return text
            }
          }
        }
      } catch { /* skip invalid selector */ }
    }

    // Fallback 1: any div with dir="auto" or CSS-in-JS classes
    const allBlocks = container.querySelectorAll('div[dir="auto"], div[class*="css-"]')
    console.log(`[LiveCapture] Fallback 1 (dir=auto / css-*): ${allBlocks.length} elements`)
    for (let i = allBlocks.length - 1; i >= 0; i--) {
      const text = allBlocks[i].textContent.trim()
      if (text && text.length > 20 && !text.endsWith('?')) {
        console.log(`[LiveCapture] HIT via fallback 1 (${text.length} chars): "${text.substring(0, 80)}..."`)
        return text
      }
    }

    // Fallback 2: broadest — any div with substantial text
    const allDivs = container.querySelectorAll('div')
    const containerLen = container.textContent.trim().length
    console.log(`[LiveCapture] Fallback 2 (all divs): ${allDivs.length} elements, container text: ${containerLen} chars`)
    for (let i = allDivs.length - 1; i >= 0; i--) {
      const text = allDivs[i].textContent.trim()
      if (text && text.length > 30 && !text.endsWith('?') && allDivs[i] !== container) {
        if (text.length > containerLen * 0.8) continue
        console.log(`[LiveCapture] HIT via fallback 2 (${text.length} chars): "${text.substring(0, 80)}..."`)
        return text
      }
    }

    console.log('[LiveCapture] ALL METHODS FAILED — returning null')
    return null
  }

  // ── Selector-based helpers (Strategies 3-4) ────────────────

  _findTurns(container) {
    const turnSelectors = [
      '.rufus-papyrus-turn',            // 2026 Rufus: ids interaction0, interaction1, …
      'div[id^="interaction"]',          // Same thing via id prefix
      'div[id^="history-turn-"]',        // Legacy
      '.conversation-turn-container',
      '[class*="turn-container"]',
      '[class*="history-turn"]',
    ]
    for (const selector of turnSelectors) {
      try {
        const turns = container.querySelectorAll(selector)
        this._recordSelectorHit(selector, turns.length)
        if (turns.length > 0) {
          const topLevel = Array.from(turns).filter((t) => {
            return this._findQuestionInElement(t) !== null
          })
          if (topLevel.length > 0) {
            console.log(`[Rufus] Found ${topLevel.length} turns via "${selector}"`)
            return topLevel
          }
        }
      } catch { /* invalid selector, skip */ }
    }
    return []
  }

  _findQuestionInElement(el) {
    // Prefer .rufus-customer-text first — gives clean question text without junk.
    // [data-section-class="CustomerText"] wraps it but includes "Customer question" screen-reader label.
    const questionSelectors = [
      '.rufus-customer-text',
      '.dialog-customer',
      '[class*="customer-text"]',
      '[data-section-class="CustomerText"]',
      '[class*="customer"][class*="dialog"]',
    ]
    for (const selector of questionSelectors) {
      try {
        const found = el.querySelector(selector)
        if (found && found.textContent.trim().length > 0) return found
      } catch { /* skip */ }
    }
    return null
  }

  /**
   * Find ALL answer section elements inside a turn.
   * A single Rufus response can contain multiple markdownSection divs
   * (e.g. intro paragraph + bullet list + comparison). We return them all
   * so _extractFromTurn can concatenate them into one answer.
   */
  _findAnswerElementsInTurn(el) {
    const answerSelectors = [
      'div[data-csa-c-group-id^="markdownSection"]',
      '[id^="section_groupId_text_template_"]',
      '[data-csa-c-type="container"][data-csa-c-group-id]',
      '[class*="markdown"][class*="section"]',
    ]
    for (const selector of answerSelectors) {
      try {
        const els = Array.from(el.querySelectorAll(selector)).filter(
          (e) => e.textContent.trim().length > 5
        )
        if (els.length > 0) return els
      } catch { /* skip */ }
    }
    return []
  }

  _extractFromTurn(turn) {
    const questionEl = this._findQuestionInElement(turn)
    if (!questionEl) return null

    const questionText = cleanExtractedText(questionEl.textContent.trim())
    if (!questionText) return null

    const answerEls = this._findAnswerElementsInTurn(turn)
    if (answerEls.length === 0) return null

    // Concatenate ALL answer sections into one answer.
    // A single Q can produce multiple markdown sections (intro + list + comparison).
    const answerText = answerEls
      .map((e) => cleanExtractedText(e.textContent.trim()))
      .filter((t) => t.length > 0)
      .join('\n\n')

    if (!answerText || answerText.length <= 15) return null

    return { question: questionText, answer: answerText }
  }

  _findAllQuestions(container) {
    const selectors = [
      '.rufus-customer-text',             // Prefer — returns clean question text
      '.dialog-customer',
      '[class*="customer-text"]',
      '[data-section-class="CustomerText"]',
    ]
    for (const selector of selectors) {
      try {
        const els = container.querySelectorAll(selector)
        if (els.length > 0) {
          console.log(`[Rufus] Found ${els.length} questions via "${selector}"`)
          return Array.from(els)
        }
      } catch { /* skip */ }
    }
    return []
  }

  _findAllAnswers(container) {
    const selectors = [
      'div[data-csa-c-group-id^="markdownSection"]',
      '[id^="section_groupId_text_template_"]',
      '[data-csa-c-type="container"][data-csa-c-group-id]',
    ]
    for (const selector of selectors) {
      try {
        const els = container.querySelectorAll(selector)
        if (els.length > 0) {
          console.log(`[Rufus] Found ${els.length} answers via "${selector}"`)
          return Array.from(els)
        }
      } catch { /* skip */ }
    }
    return []
  }

  /**
   * Type a custom question into the Rufus input, submit, wait for the answer,
   * and capture (Q, A) live. Used by ASK_CUSTOM_QUESTIONS — bypasses chip-clicking
   * so callers can ask their own prompts (Amy Wees Rufus loop, etc.).
   *
   * Submit strategy: prefer clicking the submit button (Amazon enables it once
   * text is detected via React state). Fall back to Enter keypress if the button
   * is disabled or missing.
   */
  async askCustomQuestions(questions) {
    const inputSel = this.selectors.rufusInput
    const submitSel = this.selectors.rufusSubmit

    if (!inputSel) {
      return { success: false, error: 'rufusInput selector not configured', pairs: [] }
    }

    const livePairs = []
    const askedQuestions = []

    for (let i = 0; i < questions.length; i++) {
      if (this.aborted) break
      const question = questions[i].trim()
      if (!question) continue

      let input
      try {
        input = await waitForElement(inputSel, 8000)
      } catch {
        return {
          success: livePairs.length > 0,
          error: `Could not find Rufus input box (selector: ${inputSel}). Update via Settings.`,
          pairs: livePairs,
          askedQuestions,
        }
      }

      const beforeTurnCount = this._countAllTurns()

      this._setInputValue(input, question)
      await sleep(300)

      let submitted = false
      if (submitSel) {
        const submitBtn = document.querySelector(submitSel)
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click()
          submitted = true
        }
      }
      if (!submitted) {
        input.focus()
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })
        input.dispatchEvent(enterEvent)
        const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })
        input.dispatchEvent(enterUp)
      }

      askedQuestions.push(question)
      this._allHandled.add(question)
      this.totalQuestionsHandled++

      chrome.runtime.sendMessage({
        type: 'EXTRACTION_PROGRESS',
        data: { questionsClicked: this.totalQuestionsHandled, lastQuestion: question.substring(0, 60) },
      }).catch(() => {})

      console.log(`[Rufus] Custom Q${i + 1}/${questions.length}: "${question.substring(0, 60)}..."`)

      const newTurn = await this._waitForNewTurn(beforeTurnCount, 30000)
      if (!newTurn) {
        console.log('[Rufus] No new turn appeared after submitting — Rufus may not have accepted the question')
        continue
      }

      // Wait for answer to finish streaming. We poll the latest turn's text length
      // and consider it complete once it stops growing for `stableMs`.
      // Loader classes (rufus-loader-avatar, rufus-conversation-loader) change between
      // Amazon UI versions, so length-stability is the most robust signal.
      await this._waitForAnswerComplete({ maxMs: 60000, stableMs: 2500, minLen: 30 })
      await sleep(500)

      const answerText = this._extractLatestAnswer()
      if (answerText) {
        livePairs.push({
          question: cleanExtractedText(question),
          answer: cleanExtractedText(answerText),
        })
        this._livePairs.push({
          question: cleanExtractedText(question),
          answer: cleanExtractedText(answerText),
        })
        console.log(`[Rufus] Custom Q${i + 1} captured (${answerText.length} chars)`)
      } else {
        console.log(`[Rufus] No answer captured for custom Q${i + 1}`)
      }
    }

    return {
      success: livePairs.length > 0,
      pairs: livePairs,
      askedQuestions,
      totalAsked: askedQuestions.length,
    }
  }

  /**
   * React-friendly value setter for textarea/input. Setting `.value` directly
   * bypasses React's synthetic event system; using the prototype's native setter
   * + dispatching an input event tricks React into picking up the change.
   */
  _setInputValue(el, text) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    el.focus()
    if (setter) {
      setter.call(el, text)
    } else {
      el.value = text
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /**
   * Count ALL turns on the page. Streaming turns are tagged
   * .rufus-papyrus-active-turn (no .rufus-papyrus-turn) until streaming finishes,
   * so we have to count both classes to detect that a new question registered.
   */
  _countAllTurns() {
    const container = document.querySelector(this.selectors.chatContainer)
    const root = container || document
    return root.querySelectorAll('.rufus-papyrus-turn, .rufus-papyrus-active-turn').length
  }

  _findLatestTurn() {
    const container = document.querySelector(this.selectors.chatContainer)
    const root = container || document
    const turns = root.querySelectorAll('.rufus-papyrus-active-turn, .rufus-papyrus-turn')
    return turns[turns.length - 1] || null
  }

  /**
   * Wait until total turn count exceeds beforeCount (= Rufus accepted our
   * question and started a new turn). Returns the latest turn or null on timeout.
   */
  async _waitForNewTurn(beforeCount, timeoutMs = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (this._countAllTurns() > beforeCount) {
        return this._findLatestTurn()
      }
      await sleep(300)
    }
    return null
  }

  /**
   * Wait until the latest turn's text stops growing — heuristic for "stream done"
   * that doesn't depend on Amazon's loader class names (they churn across UI versions).
   * Polls every 500ms; considers complete after `stableMs` of no growth past `minLen`.
   */
  async _waitForAnswerComplete({ maxMs = 60000, stableMs = 2500, minLen = 30 }) {
    const start = Date.now()
    let lastLen = 0
    let stableSince = null
    while (Date.now() - start < maxMs) {
      const turn = this._findLatestTurn()
      const len = turn ? turn.textContent.trim().length : 0
      if (len !== lastLen) {
        lastLen = len
        stableSince = null
      } else if (len >= minLen) {
        if (stableSince === null) stableSince = Date.now()
        else if (Date.now() - stableSince >= stableMs) return true
      }
      await sleep(500)
    }
    return false
  }

  /**
   * Run one batch: open Rufus, click questions, extract Q&A, return results.
   * Background handles the refresh cycle and accumulation across batches.
   */
  async run() {
    console.log(`[Rufus] Starting batch (${this._previouslyCompleted.size} previously completed, batch size ${this.batchSize})`)
    console.log(`[Rufus] Title keywords: ${Array.from(this.titleKeywords).join(', ')}`)
    console.log(`[Rufus] Topic keywords (${this.topicKeywords.size}): ${Array.from(this.topicKeywords).slice(0, 20).join(', ')}`)

    // Step 0: Check Amazon login
    const loginStatus = checkAmazonLogin()
    if (loginStatus.loggedIn === false) {
      return {
        success: false,
        error: `Not logged into Amazon. ${loginStatus.hint}. Rufus requires an Amazon account.`,
        loginRequired: true,
        pairs: [],
      }
    }
    if (loginStatus.loggedIn === null) {
      console.warn('[Rufus] Login status unclear:', loginStatus.hint)
    }

    // Step 1: Open Rufus
    const rufusOpened = await this.openRufus()
    if (!rufusOpened) {
      return { success: false, error: 'Could not open Rufus chat panel. Is Rufus available on this marketplace?', pairs: [] }
    }
    console.log('[Rufus] Rufus panel opened')

    // Step 2: Click up to batchSize new questions
    const clicked = await this.clickBatch()
    console.log(`[Rufus] Batch complete: clicked ${clicked} questions (${this.totalQuestionsHandled} total handled)`)

    // Step 3: Extract Q&A from current DOM
    await sleep(1000)
    const pairs = this.extractQAPairs()
    console.log(`[Rufus] Extracted ${pairs.length} Q&A pairs from this batch`)

    return {
      success: pairs.length > 0 || clicked > 0,
      pairs,
      // State for background to pass to next batch
      clickedQuestions: Array.from(this._allHandled),
      batchClicked: this._batchClicked,
      harvestedPills: Array.from(this.harvestedPills),
      // Golden set: pills visible BEFORE clicking (initial/product-anchored)
      freshPills: Array.from(this._freshPills),
      // Which initial pills this batch explored as seeds
      clickedInitials: this._clickedInitials,
      topicKeywords: Array.from(this.topicKeywords),
      consecutiveOffTopic: this.consecutiveOffTopic,
      // Stop signals
      noMoreQuestions: clicked === 0,
      stoppedOffTopic: this.consecutiveOffTopic >= this.maxOffTopic,
      asin: getAsinFromUrl(),
      url: window.location.href,
      // Telemetry (forwarded to backend via extraction log)
      strategyUsed: this._strategyUsed,
      selectorsHit: this._selectorsHit,
    }
  }
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Primary handler: click one batch of questions and extract ──
  if (message.type === 'CLICK_BATCH_AND_EXTRACT') {
    const extractor = new RufusExtractor(
      message.settings,
      message.completedQuestions || [],
      message.topicKeywords || [],
      message.skippedSeeds || [],
    )
    currentExtractor = extractor
    extractor
      .run()
      .then((result) => {
        currentExtractor = null
        sendResponse(result)
      })
      .catch((err) => {
        currentExtractor = null
        // Try to extract whatever is in DOM
        const pairs = extractor.extractQAPairs()
        sendResponse({
          success: pairs.length > 0,
          error: err.message,
          pairs,
          clickedQuestions: Array.from(extractor._allHandled),
          topicKeywords: Array.from(extractor.topicKeywords),
          consecutiveOffTopic: extractor.consecutiveOffTopic,
          noMoreQuestions: false,
          stoppedOffTopic: false,
        })
      })
    return true
  }

  // ── Legacy compatibility: same as CLICK_BATCH_AND_EXTRACT ──
  if (message.type === 'EXTRACT_RUFUS_QA') {
    const extractor = new RufusExtractor(
      message.settings,
      message.completedQuestions || [],
      message.topicKeywords || [],
      message.skippedSeeds || [],
    )
    currentExtractor = extractor
    extractor
      .run()
      .then((result) => {
        currentExtractor = null
        // Reshape to match old response format for any legacy callers
        sendResponse({
          success: result.pairs?.length > 0,
          questions: result.pairs || [],
          asin: result.asin,
          url: result.url,
          clickedCount: result.clickedQuestions?.length || 0,
          exhausted: result.noMoreQuestions,
          stoppedOffTopic: result.stoppedOffTopic,
        })
      })
      .catch((err) => {
        currentExtractor = null
        sendResponse({ success: false, error: err.message, questions: [] })
      })
    return true
  }

  // ── Custom-question mode: type each question into Rufus, capture each answer ──
  if (message.type === 'ASK_CUSTOM_QUESTIONS') {
    const extractor = new RufusExtractor(
      message.settings,
      message.completedQuestions || [],
      [],
      [],
    )
    currentExtractor = extractor
    ;(async () => {
      try {
        const loginStatus = checkAmazonLogin()
        if (loginStatus.loggedIn === false) {
          sendResponse({ success: false, error: `Not logged into Amazon. ${loginStatus.hint}.`, loginRequired: true, pairs: [] })
          currentExtractor = null
          return
        }
        const opened = await extractor.openRufus()
        if (!opened) {
          sendResponse({ success: false, error: 'Could not open Rufus chat panel.', pairs: [] })
          currentExtractor = null
          return
        }
        // Click "Start a new chat" so prior product/conversation context doesn't pollute answers.
        // Rufus retains chat memory across product navigations — without this reset,
        // questions like "what are people buying instead?" return "already covered earlier".
        const newChatBtn = document.querySelector('#rufus-panel-header-new-chat, [aria-label="Start a new chat"]')
        if (newChatBtn) {
          newChatBtn.click()
          await sleep(2000)
        }
        const result = await extractor.askCustomQuestions(message.questions || [])
        currentExtractor = null
        sendResponse({
          ...result,
          asin: getAsinFromUrl(),
          url: window.location.href,
          mode: 'custom',
        })
      } catch (err) {
        currentExtractor = null
        const pairs = extractor._livePairs || []
        sendResponse({ success: pairs.length > 0, error: err.message, pairs })
      }
    })()
    return true
  }

  if (message.type === 'ABORT_EXTRACTION') {
    if (currentExtractor) {
      currentExtractor.aborted = true
      console.log('[Rufus] Abort signal received — stopping extraction')
    }
    sendResponse({ success: true })
    return true
  }

  if (message.type === 'EXTRACT_QA_ONLY') {
    // Extract whatever Q&A is currently in the DOM.
    // If currentExtractor has live-captured pairs, use those (guaranteed correct).
    // A temp extractor has no _livePairs so it would use fallback strategies.
    if (currentExtractor) {
      currentExtractor.aborted = true
      const pairs = currentExtractor.extractQAPairs()
      sendResponse({ success: pairs.length > 0, questions: pairs, partialResults: true })
    } else {
      // No active extractor — return empty rather than risk shifted data
      console.log('[Rufus] EXTRACT_QA_ONLY: no active extractor, returning empty')
      sendResponse({ success: false, questions: [], partialResults: true })
    }
    return true
  }

  if (message.type === 'CHECK_LOGIN') {
    const status = checkAmazonLogin()
    sendResponse(status)
    return true
  }

  if (message.type === 'PING') {
    sendResponse({ alive: true, asin: getAsinFromUrl() })
    return true
  }
})

console.log('[Rufus Extractor] Content script loaded on', window.location.href)
