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
 * Rufus DOM includes hidden metadata like "{}" from script tags and
 * screen-reader text like "Customer question" that pollute textContent.
 */
function cleanExtractedText(text) {
  return text
    .replace(/^\{\}\s*/g, '')                    // Leading "{}" from script tags
    .replace(/^Customer question\s*/i, '')       // Screen-reader label
    .replace(/\s+/g, ' ')                        // Collapse whitespace
    .trim()
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
   * @param {string[]} completedQuestions - Questions already handled in previous batches
   * @param {string[]} topicKeywords - Topic keywords built up from previous batches
   */
  constructor(settings, completedQuestions = [], topicKeywords = []) {
    this.batchSize = settings.batchSize || 5
    this.delayBetweenClicks = settings.delayBetweenClicks || 3000
    this.selectors = settings.selectors || {}
    this.aborted = false

    // Questions already handled in previous batches (skip these when clicking)
    this._previouslyCompleted = new Set(completedQuestions)
    // Questions clicked in THIS batch only (for text-anchor DOM extraction)
    this._batchClicked = []
    // All handled questions = previous + this batch (for skip logic)
    this._allHandled = new Set(completedQuestions)

    // Off-topic detection
    this.titleKeywords = new Set(extractKeywords(getProductTitle()))
    this.topicKeywords = new Set([...this.titleKeywords, ...topicKeywords])
    // Seed phase is based on TOTAL questions across ALL batches
    this.seedPhaseSize = 5
    this.totalQuestionsHandled = completedQuestions.length
    this.consecutiveOffTopic = settings.consecutiveOffTopic || 0
    this.maxOffTopic = 5

    // Harvested pills from this page load
    this.harvestedPills = new Set()
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
   * - Skips questions already completed in previous batches
   * - Skips off-topic questions (doesn't click them)
   * - Harvests all visible pill texts for background to track
   * - No Rufus reset — background handles full page refresh between batches
   */
  async clickBatch() {
    let clicked = 0
    let consecutiveEmpty = 0
    const maxEmpty = 3

    while (clicked < this.batchSize && !this.aborted) {
      // Find available question chips
      const chips = queryAll(this.selectors.questionChip)

      // Harvest all visible pills (including ones we'll skip)
      for (const chip of chips) {
        const text = chip.textContent.trim()
        if (text) this.harvestedPills.add(text)
      }

      // Find chips not yet handled (across all batches)
      const unclicked = chips.filter((chip) => {
        const text = chip.textContent.trim()
        return text && !this._allHandled.has(text)
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
      const questionKws = extractKeywords(questionText)
      if (this.totalQuestionsHandled < this.seedPhaseSize) {
        // Seed phase: enrich topic profile (only if relevant to product title)
        const isRelevant = this.titleKeywords.size === 0 ||
          questionKws.some((kw) => this.titleKeywords.has(kw))
        if (isRelevant) {
          for (const kw of questionKws) this.topicKeywords.add(kw)
        }
        this.consecutiveOffTopic = 0
      } else if (this.topicKeywords.size > 0) {
        const isOnTopic = questionKws.some((kw) => this.topicKeywords.has(kw))
        if (!isOnTopic && questionKws.length > 0) {
          this.consecutiveOffTopic++
          console.log(`[Rufus] Off-topic (${this.consecutiveOffTopic}/${this.maxOffTopic}): "${questionText.substring(0, 50)}..."`)
          // Mark as handled but DON'T click
          this._allHandled.add(questionText)
          this.totalQuestionsHandled++
          if (this.consecutiveOffTopic >= this.maxOffTopic) {
            console.log('[Rufus] Too many consecutive off-topic questions — stopping batch')
            break
          }
          continue
        } else {
          this.consecutiveOffTopic = 0
          for (const kw of questionKws) this.topicKeywords.add(kw)
        }
      }

      // ── Click the question ──
      this._allHandled.add(questionText)
      this._batchClicked.push(questionText)
      this.totalQuestionsHandled++
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
    }

    return clicked
  }

  /**
   * Extract all Q&A pairs from the chat history.
   *
   * FUTURE-PROOFED: Uses cascading detection strategies so that when Amazon
   * changes their DOM, the extraction automatically falls through to the next
   * working strategy. Strategy 0 needs ZERO CSS selectors — it uses the
   * question texts we clicked as anchors to discover the DOM automatically.
   *
   * Strategy 0: Text-anchor — uses THIS BATCH's clicked question texts as DOM anchors
   * Strategy 1: Turn-based — find history turns, extract Q+A from each
   * Strategy 2: Selector-based — find all Q and A elements separately, pair by position
   * Strategy 3: Structural — walk DOM looking for customer/bot message patterns
   */
  extractQAPairs() {
    const rufusContainer = document.querySelector(this.selectors.chatContainer)
    if (!rufusContainer) {
      console.log('[Rufus] Chat container not found')
      return []
    }

    let rawPairs = []
    let strategyUsed = 'none'

    // ── Strategy 0: Text-anchor auto-discovery (MOST RESILIENT) ──
    // Uses THIS BATCH's clicked questions (only those are in the current DOM)
    if (this._batchClicked.length > 0) {
      rawPairs = this._extractByTextAnchors(rufusContainer)
      if (rawPairs.length > 0) {
        strategyUsed = 'text-anchor'
        console.log(`[Rufus] Strategy 0 (text-anchor): ${rawPairs.length} pairs from ${this._batchClicked.length} clicked questions`)
      }
    }

    // ── Strategy 1: Turn-based extraction ──
    if (rawPairs.length === 0) {
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
    }

    // ── Strategy 2: Selector-based (separate Q/A lists, pair by position) ──
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
          console.log(`[Rufus] Strategy 2 (selector-based): ${rawPairs.length} pairs`)
        }
      }
    }

    // ── Strategy 3: Structural walk ──
    if (rawPairs.length === 0) {
      const customerEls = this._findAllQuestions(rufusContainer)
      for (const qEl of customerEls) {
        const qText = cleanExtractedText(qEl.textContent.trim())
        if (!qText) continue

        let answerText = ''
        let parent = qEl.parentElement
        for (let depth = 0; depth < 5 && parent && parent !== rufusContainer; depth++) {
          const siblings = Array.from(parent.parentElement?.children || [])
          for (const sibling of siblings) {
            if (sibling === parent) continue
            if (sibling.contains(qEl)) continue
            const sibText = sibling.textContent.trim()
            if (sibText && sibText !== qText && sibText.length > 15 && !sibText.endsWith('?')) {
              answerText = sibText
              break
            }
          }
          if (answerText) break
          parent = parent.parentElement
        }

        if (qText && answerText) {
          rawPairs.push({ question: qText, answer: cleanExtractedText(answerText) })
        }
      }
      if (rawPairs.length > 0) {
        strategyUsed = 'structural'
        console.log(`[Rufus] Strategy 3 (structural): ${rawPairs.length} pairs`)
      }
    }

    console.log(`[Rufus] Extraction strategy: ${strategyUsed} (${rawPairs.length} raw pairs)`)

    // De-duplicate by exact (question + answer) pair
    const seen = new Set()
    const uniquePairs = []
    for (const pair of rawPairs) {
      const key = `${pair.question.toLowerCase().trim()}|||${pair.answer.toLowerCase().trim()}`
      if (!seen.has(key)) {
        seen.add(key)
        uniquePairs.push(pair)
      }
    }

    return uniquePairs
  }

  // ── Strategy 0: Text-anchor auto-discovery ──────────────────

  /**
   * THE MOST RESILIENT EXTRACTION METHOD.
   *
   * Uses THIS BATCH's clicked question texts as anchors to find Q&A pairs.
   * Only searches for questions from the current batch because previous
   * batch DOM is gone after page refresh.
   */
  _extractByTextAnchors(container) {
    const pairs = []

    for (const qText of this._batchClicked) {
      const qElement = this._findTightestElement(container, qText)
      if (!qElement) {
        console.log(`[Text-Anchor] Could not find element for: "${qText.substring(0, 40)}..."`)
        continue
      }

      const answerText = this._findAnswerNearQuestion(qElement, qText, container)
      if (answerText) {
        pairs.push({ question: cleanExtractedText(qText), answer: cleanExtractedText(answerText) })
      } else {
        console.log(`[Text-Anchor] No answer found near: "${qText.substring(0, 40)}..."`)
      }
    }

    return pairs
  }

  /**
   * Find the tightest (smallest) DOM element that contains the exact target text.
   */
  _findTightestElement(container, targetText) {
    const candidates = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
    let node
    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim()
      if (nodeText === targetText) {
        candidates.push({ el: node, exactness: nodeText.length })
      }
    }

    if (candidates.length === 0) return null

    candidates.sort((a, b) => a.exactness - b.exactness)
    return candidates[0].el
  }

  /**
   * Given a question element, find the answer text by walking up the DOM
   * to find the ancestor that contains both the question and the answer.
   */
  _findAnswerNearQuestion(qElement, qText, rootContainer) {
    let current = qElement

    for (let depth = 0; depth < 8 && current && current !== rootContainer; depth++) {
      const parent = current.parentElement
      if (!parent) break

      const children = Array.from(parent.children)
      for (const child of children) {
        if (child === current || child.contains(qElement) || qElement.contains(child)) continue

        const childText = child.textContent.trim()
        if (childText && childText.length > 15 && childText !== qText) {
          if (childText.length < 50 && childText.endsWith('?')) continue
          return childText
        }
      }

      current = parent
    }

    return null
  }

  // ── Selector-based helpers (Strategies 1-3) ────────────────

  _findTurns(container) {
    const turnSelectors = [
      'div[id^="history-turn-"]',
      '.conversation-turn-container',
      '[class*="turn-container"]',
      '[class*="history-turn"]',
    ]
    for (const selector of turnSelectors) {
      try {
        const turns = container.querySelectorAll(selector)
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
    const questionSelectors = [
      '[data-section-class="CustomerText"]',
      '.rufus-customer-text',
      '.dialog-customer',
      '[class*="customer-text"]',
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

  _findAnswerInElement(el, questionEl) {
    const answerSelectors = [
      'div[data-csa-c-group-id^="markdownSection"]',
      '[id^="section_groupId_text_template_"]',
      '[data-csa-c-type="container"][data-csa-c-group-id]',
      '[class*="markdown"][class*="section"]',
    ]
    for (const selector of answerSelectors) {
      try {
        const found = el.querySelector(selector)
        if (found && found.textContent.trim().length > 15) return found
      } catch { /* skip */ }
    }

    // Heuristic: find the largest text block that isn't the question
    const questionText = questionEl ? questionEl.textContent.trim() : ''
    let bestCandidate = null
    let bestLength = 0
    const candidates = el.querySelectorAll('div[dir="auto"], div[class*="css-"]')
    for (const c of candidates) {
      if (questionEl && (questionEl.contains(c) || c.contains(questionEl))) continue
      const text = c.textContent.trim()
      if (text.length > bestLength && text !== questionText && text.length > 15) {
        bestCandidate = c
        bestLength = text.length
      }
    }
    return bestCandidate
  }

  _extractFromTurn(turn) {
    const questionEl = this._findQuestionInElement(turn)
    if (!questionEl) return null

    const questionText = cleanExtractedText(questionEl.textContent.trim())
    if (!questionText) return null

    const answerEl = this._findAnswerInElement(turn, questionEl)
    if (!answerEl) return null

    const answerText = cleanExtractedText(answerEl.textContent.trim())
    if (!answerText || answerText.length <= 15) return null

    return { question: questionText, answer: answerText }
  }

  _findAllQuestions(container) {
    const selectors = [
      '[data-section-class="CustomerText"]',
      '.rufus-customer-text',
      '.dialog-customer',
      '[class*="customer-text"]',
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
      topicKeywords: Array.from(this.topicKeywords),
      consecutiveOffTopic: this.consecutiveOffTopic,
      // Stop signals
      noMoreQuestions: clicked === 0,
      stoppedOffTopic: this.consecutiveOffTopic >= this.maxOffTopic,
      asin: getAsinFromUrl(),
      url: window.location.href,
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

  if (message.type === 'ABORT_EXTRACTION') {
    if (currentExtractor) {
      currentExtractor.aborted = true
      console.log('[Rufus] Abort signal received — stopping extraction')
    }
    sendResponse({ success: true })
    return true
  }

  if (message.type === 'EXTRACT_QA_ONLY') {
    // Extract whatever Q&A is currently in the DOM
    if (currentExtractor) {
      currentExtractor.aborted = true
      const pairs = currentExtractor.extractQAPairs()
      sendResponse({ success: pairs.length > 0, questions: pairs, partialResults: true })
    } else {
      const tempExtractor = new RufusExtractor(message.settings || {})
      const pairs = tempExtractor.extractQAPairs()
      sendResponse({ success: pairs.length > 0, questions: pairs, partialResults: true })
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
