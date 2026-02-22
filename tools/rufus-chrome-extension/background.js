/**
 * Rufus Q&A Extractor — Background Service Worker
 *
 * Manages the ASIN queue, orchestrates tab navigation, and handles
 * communication between the popup, content scripts, and the platform API.
 *
 * KEY DESIGN DECISIONS:
 * - Sequential only — one product at a time (Rufus chat state would mix in parallel)
 * - Full page refresh between products to reset Rufus chat state
 * - Runs until Rufus stops producing new questions (no fixed count)
 * - De-duplication happens both client-side (content.js) and server-side (API)
 */

// ─── State ───────────────────────────────────────────────────────
let queue = [] // Array of { asin, marketplace, status, questions, error, ... }
let isRunning = false
let currentIndex = -1
let activeTabId = null

// ─── Default Settings ────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  maxQuestions: 200, // Safety cap per product
  delayBetweenClicks: 3000,
  delayBetweenProducts: 5000,
  selectors: {
    rufusButton: '[data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [aria-label*="Rufus"], [data-testid*="rufus"]',
    questionChip: '.rufus-suggestion, [data-testid="rufus-suggestion"], .rufus-chip, [role="button"][data-suggestion]',
    chatContainer: '.rufus-chat-container, [data-testid="rufus-messages"], .rufus-messages',
    questionBubble: '.rufus-message-user, [data-testid="rufus-user-message"], .rufus-question',
    answerBubble: '.rufus-message-bot, [data-testid="rufus-bot-message"], .rufus-answer',
    loadingIndicator: '.rufus-loading, [data-testid="rufus-loading"], .rufus-typing',
  },
}

async function getSettings() {
  const result = await chrome.storage.sync.get('settings')
  return { ...DEFAULT_SETTINGS, ...result.settings }
}

// ─── Marketplace → Amazon URL mapping ────────────────────────────
const MARKETPLACE_URLS = {
  'amazon.com': 'https://www.amazon.com',
  'amazon.co.uk': 'https://www.amazon.co.uk',
  'amazon.de': 'https://www.amazon.de',
  'amazon.fr': 'https://www.amazon.fr',
  'amazon.ca': 'https://www.amazon.ca',
  'amazon.it': 'https://www.amazon.it',
  'amazon.es': 'https://www.amazon.es',
  'amazon.com.mx': 'https://www.amazon.com.mx',
  'amazon.com.au': 'https://www.amazon.com.au',
  'amazon.ae': 'https://www.amazon.ae',
}

// ─── Queue Management ────────────────────────────────────────────

function broadcastState() {
  const state = { queue, isRunning, currentIndex }
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', data: state }).catch(() => {
    // Popup may be closed — ignore
  })
}

async function processNext() {
  if (!isRunning) return

  currentIndex++
  if (currentIndex >= queue.length) {
    isRunning = false
    currentIndex = -1
    broadcastState()
    return
  }

  const item = queue[currentIndex]
  item.status = 'processing'
  item.progress = 'Loading page...'
  broadcastState()

  const settings = await getSettings()
  const baseUrl = MARKETPLACE_URLS[item.marketplace] || 'https://www.amazon.com'
  const productUrl = `${baseUrl}/dp/${item.asin}`

  try {
    // ── Step 1: Navigate to product page ──
    // Always do a fresh navigation to ensure clean Rufus state
    if (activeTabId) {
      try {
        // Refresh: navigate to a blank page first, then to the product
        // This ensures Rufus chat is fully reset between products
        await chrome.tabs.update(activeTabId, { url: 'about:blank' })
        await sleep(500)
        await chrome.tabs.update(activeTabId, { url: productUrl })
      } catch {
        const tab = await chrome.tabs.create({ url: productUrl, active: true })
        activeTabId = tab.id
      }
    } else {
      const tab = await chrome.tabs.create({ url: productUrl, active: true })
      activeTabId = tab.id
    }

    // Wait for page to fully load
    await waitForTabLoad(activeTabId)
    // Extra delay for dynamic content (Rufus widget, scripts, etc.)
    await sleep(4000)

    item.progress = 'Extracting Q&A...'
    broadcastState()

    // ── Step 2: Send extraction command to content script ──
    // Content script will click questions until exhausted
    const response = await chrome.tabs.sendMessage(activeTabId, {
      type: 'EXTRACT_RUFUS_QA',
      settings: {
        maxQuestions: settings.maxQuestions,
        delayBetweenClicks: settings.delayBetweenClicks,
        selectors: settings.selectors,
      },
    })

    if (response && response.success) {
      item.status = 'done'
      item.questions = response.questions
      item.questionCount = response.questions.length
      item.exhausted = response.exhausted
      item.progress = null

      // ── Step 3: Send to platform API ──
      if (settings.apiKey) {
        item.progress = 'Sending to platform...'
        broadcastState()
        try {
          const apiResult = await sendToPlatform(item, settings)
          item.apiSent = true
          item.apiNewCount = apiResult.new_questions_added || 0
          item.progress = null
        } catch (apiErr) {
          item.apiError = apiErr.message
          item.progress = null
        }
      }
    } else if (response && response.loginRequired) {
      // Amazon login required — stop the entire queue
      item.status = 'error'
      item.error = response.error
      isRunning = false
      broadcastState()
      return // Don't process more — user needs to log in
    } else {
      item.status = 'error'
      item.error = response?.error || 'Extraction failed'
    }
  } catch (err) {
    item.status = 'error'
    item.error = err.message
  }

  item.progress = null
  broadcastState()

  // Delay before next product — give Amazon a breather
  if (isRunning && currentIndex < queue.length - 1) {
    const nextItem = queue[currentIndex + 1]
    if (nextItem) {
      nextItem.progress = `Waiting ${Math.round(settings.delayBetweenProducts / 1000)}s...`
      broadcastState()
    }
    await sleep(settings.delayBetweenProducts)
  }

  // Process next (sequential — never parallel)
  processNext()
}

