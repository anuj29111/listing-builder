/**
 * Rufus Q&A Extractor — Content Script
 *
 * Runs on Amazon product pages. On command from the background worker:
 * 1. Checks Amazon login status
 * 2. Opens the Rufus chat panel
 * 3. Clicks suggested questions one by one
 * 4. Keeps going until Rufus stops producing new questions (or hits max cap)
 * 5. Extracts all Q&A pairs
 * 6. Returns them to the background worker
 *
 * IMPORTANT: Only one product at a time. The background worker refreshes
 * the page between products to reset Rufus chat state.
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
      setTimeout(check, 200) // Check every 200ms instead of every frame
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
 * Check if the user is logged into Amazon.
 * Looks for common signed-in indicators in the nav bar.
 */
function checkAmazonLogin() {
  // Amazon shows "Hello, [Name]" or "Hello, sign in" in the nav
  const accountEl = document.getElementById('nav-link-accountList')
  if (accountEl) {
    const text = accountEl.textContent || ''
    // "Hello, sign in" means NOT logged in
    if (text.toLowerCase().includes('sign in')) {
      return { loggedIn: false, hint: 'Amazon nav shows "sign in" — not logged in' }
    }
    return { loggedIn: true }
  }

  // Fallback: check for greeting text
  const greetingEl = document.getElementById('nav-greeting')
  if (greetingEl) {
    const text = greetingEl.textContent || ''
    if (text.toLowerCase().includes('sign in') || text.toLowerCase().includes('hello, sign in')) {
      return { loggedIn: false, hint: 'Greeting shows "sign in"' }
    }
    return { loggedIn: true }
  }

  // Can't determine — proceed anyway but warn
  return { loggedIn: null, hint: 'Could not determine login status' }
}

// ─── Main Extraction Logic ───────────────────────────────────────

// Global ref to current extractor so ABORT_EXTRACTION can reach it
let currentExtractor = null

class RufusExtractor {
  constructor(settings) {
    this.maxQuestions = settings.maxQuestions || 200 // Safety cap
    this.delayBetweenClicks = settings.delayBetweenClicks || 3000
    this.selectors = settings.selectors || {}
    this.extractedQA = []
    this.clickedQuestions = new Set()
    // Track consecutive rounds with no new questions to decide when to stop
    this.consecutiveEmptyRounds = 0
    this.maxEmptyRounds = 3 // Stop after 3 rounds with no new questions
    this.aborted = false
    // Off-topic detection: learn topic from product title + first N questions
    this.titleKeywords = new Set(extractKeywords(getProductTitle()))
    this.topicKeywords = new Set(this.titleKeywords) // Start with title keywords
    this.seedPhaseSize = 5 // First 5 questions can enrich the topic profile (gated by title relevance)
    this.consecutiveOffTopic = 0
    this.maxOffTopic = 5 // Stop after 5 consecutive off-topic questions
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
        console.log('[Rufus Extractor] Question chips appeared')
      } catch {
        console.log('[Rufus Extractor] Question chips did not appear within 10s')
      }

