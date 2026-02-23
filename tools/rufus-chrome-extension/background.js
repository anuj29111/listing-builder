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
 * - State persisted to chrome.storage.local to survive service worker restarts (MV3)
 * - Uses chrome.alarms for between-product delays (survives worker termination)
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

const EXTRACTION_TIMEOUT_MS = 600000 // 10 minutes per product
const ALARM_NAME = 'rufus-next-product'

async function getSettings() {
  // Settings (non-sensitive) from sync, API key from local
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get('apiKey'),
  ])
  return {
    ...DEFAULT_SETTINGS,
    ...syncResult.settings,
    apiKey: localResult.apiKey || syncResult.settings?.apiKey || '',
  }
}

// ─── State Persistence (MV3 service workers are ephemeral) ───────

async function persistState() {
  await chrome.storage.local.set({
    _rufusState: { queue, isRunning, currentIndex, activeTabId },
  })
}

async function restoreState() {
  const result = await chrome.storage.local.get('_rufusState')
  if (result._rufusState) {
    const s = result._rufusState
    queue = s.queue || []
    isRunning = s.isRunning || false
    currentIndex = s.currentIndex ?? -1
    activeTabId = s.activeTabId || null

    // If we were running when the worker died, resume processing
    if (isRunning) {
      // The item that was processing may have been interrupted
      const processing = queue.find((q) => q.status === 'processing')
      if (processing) {
        processing.status = 'pending'
        processing.progress = null
      }
      // Find the next pending item and resume
      const nextPending = queue.findIndex((q) => q.status === 'pending')
      if (nextPending >= 0) {
        currentIndex = nextPending - 1
        processNext()
      } else {
        isRunning = false
        currentIndex = -1
        await persistState()
      }
    }
  }
}

// Restore state on service worker startup
restoreState()

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

/**
 * Ping the content script to verify it's loaded and responsive.
 * Retries up to `retries` times with `interval` ms between attempts.
 */
async function pingContentScript(tabId, retries = 5, interval = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' })
      if (response?.alive) return true
    } catch {
      // Content script not ready yet
    }
    if (i < retries - 1) await sleep(interval)
  }
  return false
}

async function processNext() {
  if (!isRunning) return

  currentIndex++
  if (currentIndex >= queue.length) {
    isRunning = false
    currentIndex = -1
    broadcastState()
    await persistState()
    return
  }

  const item = queue[currentIndex]
  item.status = 'processing'
  item.progress = 'Loading page...'
  broadcastState()
  await persistState()

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
    await sleep(2000)

    // Ping content script to confirm it's loaded before extracting
    const alive = await pingContentScript(activeTabId)
    if (!alive) {
      throw new Error('Content script did not respond after page load. Try reloading the extension.')
    }

    item.progress = 'Extracting Q&A...'
    broadcastState()
    await persistState()

    // ── Step 2: Send extraction command to content script ──
    // Content script will click questions until exhausted
    // Wrap in timeout to prevent hanging forever
    const response = await Promise.race([
      chrome.tabs.sendMessage(activeTabId, {
        type: 'EXTRACT_RUFUS_QA',
        settings: {
          maxQuestions: settings.maxQuestions,
          delayBetweenClicks: settings.delayBetweenClicks,
          selectors: settings.selectors,
        },
      }),
      sleep(EXTRACTION_TIMEOUT_MS).then(() => ({
        success: false,
        error: `Extraction timed out after ${EXTRACTION_TIMEOUT_MS / 60000} minutes`,
      })),
    ])

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
      await persistState()
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
  await persistState()

  // Delay before next product using chrome.alarms (survives worker termination)
  if (isRunning && currentIndex < queue.length - 1) {
    const nextItem = queue[currentIndex + 1]
    if (nextItem) {
      nextItem.progress = `Waiting ${Math.round(settings.delayBetweenProducts / 1000)}s...`
      broadcastState()
      await persistState()
    }
    // Use chrome.alarms for the delay — survives service worker kill
    const delayMinutes = Math.max(settings.delayBetweenProducts / 60000, 0.1)
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes })
    // Don't call processNext() directly — alarm handler will do it
    return
  }

  // No more items or stopped — finalize
  if (!isRunning || currentIndex >= queue.length - 1) {
    isRunning = false
    currentIndex = -1
    broadcastState()
    await persistState()
  }
}

// Resume processing when the between-product alarm fires
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME && isRunning) {
    processNext()
  }
})

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
      persistState()
      sendResponse({ success: true, added, queueLength: queue.length })
      return true
    }

    case 'START_QUEUE':
      if (!isRunning && queue.some((q) => q.status === 'pending')) {
        isRunning = true
        currentIndex = queue.findIndex((q) => q.status === 'pending') - 1
        broadcastState()
        persistState()
        processNext()
      }
      sendResponse({ success: true })
      return true

    case 'STOP_QUEUE':
      isRunning = false
      // Cancel any pending between-product alarm
      chrome.alarms.clear(ALARM_NAME)
      // Mark the currently processing item as stopped
      {
        const processing = queue.find((q) => q.status === 'processing')
        if (processing) {
          processing.status = 'pending' // Reset to pending so it can be retried
          processing.progress = null
        }
      }
      // Send abort to content script so it stops clicking
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { type: 'ABORT_EXTRACTION' }).catch(() => {})
      }
      broadcastState()
      persistState()
      sendResponse({ success: true })
      return true

    case 'CLEAR_QUEUE':
      queue = []
      isRunning = false
      currentIndex = -1
      chrome.alarms.clear(ALARM_NAME)
      broadcastState()
      persistState()
      sendResponse({ success: true })
      return true

    case 'CLEAR_COMPLETED':
      queue = queue.filter((q) => q.status !== 'done' && q.status !== 'error')
      broadcastState()
      persistState()
      sendResponse({ success: true })
      return true

    case 'REMOVE_FROM_QUEUE': {
      queue = queue.filter((q) => !(q.asin === message.data.asin && q.marketplace === message.data.marketplace))
      broadcastState()
      persistState()
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
      persistState()
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
    persistState()
  }
})