async function sendToPlatform(item, settings) {
  const response = await fetch(`${settings.apiUrl}/api/rufus-qna`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      asin: item.asin,
      marketplace: item.marketplace,
      questions: item.questions,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error (${response.status}): ${text}`)
  }

  return response.json()
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Page load timeout (30s)'))
    }, 30000)

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }

    chrome.tabs.onUpdated.addListener(listener)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE':
      sendResponse({ queue, isRunning, currentIndex })
      return true

    case 'ADD_TO_QUEUE': {
      const { asins, marketplace } = message.data
      let added = 0
      for (const asin of asins) {
        const cleaned = asin.trim().toUpperCase()
        if (/^[A-Z0-9]{10}$/.test(cleaned)) {
          if (!queue.some((q) => q.asin === cleaned && q.marketplace === marketplace)) {
            queue.push({ asin: cleaned, marketplace, status: 'pending', questions: [] })
            added++
          }
        }
      }
      broadcastState()
      sendResponse({ success: true, added, queueLength: queue.length })
      return true
    }

    case 'START_QUEUE':
      if (!isRunning && queue.some((q) => q.status === 'pending')) {
        isRunning = true
        currentIndex = queue.findIndex((q) => q.status === 'pending') - 1
        broadcastState()
        processNext()
      }
      sendResponse({ success: true })
      return true

    case 'STOP_QUEUE':
      isRunning = false
      // Mark the currently processing item as stopped
      const processing = queue.find((q) => q.status === 'processing')
      if (processing) {
        processing.status = 'pending' // Reset to pending so it can be retried
        processing.progress = null
      }
      broadcastState()
      sendResponse({ success: true })
      return true

    case 'CLEAR_QUEUE':
      queue = []
      isRunning = false
      currentIndex = -1
      broadcastState()
      sendResponse({ success: true })
      return true

    case 'CLEAR_COMPLETED':
      queue = queue.filter((q) => q.status !== 'done' && q.status !== 'error')
      broadcastState()
      sendResponse({ success: true })
      return true

    case 'REMOVE_FROM_QUEUE': {
      queue = queue.filter((q) => !(q.asin === message.data.asin && q.marketplace === message.data.marketplace))
      broadcastState()
      sendResponse({ success: true })
      return true
    }

    case 'RETRY_FAILED': {
      for (const item of queue) {
        if (item.status === 'error') {
          item.status = 'pending'
          item.error = null
          item.questions = []
        }
      }
      broadcastState()
      sendResponse({ success: true })
      return true
    }

    case 'EXPORT_RESULTS': {
      const completed = queue.filter((q) => q.status === 'done' && q.questions?.length)
      sendResponse({ success: true, data: completed })
      return true
    }

    case 'EXTRACTION_PROGRESS': {
      // Content script reporting progress
      const current = queue.find((q) => q.status === 'processing')
      if (current && message.data) {
        current.progress = `Q${message.data.questionsClicked}: ${message.data.lastQuestion}`
      }
      broadcastState()
      return true
    }

    default:
      return false
  }
})

// Clean up tab reference when it's closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null
  }
})
