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
      requestAnimationFrame(check)
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
  }

  /**
   * Open the Rufus chat panel by clicking its trigger button.
   */
  async openRufus() {
    try {
      const button = await waitForElement(this.selectors.rufusButton, 8000)
      button.click()
      await sleep(2000)
      return true
    } catch {
      console.log('[Rufus Extractor] Rufus button not found, checking if already open...')
      const chat = document.querySelector(this.selectors.chatContainer)
      return !!chat
    }
  }

  /**
   * Click suggested questions until Rufus stops producing new ones.
   *
   * Stops when:
   * - No new question chips appear for 3 consecutive rounds (exhausted)
   * - Safety cap (maxQuestions) is reached
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
   * De-duplicates by exact (question + answer) pair.
   * Same question with different answer = KEPT (Rufus may answer differently).
   */
  extractQAPairs() {
    const questions = queryAll(this.selectors.questionBubble)
    const answers = queryAll(this.selectors.answerBubble)
    const rawPairs = []

    // Strategy 1: Pair by position (question[i] -> answer[i])
    if (questions.length > 0 && answers.length > 0) {
      const len = Math.min(questions.length, answers.length)
      for (let i = 0; i < len; i++) {
        const q = questions[i].textContent.trim()
        const a = answers[i].textContent.trim()
        if (q && a) {
          rawPairs.push({ question: q, answer: a })
        }
      }
    }

    // Strategy 2: If no structured messages found, try alternating blocks
    if (rawPairs.length === 0) {
      const container = document.querySelector(this.selectors.chatContainer)
      if (container) {
        const messages = Array.from(container.children).filter(
          (el) => el.textContent.trim().length > 0
        )
        for (let i = 0; i < messages.length - 1; i += 2) {
          const q = messages[i].textContent.trim()
          const a = messages[i + 1].textContent.trim()
          if (q && a) {
            rawPairs.push({ question: q, answer: a })
          }
        }
      }
    }

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

  /**
   * Run the full extraction pipeline.
   */
  async run() {
    console.log('[Rufus Extractor] Starting extraction (will run until questions exhausted)...')

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

    if (clicked === 0) {
      return { success: false, error: 'No questions found to click. Check the question chip selector in settings.' }
    }

    // Step 3: Extract and de-duplicate Q&A pairs
    await sleep(1000) // Final settle time
    const pairs = this.extractQAPairs()
    console.log(`[Rufus Extractor] Extracted ${pairs.length} unique Q&A pairs (from ${clicked} clicks)`)

    return {
      success: true,
      questions: pairs,
      asin: getAsinFromUrl(),
      url: window.location.href,
      clickedCount: clicked,
      exhausted: this.consecutiveEmptyRounds >= this.maxEmptyRounds,
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
        sendResponse({ success: false, error: err.message })
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
