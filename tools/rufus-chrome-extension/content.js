/**
 * Rufus Q&A Extractor — Content Script
 *
 * Runs on Amazon product pages. On command from the background worker:
 * 1. Opens the Rufus chat panel
 * 2. Clicks suggested questions one by one
 * 3. Waits for each answer to load
 * 4. Extracts all Q&A pairs
 * 5. Returns them to the background worker
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
    // Check if already present
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
    const timer = setTimeout(resolve, timeoutMs) // Resolve even if loading never disappears

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
    // If the composite selector fails, try each individually
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

// ─── Main Extraction Logic ───────────────────────────────────────

class RufusExtractor {
  constructor(settings) {
    this.questionCount = settings.questionCount || 20
    this.delayBetweenClicks = settings.delayBetweenClicks || 3000
    this.selectors = settings.selectors || {}
    this.extractedQA = []
    this.clickedQuestions = new Set()
  }

  /**
   * Open the Rufus chat panel by clicking its trigger button.
   */
  async openRufus() {
    try {
      const button = await waitForElement(this.selectors.rufusButton, 8000)
      button.click()
      // Wait for the chat panel to appear
      await sleep(2000)
      return true
    } catch {
      // Rufus button not found — it may already be open, or not available
      console.log('[Rufus Extractor] Rufus button not found, checking if already open...')
      const chat = document.querySelector(this.selectors.chatContainer)
      return !!chat
    }
  }

  /**
   * Click suggested question chips, waiting for each answer.
   */
  async clickQuestions() {
    let questionsClicked = 0

    for (let attempt = 0; attempt < this.questionCount * 3 && questionsClicked < this.questionCount; attempt++) {
      // Find available question chips
      const chips = queryAll(this.selectors.questionChip)
      const unclicked = chips.filter((chip) => {
        const text = chip.textContent.trim()
        return text && !this.clickedQuestions.has(text)
      })

      if (unclicked.length === 0) {
        // No more new questions available — try scrolling the chat to load more
        const container = document.querySelector(this.selectors.chatContainer)
        if (container) {
          container.scrollTop = container.scrollHeight
          await sleep(2000)
          // Check again
          const retryChips = queryAll(this.selectors.questionChip)
          const retryUnclicked = retryChips.filter((chip) => {
            const text = chip.textContent.trim()
            return text && !this.clickedQuestions.has(text)
          })
          if (retryUnclicked.length === 0) {
            console.log(`[Rufus Extractor] No more questions available after ${questionsClicked} clicks`)
            break
          }
        } else {
          break
        }
      }

      // Click the first unclicked question
      const target = unclicked[0] || queryAll(this.selectors.questionChip).find(
        (chip) => !this.clickedQuestions.has(chip.textContent.trim())
      )
      if (!target) break

      const questionText = target.textContent.trim()
      this.clickedQuestions.add(questionText)

      target.click()
      questionsClicked++

      console.log(`[Rufus Extractor] Clicked question ${questionsClicked}/${this.questionCount}: "${questionText.substring(0, 50)}..."`)

      // Wait for the answer to load
      if (this.selectors.loadingIndicator) {
        await sleep(500)
        await waitForLoadingDone(this.selectors.loadingIndicator, 15000)
      }

      // Additional delay for answer rendering
      await sleep(this.delayBetweenClicks)
    }

    return questionsClicked
  }

  /**
   * Extract all Q&A pairs from the chat history.
   */
  extractQAPairs() {
    const questions = queryAll(this.selectors.questionBubble)
    const answers = queryAll(this.selectors.answerBubble)
    const pairs = []

    // Strategy 1: Pair by position (question[i] → answer[i])
    if (questions.length > 0 && answers.length > 0) {
      const len = Math.min(questions.length, answers.length)
      for (let i = 0; i < len; i++) {
        const q = questions[i].textContent.trim()
        const a = answers[i].textContent.trim()
        if (q && a) {
          pairs.push({ question: q, answer: a })
        }
      }
    }

    // Strategy 2: If no structured messages found, try extracting from
    // the chat container as alternating blocks
    if (pairs.length === 0) {
      const container = document.querySelector(this.selectors.chatContainer)
      if (container) {
        // Get all direct children that look like messages
        const messages = Array.from(container.children).filter(
          (el) => el.textContent.trim().length > 0
        )
        for (let i = 0; i < messages.length - 1; i += 2) {
          const q = messages[i].textContent.trim()
          const a = messages[i + 1].textContent.trim()
          if (q && a) {
            pairs.push({ question: q, answer: a })
          }
        }
      }
    }

    this.extractedQA = pairs
    return pairs
  }

  /**
   * Run the full extraction pipeline.
   */
  async run() {
    console.log(`[Rufus Extractor] Starting extraction for ${this.questionCount} questions...`)

    // Step 1: Open Rufus
    const rufusOpened = await this.openRufus()
    if (!rufusOpened) {
      return { success: false, error: 'Could not open Rufus chat panel' }
    }
    console.log('[Rufus Extractor] Rufus panel opened')

    // Step 2: Click questions
    const clicked = await this.clickQuestions()
    console.log(`[Rufus Extractor] Clicked ${clicked} questions`)

    if (clicked === 0) {
      return { success: false, error: 'No questions found to click' }
    }

    // Step 3: Extract Q&A pairs
    await sleep(1000) // Final settle time
    const pairs = this.extractQAPairs()
    console.log(`[Rufus Extractor] Extracted ${pairs.length} Q&A pairs`)

    return {
      success: true,
      questions: pairs,
      asin: getAsinFromUrl(),
      url: window.location.href,
      clickedCount: clicked,
    }
  }
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_RUFUS_QA') {
    const extractor = new RufusExtractor(message.settings)
    extractor
      .run()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true // Keep the message channel open for async response
  }

  if (message.type === 'PING') {
    sendResponse({ alive: true, asin: getAsinFromUrl() })
    return true
  }
})

// Announce presence to background
console.log('[Rufus Extractor] Content script loaded on', window.location.href)