      return true
    } catch {
      console.log('[Rufus Extractor] Rufus button not found, checking if already open...')
      const chat = document.querySelector(this.selectors.chatContainer)
      if (chat) {
        // Rufus is open — wait for chips
        try {
          await waitForElement(this.selectors.questionChip, 10000)
        } catch {
          console.log('[Rufus Extractor] Rufus open but no question chips found')
        }
        return true
      }
      return false
    }
  }

  /**
   * Click suggested questions until Rufus stops producing new ones.
   *
   * Stops when:
   * - No new question chips appear for 3 consecutive rounds (exhausted)
   * - Safety cap (maxQuestions) is reached
   * - 5 consecutive off-topic questions detected
   * - User stops the queue (checked via abort flag)
   */
  async clickQuestions() {
    let questionsClicked = 0

    while (questionsClicked < this.maxQuestions && !this.aborted) {
      // Find available question chips that haven't been clicked
      const chips = queryAll(this.selectors.questionChip)
      const unclicked = chips.filter((chip) => {
        const text = chip.textContent.trim()
        return text && !this.clickedQuestions.has(text)
      })

      if (unclicked.length === 0) {
        this.consecutiveEmptyRounds++
        console.log(
          `[Rufus Extractor] No new questions (round ${this.consecutiveEmptyRounds}/${this.maxEmptyRounds})`
        )

        if (this.consecutiveEmptyRounds >= this.maxEmptyRounds) {
          console.log('[Rufus Extractor] Exhausted — no more new questions from Rufus')
          break
        }

        // Try scrolling to trigger more suggestions
        const container = document.querySelector(this.selectors.chatContainer)
        if (container) {
          container.scrollTop = container.scrollHeight
        }
        await sleep(3000) // Wait longer for new suggestions to appear
        continue
      }

      // Found new questions — reset empty counter
      this.consecutiveEmptyRounds = 0

      // Click the first unclicked question
      const target = unclicked[0]
      const questionText = target.textContent.trim()

      // Off-topic detection: learn from initial questions, then detect drift
      const questionKws = extractKeywords(questionText)
      if (questionsClicked < this.seedPhaseSize) {
        // Seed phase: only enrich topic profile if question shares at least one
        // keyword with the product title. Prevents unrelated early questions from
        // polluting the profile (e.g., "painting techniques" on a chalk marker product).
        const isRelevantSeed = this.titleKeywords.size === 0 ||
          questionKws.some((kw) => this.titleKeywords.has(kw))
        if (isRelevantSeed) {
          for (const kw of questionKws) this.topicKeywords.add(kw)
        }
        this.consecutiveOffTopic = 0
      } else if (this.topicKeywords.size > 0) {
        // Detection phase: check if question shares any keyword with learned topic
        const isOnTopic = questionKws.some((kw) => this.topicKeywords.has(kw))
        if (!isOnTopic && questionKws.length > 0) {
          this.consecutiveOffTopic++
          console.log(
            `[Rufus Extractor] Off-topic question (${this.consecutiveOffTopic}/${this.maxOffTopic}): "${questionText.substring(0, 50)}..."`
          )
          if (this.consecutiveOffTopic >= this.maxOffTopic) {
            console.log('[Rufus Extractor] Stopping — too many consecutive off-topic questions')
            break
          }
          // Still click it (to move forward) but track that it's off-topic
        } else {
          this.consecutiveOffTopic = 0 // Reset on relevant question
          // On-topic questions also enrich the profile
          for (const kw of questionKws) this.topicKeywords.add(kw)
        }
      }

      this.clickedQuestions.add(questionText)
      target.click()
      questionsClicked++

      // Report progress back to background
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_PROGRESS',
        data: { questionsClicked, lastQuestion: questionText.substring(0, 60) },
      }).catch(() => {})

      console.log(
        `[Rufus Extractor] Clicked question ${questionsClicked}: "${questionText.substring(0, 50)}..."`
      )

      // Wait for the answer to load
      if (this.selectors.loadingIndicator) {
        await sleep(500)
        await waitForLoadingDone(this.selectors.loadingIndicator, 15000)
      }

      // Delay for answer rendering + next suggestions to appear
      await sleep(this.delayBetweenClicks)
    }

    return questionsClicked
  }

  /**
   * Extract all Q&A pairs from the chat history.
   *
   * FUTURE-PROOFED: Uses cascading detection strategies so that when Amazon
   * changes their DOM (which they do frequently), the extraction automatically
   * falls through to the next working strategy. NO hardcoded selectors needed
   * for the primary strategy — it uses the question texts we already clicked
   * as anchors to discover the DOM structure automatically.
   *
   * Strategy 0: Text-anchor — we KNOW what questions we clicked, so we search
   *   the DOM for those exact texts, then find adjacent answer content (zero selectors)
   * Strategy 1: Turn-based — find history turns, extract Q+A from each
   * Strategy 2: Selector-based — find all Q and A elements separately, pair by position
   * Strategy 3: Structural — walk DOM looking for customer/bot message patterns
   *
   * De-duplicates by exact (question + answer) pair.
   * Same question with different answer = KEPT (Rufus may answer differently).
   */
  extractQAPairs() {
    const rufusContainer = document.querySelector(this.selectors.chatContainer)
    if (!rufusContainer) {
      console.log('[Rufus Extractor] Chat container not found')
      return []
    }

    let rawPairs = []
    let strategyUsed = 'none'

    // ── Strategy 0: Text-anchor auto-discovery (MOST RESILIENT) ──
    // We already KNOW the question texts (we clicked them). Search the DOM
    // for those exact texts, then find the adjacent answer content.
    // This needs ZERO CSS selectors — works even if Amazon changes everything.
    if (this.clickedQuestions.size > 0) {
      rawPairs = this._extractByTextAnchors(rufusContainer)
      if (rawPairs.length > 0) {
        strategyUsed = 'text-anchor'
        console.log(`[Rufus Extractor] Strategy 0 (text-anchor): ${rawPairs.length} pairs from ${this.clickedQuestions.size} clicked questions`)
      }
    }

    // ── Strategy 1: Turn-based extraction ──
    // Each history turn contains one Q+A exchange. We find turns, then
    // locate the question and answer within each using multiple fallback selectors.
    if (rawPairs.length === 0) {
      const turns = this._findTurns(rufusContainer)
      if (turns.length > 0) {
        for (const turn of turns) {
          const qa = this._extractFromTurn(turn)
          if (qa) rawPairs.push(qa)
        }
        if (rawPairs.length > 0) {
          strategyUsed = 'turn-based'
          console.log(`[Rufus Extractor] Strategy 1 (turn-based): ${rawPairs.length} pairs from ${turns.length} turns`)
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
          const q = questions[i].textContent.trim()
          const a = answers[i].textContent.trim()
          if (q && a && a.length > 15) {
            rawPairs.push({ question: q, answer: a })
          }
        }
        if (rawPairs.length > 0) {
          strategyUsed = 'selector-based'
          console.log(`[Rufus Extractor] Strategy 2 (selector-based): ${rawPairs.length} pairs`)
        }
      }
    }

    // ── Strategy 3: Structural walk (like the bookmarklet approach) ──
    // Look for customer text elements, then find sibling/adjacent content as answers.
    if (rawPairs.length === 0) {
      const customerEls = this._findAllQuestions(rufusContainer)
      for (const qEl of customerEls) {
        const qText = qEl.textContent.trim()
        if (!qText) continue

        // Walk up to find the turn-level container, then look for answer content
        let answerText = ''
        let parent = qEl.parentElement
        // Walk up max 5 levels to find a container that has answer siblings
        for (let depth = 0; depth < 5 && parent && parent !== rufusContainer; depth++) {
          const siblings = Array.from(parent.parentElement?.children || [])
          for (const sibling of siblings) {
            if (sibling === parent) continue
            if (sibling.contains(qEl)) continue
            const sibText = sibling.textContent.trim()
            // Answer candidate: not the question, substantial length, not just a question
            if (sibText && sibText !== qText && sibText.length > 15 && !sibText.endsWith('?')) {
              answerText = sibText
              break
            }
          }
          if (answerText) break
          parent = parent.parentElement
        }

        if (qText && answerText) {
          rawPairs.push({ question: qText, answer: answerText })
        }
      }
      if (rawPairs.length > 0) {
        strategyUsed = 'structural'
        console.log(`[Rufus Extractor] Strategy 3 (structural): ${rawPairs.length} pairs`)
      }
    }

    console.log(`[Rufus Extractor] Extraction strategy used: ${strategyUsed} (${rawPairs.length} raw pairs)`)

    // De-duplicate: only exact (question + answer) pairs are duplicates.
    // Same question with a different answer is KEPT.
    const seen = new Set()
    const uniquePairs = []
    for (const pair of rawPairs) {
      const key = `${pair.question.toLowerCase().trim()}|||${pair.answer.toLowerCase().trim()}`
      if (!seen.has(key)) {
        seen.add(key)
        uniquePairs.push(pair)
      }
    }

    this.extractedQA = uniquePairs
    return uniquePairs
  }

  // ── Strategy 0: Text-anchor auto-discovery ──────────────────

  /**
   * THE MOST RESILIENT EXTRACTION METHOD.
   *
   * Uses the known question texts (from this.clickedQuestions) as anchors
   * to find Q&A pairs in the DOM. Works by:
   * 1. For each known question text, find the tightest DOM element containing it
   * 2. Walk up to find a "turn boundary" (the container holding both Q and A)
   * 3. Extract all non-question text from that boundary as the answer
   *
   * This approach needs ZERO CSS selectors — it works purely by matching
   * known text content against the DOM. Even if Amazon changes every class
   * name and ID, this will still work because we anchor on the TEXT we clicked.
   */
  _extractByTextAnchors(container) {
    const pairs = []
    const knownQuestions = Array.from(this.clickedQuestions)

    for (const qText of knownQuestions) {
      // Step 1: Find the tightest element containing this question text
      const qElement = this._findTightestElement(container, qText)
      if (!qElement) {
        console.log(`[Text-Anchor] Could not find element for: "${qText.substring(0, 40)}..."`)
        continue
      }

      // Step 2: Walk up to find the turn boundary, then extract answer
      const answerText = this._findAnswerNearQuestion(qElement, qText, container)
      if (answerText) {
        pairs.push({ question: qText, answer: answerText })
      } else {
        console.log(`[Text-Anchor] No answer found near: "${qText.substring(0, 40)}..."`)
      }
    }

    return pairs
  }

  /**
   * Find the tightest (smallest) DOM element that contains the exact target text.
   * "Tightest" = the element whose textContent matches but whose children's
   * individual textContent does NOT match (i.e., it's the closest wrapper).
   */
  _findTightestElement(container, targetText) {
    // Walk all elements, find ones whose textContent matches
    const candidates = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
    let node
    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim()
      // Exact match or starts-with (some elements may have trailing whitespace/icons)
      if (nodeText === targetText) {
        candidates.push({ el: node, exactness: nodeText.length })
      }
    }

    if (candidates.length === 0) return null

    // Prefer the tightest match: smallest element (least total text) with exact match
    // Sort by text length (ascending) — tightest element has least extra content
    candidates.sort((a, b) => a.exactness - b.exactness)
    return candidates[0].el
  }

  /**
   * Given a question element, find the answer text by walking up the DOM
   * to find the "turn boundary" — the ancestor that contains both the
   * question and the answer. Then extract non-question content as the answer.
   */
  _findAnswerNearQuestion(qElement, qText, rootContainer) {
    let current = qElement

    // Walk up max 8 levels to find a container that has answer content
    for (let depth = 0; depth < 8 && current && current !== rootContainer; depth++) {
      const parent = current.parentElement
      if (!parent) break

      // Check if this parent has children that contain substantial non-question text
      const children = Array.from(parent.children)
      for (const child of children) {
        // Skip the branch containing our question
        if (child === current || child.contains(qElement) || qElement.contains(child)) continue

        const childText = child.textContent.trim()

        // Answer criteria: substantial text that isn't the question
        if (childText && childText.length > 15 && childText !== qText) {
          // Avoid picking up another question (short text ending with ?)
          // But allow answers that happen to contain question marks
          if (childText.length < 50 && childText.endsWith('?')) continue
          return childText
        }
      }

      current = parent
    }

    return null
  }

  // ── Selector-based helpers (Strategies 1-3) ────────────────

  /**
   * Find conversation turn containers using cascading selectors.
   * Amazon changes class names but the turn structure is consistent.
   */
  _findTurns(container) {
    const turnSelectors = [
      'div[id^="history-turn-"]',        // Current (Mar 2026)
      '.conversation-turn-container',     // Legacy
      '[class*="turn-container"]',        // Fuzzy match
      '[class*="history-turn"]',          // Fuzzy match
    ]
    for (const selector of turnSelectors) {
      try {
        const turns = container.querySelectorAll(selector)
        if (turns.length > 0) {
          // Filter to only top-level turns (avoid nested turn divs)
          const topLevel = Array.from(turns).filter((t) => {
            // A turn should contain a customer question
            return this._findQuestionInElement(t) !== null
          })
          if (topLevel.length > 0) {
            console.log(`[Rufus Extractor] Found ${topLevel.length} turns via "${selector}"`)
            return topLevel
          }
        }
      } catch { /* invalid selector, skip */ }
    }
    return []
  }

  /**
   * Find the customer question element within a turn/container.
   * Uses multiple strategies: data attributes (most stable) → class names → heuristics.
   */
  _findQuestionInElement(el) {
    const questionSelectors = [
      '[data-section-class="CustomerText"]',  // Data attribute (most stable)
      '.rufus-customer-text',                 // Current class name
      '.dialog-customer',                     // Alternative class
      '[class*="customer-text"]',             // Fuzzy match
      '[class*="customer"][class*="dialog"]', // Fuzzy match
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
   * Find the answer element within a turn/container.
   * Answers are typically markdownSection containers or similar.
   */
  _findAnswerInElement(el, questionEl) {
    const answerSelectors = [
      'div[data-csa-c-group-id^="markdownSection"]',  // Current (Mar 2026)
      '[id^="section_groupId_text_template_"]',         // Legacy
      '[data-csa-c-type="container"][data-csa-c-group-id]', // Generic CSA container
      '[class*="markdown"][class*="section"]',          // Fuzzy match
    ]
    for (const selector of answerSelectors) {
      try {
        const found = el.querySelector(selector)
        if (found && found.textContent.trim().length > 15) return found
      } catch { /* skip */ }
    }

    // Heuristic fallback: find the largest text block that isn't the question
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

  /**
   * Extract a Q+A pair from a single conversation turn.
   */
  _extractFromTurn(turn) {
    const questionEl = this._findQuestionInElement(turn)
    if (!questionEl) return null

    const questionText = questionEl.textContent.trim()
    if (!questionText) return null

    const answerEl = this._findAnswerInElement(turn, questionEl)
    if (!answerEl) return null

    const answerText = answerEl.textContent.trim()
    if (!answerText || answerText.length <= 15) return null

    return { question: questionText, answer: answerText }
  }

  /**
   * Find ALL question elements in the Rufus container using cascading selectors.
   */
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
          console.log(`[Rufus Extractor] Found ${els.length} questions via "${selector}"`)
          return Array.from(els)
        }
      } catch { /* skip */ }
    }
    return []
  }

  /**
   * Find ALL answer elements in the Rufus container using cascading selectors.
   */
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
          console.log(`[Rufus Extractor] Found ${els.length} answers via "${selector}"`)
          return Array.from(els)
        }
      } catch { /* skip */ }
    }
    return []
  }

  /**
   * Run the full extraction pipeline.
   * Always returns partial results even on error/abort.
   */
  async run() {
    console.log('[Rufus Extractor] Starting extraction (will run until questions exhausted)...')
    console.log(`[Rufus Extractor] Product title keywords: ${Array.from(this.topicKeywords).join(', ')}`)
    console.log(`[Rufus Extractor] Title keywords: ${Array.from(this.titleKeywords).join(', ')}`)
    console.log(`[Rufus Extractor] First ${this.seedPhaseSize} questions can enrich topic profile (only if title-relevant), then off-topic detection kicks in`)

    // Step 0: Check Amazon login
    const loginStatus = checkAmazonLogin()
    if (loginStatus.loggedIn === false) {
      return {
        success: false,
        error: `Not logged into Amazon. ${loginStatus.hint}. Rufus requires an Amazon account.`,
        loginRequired: true,
      }
    }
    if (loginStatus.loggedIn === null) {
      console.warn('[Rufus Extractor] Login status unclear:', loginStatus.hint)
    }

    // Step 1: Open Rufus
    const rufusOpened = await this.openRufus()
    if (!rufusOpened) {
      return { success: false, error: 'Could not open Rufus chat panel. Is Rufus available on this marketplace?' }
    }
    console.log('[Rufus Extractor] Rufus panel opened')

    // Step 2: Click questions until exhausted
    const clicked = await this.clickQuestions()
    console.log(`[Rufus Extractor] Clicked ${clicked} questions total`)

    // Step 3: Extract and de-duplicate Q&A pairs (always, even if 0 clicks)
    await sleep(1000) // Final settle time
    const pairs = this.extractQAPairs()
    console.log(`[Rufus Extractor] Extracted ${pairs.length} unique Q&A pairs (from ${clicked} clicks)`)

    if (clicked === 0 && pairs.length === 0) {
      return {
        success: false,
        error: 'No questions found to click. Check the question chip selector in settings.',
        // Return partial data anyway
        questions: [],
        partialResults: true,
      }
    }

    return {
      success: pairs.length > 0,
      questions: pairs,
      asin: getAsinFromUrl(),
      url: window.location.href,
      clickedCount: clicked,
      exhausted: this.consecutiveEmptyRounds >= this.maxEmptyRounds,
      stoppedOffTopic: this.consecutiveOffTopic >= this.maxOffTopic,
    }
  }
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_RUFUS_QA') {
    const extractor = new RufusExtractor(message.settings)
    currentExtractor = extractor
    extractor
      .run()
      .then((result) => {
        currentExtractor = null
        sendResponse(result)
      })
      .catch((err) => {
        currentExtractor = null
        // On error, still try to return whatever was extracted
        const pairs = extractor.extractQAPairs()
        sendResponse({
          success: pairs.length > 0,
          error: err.message,
          questions: pairs,
          partialResults: true,
        })
      })
    return true // Keep the message channel open for async response
  }

  if (message.type === 'ABORT_EXTRACTION') {
    if (currentExtractor) {
      currentExtractor.aborted = true
      console.log('[Rufus Extractor] Abort signal received — stopping extraction')
    }
    sendResponse({ success: true })
    return true
  }

  if (message.type === 'EXTRACT_QA_ONLY') {
    // Extract whatever Q&A is currently in the DOM (used after timeout)
    if (currentExtractor) {
      currentExtractor.aborted = true // Stop clicking
      const pairs = currentExtractor.extractQAPairs()
      sendResponse({ success: pairs.length > 0, questions: pairs, partialResults: true })
    } else {
      // No extractor running — create a temporary one just for extraction
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
