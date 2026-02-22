/**
 * Rufus Q&A Extractor — Background Service Worker
 *
 * Manages the ASIN queue, orchestrates tab navigation, and handles
 * communication between the popup, content scripts, and the platform API.
 */

// ─── State ───────────────────────────────────────────────────────
let queue = [] // Array of { asin, marketplace, status, questions, error }
let isRunning = false
let currentIndex = -1
let activeTabId = null

// ─── Default Settings ────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  questionCount: 20,
  delayBetweenClicks: 3000, // ms between clicking each question
  delayBetweenProducts: 5000, // ms between navigating to next product
  selectors: {
    // Rufus chat trigger button
    rufusButton: '[data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [aria-label*="Rufus"], [data-testid*="rufus"]',
    // Suggested question chips inside the Rufus panel
    questionChip: '.rufus-suggestion, [data-testid="rufus-suggestion"], .rufus-chip, [role="button"][data-suggestion]',
    // Chat message container
    chatContainer: '.rufus-chat-container, [data-testid="rufus-messages"], .rufus-messages',
    // Individual question bubble (sent by user / clicked suggestion)
    questionBubble: '.rufus-message-user, [data-testid="rufus-user-message"], .rufus-question',
    // Individual answer bubble (Rufus response)
    answerBubble: '.rufus-message-bot, [data-testid="rufus-bot-message"], .rufus-answer',
    // Loading indicator (wait for this to disappear)
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
  broadcastState()

  const settings = await getSettings()
  const baseUrl = MARKETPLACE_URLS[item.marketplace] || 'https://www.amazon.com'
  const productUrl = `${baseUrl}/dp/${item.asin}`

  try {
    // Open the product page in a new tab (or reuse existing)
    if (activeTabId) {
      try {
        await chrome.tabs.update(activeTabId, { url: productUrl })
      } catch {
        // Tab was closed — create new one
        const tab = await chrome.tabs.create({ url: productUrl, active: true })
        activeTabId = tab.id
      }
    } else {
      const tab = await chrome.tabs.create({ url: productUrl, active: true })
      activeTabId = tab.id
    }

    // Wait for page to fully load
    await waitForTabLoad(activeTabId)
    // Extra delay for dynamic content
    await sleep(3000)

    // Send extraction command to content script
    const response = await chrome.tabs.sendMessage(activeTabId, {
      type: 'EXTRACT_RUFUS_QA',
      settings: {
        questionCount: settings.questionCount,
        delayBetweenClicks: settings.delayBetweenClicks,
        selectors: settings.selectors,
      },
    })

    if (response && response.success) {
      item.status = 'done'
      item.questions = response.questions
      item.questionCount = response.questions.length

      // Send to platform API
      if (settings.apiKey) {
        try {
          await sendToPlatform(item, settings)
          item.apiSent = true
        } catch (apiErr) {
          item.apiError = apiErr.message
        }
      }
    } else {
      item.status = 'error'
      item.error = response?.error || 'Extraction failed'
    }
  } catch (err) {
    item.status = 'error'
    item.error = err.message
  }

  broadcastState()

  // Delay before next product
  if (isRunning && currentIndex < queue.length - 1) {
    await sleep(settings.delayBetweenProducts)
  }

  // Process next
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
      for (const asin of asins) {
        const cleaned = asin.trim().toUpperCase()
        if (/^[A-Z0-9]{10}$/.test(cleaned)) {
          // Avoid duplicates
          if (!queue.some((q) => q.asin === cleaned && q.marketplace === marketplace)) {
            queue.push({ asin: cleaned, marketplace, status: 'pending', questions: [] })
          }
        }
      }
      broadcastState()
      sendResponse({ success: true, queueLength: queue.length })
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

    case 'REMOVE_FROM_QUEUE': {
      queue = queue.filter((q) => q.asin !== message.data.asin)
      broadcastState()
      sendResponse({ success: true })
      return true
    }

    case 'EXPORT_RESULTS': {
      const completed = queue.filter((q) => q.status === 'done' && q.questions?.length)
      sendResponse({ success: true, data: completed })
      return true
    }

    case 'EXTRACTION_COMPLETE': {
      // Content script reports back directly — handled via sendMessage response
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
