/**
 * Rufus Q&A Extractor — Background Service Worker
 *
 * Manages the ASIN queue, orchestrates tab navigation and PAGE REFRESH
 * CYCLES, and handles communication between popup, content scripts, and API.
 *
 * KEY DESIGN DECISIONS:
 * - Sequential only — one product at a time (Rufus chat state would mix in parallel)
 * - Full page refresh between BATCHES to reset Rufus conversation context
 *   (close/reopen does NOT work — Rufus persists state server-side)
 * - Content script is a STATELESS BATCH WORKER — clicks up to 5 questions per page load
 * - Background accumulates Q&A across batches and manages refresh cycle
 * - De-duplication happens both client-side (content.js) and server-side (API)
 * - State persisted to chrome.storage.local to survive service worker restarts (MV3)
 * - Uses chrome.alarms for between-product delays (survives worker termination)
 */

// ─── State ───────────────────────────────────────────────────────
let queue = [] // Array of { asin, marketplace, status, questions, error, ... }
let isRunning = false
let currentIndex = -1
let activeTabId = null
let queueMode = false // Auto-poll backend queue for ASINs
let queueModeProcessing = false // Currently processing a backend queue item

// ─── Default Settings ────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  maxQuestions: 50, // Max questions per product (user-configurable in Settings)
  delayBetweenClicks: 3000,
  delayBetweenProducts: 5000,
  selectors: {
    rufusButton: '[data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [aria-label*="Rufus"], [data-testid*="rufus"]',
    questionChip: 'button.rufus-pill, .rufus-related-question-pill, span.rufus-color-pacific, li.rufus-carousel-card button',
    chatContainer: '#nav-flyout-rufus',
    questionBubble: '[data-section-class="CustomerText"], .rufus-customer-text, .dialog-customer',
    answerBubble: 'div[data-csa-c-group-id^="markdownSection"], [id^="section_groupId_text_template_"]',
    loadingIndicator: '.a-spinner, .rufus-loading',
  },
}

const EXTRACTION_TIMEOUT_MS = 600000 // 10 minutes per product
const ALARM_NAME = 'rufus-next-product'
const QUEUE_POLL_ALARM = 'rufus-queue-poll'
const QUEUE_POLL_INTERVAL_MINUTES = 0.25 // 15 seconds

async function getSettings() {
  // Settings (non-sensitive) from sync, API key from local
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get('apiKey'),
  ])

  const saved = syncResult.settings || {}

  // Auto-migrate selectors when extension version changes.
  // This keeps the user's API URL + API key intact while updating
  // selectors to the latest defaults (so they don't have to Reset Defaults).
  const currentVersion = chrome.runtime.getManifest().version
  if (saved.selectorsVersion !== currentVersion) {
    saved.selectors = DEFAULT_SETTINGS.selectors
    saved.selectorsVersion = currentVersion
    // Persist the migration so it only runs once
    chrome.storage.sync.set({ settings: { ...saved } })
    console.log(`[Rufus] Auto-migrated selectors to v${currentVersion} defaults`)
  }

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    apiKey: localResult.apiKey || saved.apiKey || '',
  }
}

// ─── State Persistence (MV3 service workers are ephemeral) ───────

async function persistState() {
  await chrome.storage.local.set({
    _rufusState: { queue, isRunning, currentIndex, activeTabId, queueMode, queueModeProcessing },
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
    queueMode = s.queueMode || false
    queueModeProcessing = s.queueModeProcessing || false

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

    // Resume queue mode polling if it was active
    if (queueMode && !queueModeProcessing) {
      startQueuePolling()
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
  const state = { queue, isRunning, currentIndex, queueMode, queueModeProcessing }
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
    // Close old tab entirely and open a fresh one. A new tab gets a completely
    // clean browsing context — no residual localStorage, sessionStorage,
    // IndexedDB, or in-memory Rufus widget state from the previous product.
    if (activeTabId) {
      try { await chrome.tabs.remove(activeTabId) } catch { /* already closed */ }
      activeTabId = null
    }
    await sleep(300)
    const tab = await chrome.tabs.create({ url: productUrl, active: true })
    activeTabId = tab.id

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

    // ── Step 2: Run extraction with page refresh between batches ──
    // Background orchestrates the refresh cycle. Content script handles one batch per page load.
    // This prevents Rufus topic drift by giving it a fresh conversation context each batch.
    const finalResponse = await extractWithRefreshCycle(activeTabId, productUrl, settings, item)

    if (finalResponse && (finalResponse.success || finalResponse.questions?.length > 0)) {
      const hasQuestions = finalResponse.questions?.length > 0
      item.status = hasQuestions ? 'done' : 'error'
      item.questions = finalResponse.questions || []
      item.questionCount = item.questions.length
      item.exhausted = finalResponse.exhausted
      item.stoppedOffTopic = finalResponse.stoppedOffTopic
      item.progress = null
      if (finalResponse.error) item.error = finalResponse.error // Partial results with warning

      // ── Step 3: Send to platform API ──
      if (settings.apiKey && hasQuestions) {
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
    } else if (finalResponse && finalResponse.loginRequired) {
      // Amazon login required — stop the entire queue
      item.status = 'error'
      item.error = finalResponse.error
      isRunning = false
      broadcastState()
      await persistState()
      return // Don't process more — user needs to log in
    } else {
      item.status = 'error'
      item.error = finalResponse?.error || 'Extraction failed'
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

// Resume processing when alarms fire
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME && isRunning) {
    processNext()
  }
  if (alarm.name === QUEUE_POLL_ALARM && queueMode && !queueModeProcessing && !isRunning) {
    pollBackendQueue()
  }
})

// ─── Backend Queue Polling ──────────────────────────────────────

function startQueuePolling() {
  chrome.alarms.create(QUEUE_POLL_ALARM, {
    delayInMinutes: QUEUE_POLL_INTERVAL_MINUTES,
    periodInMinutes: QUEUE_POLL_INTERVAL_MINUTES,
  })
}

function stopQueuePolling() {
  chrome.alarms.clear(QUEUE_POLL_ALARM)
}

/**
 * Poll the backend queue for the next pending ASIN.
 * If found, process it using the same extraction flow as manual queue.
 */
async function pollBackendQueue() {
  if (queueModeProcessing || isRunning) return

  const settings = await getSettings()
  if (!settings.apiUrl || !settings.apiKey) return

  try {
    const response = await fetch(`${settings.apiUrl}/api/rufus-qna/queue`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${settings.apiKey}` },
    })

    if (!response.ok) return

    const data = await response.json()
    if (!data.item) return // Queue empty

    const { item_id, asin, marketplace, max_questions } = data.item

    queueModeProcessing = true
    broadcastState()
    await persistState()

    // Process this ASIN using the extraction flow
    await processQueueItem(item_id, asin, marketplace, max_questions || 50, settings)

    queueModeProcessing = false
    broadcastState()
    await persistState()
  } catch (err) {
    console.error('[Queue Mode] Poll error:', err.message)
    queueModeProcessing = false
    await persistState()
  }
}

/**
 * Process a single ASIN from the backend queue.
 * Similar to processNext() but for backend-queued items.
 */
async function processQueueItem(itemId, asin, marketplace, maxQuestions, settings) {
  const baseUrl = MARKETPLACE_URLS[marketplace] || 'https://www.amazon.com'
  const productUrl = `${baseUrl}/dp/${asin}`

  try {
    // Navigate: close old tab, open fresh one
    if (activeTabId) {
      try { await chrome.tabs.remove(activeTabId) } catch { /* already closed */ }
      activeTabId = null
    }
    await sleep(300)
    const tab = await chrome.tabs.create({ url: productUrl, active: true })
    activeTabId = tab.id

    await waitForTabLoad(activeTabId)
    await sleep(2000)

    const alive = await pingContentScript(activeTabId)
    if (!alive) {
      throw new Error('Content script did not respond')
    }

    // Extract Q&A with page refresh cycle between batches
    const dummyItem = { progress: null } // Progress tracking for refresh cycle
    settings.maxQuestions = maxQuestions
    const result = await extractWithRefreshCycle(activeTabId, productUrl, settings, dummyItem)

    const questions = result?.questions || []
    const hasQuestions = questions.length > 0

    // Send Q&A to platform (same as manual mode)
    if (settings.apiKey && hasQuestions) {
      try {
        await fetch(`${settings.apiUrl}/api/rufus-qna`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({ asin, marketplace, questions }),
        })
      } catch (apiErr) {
        console.error('[Queue Mode] API send error:', apiErr.message)
      }
    }

    // Report completion to queue
    await fetch(`${settings.apiUrl}/api/rufus-qna/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        item_id: itemId,
        status: hasQuestions ? 'completed' : 'failed',
        questions_found: questions.length,
        error_message: hasQuestions ? null : (result?.error || 'No Q&A extracted'),
      }),
    })
  } catch (err) {
    console.error(`[Queue Mode] Error processing ${asin}:`, err.message)
    // Report failure to queue
    try {
      await fetch(`${settings.apiUrl}/api/rufus-qna/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          item_id: itemId,
          status: 'failed',
          questions_found: 0,
          error_message: err.message,
        }),
      })
    } catch { /* ignore report failure */ }
  }

  // Delay before next poll
  await sleep(settings.delayBetweenProducts || 5000)
}

/**
 * Run the full extraction for one product using PAGE REFRESH between batches.
 *
 * WHY PAGE REFRESH: Rufus stores conversation state SERVER-SIDE. Simply
 * closing/reopening the panel does NOT reset it — the next suggested questions
 * continue from where the conversation left off. A full page refresh
 * (about:blank → product URL) creates a completely new Rufus session.
 *
 * FLOW:
 * 1. Batch 1: Content script opens Rufus, clicks up to 5 questions, extracts Q&A
 * 2. Background refreshes page (about:blank → product URL)
 * 3. Batch 2: Content script opens fresh Rufus, clicks NEXT 5 unclicked questions
 * 4. Repeat until exhausted or max questions reached
 *
 * State is passed between batches via messages (completedQuestions, topicKeywords).
 * Content script is destroyed on each refresh — it's a stateless worker.
 *
 * @param {number} tabId - The tab to operate on
 * @param {string} productUrl - Product URL to navigate back to after refresh
 * @param {Object} settings - Extraction settings
 * @param {Object} item - Queue item for progress reporting (needs .progress)
 * @returns {Object} { success, questions, clickedCount, exhausted, stoppedOffTopic }
 */
async function extractWithRefreshCycle(tabId, productUrl, settings, item) {
  const startTime = Date.now()
  const completedQuestions = []
  const topicKeywords = []
  const accumulatedPairs = []
  let batchNumber = 0
  let consecutiveEmptyBatches = 0
  let consecutiveOffTopic = 0
  const maxEmptyBatches = 2
  const maxQuestions = settings.maxQuestions || 50
  const BATCH_TIMEOUT_MS = 180000 // 3 minutes per batch

  while (accumulatedPairs.length < maxQuestions) {
    // Overall time limit
    if (Date.now() - startTime > EXTRACTION_TIMEOUT_MS) {
      console.log(`[Rufus] Overall extraction timeout after ${EXTRACTION_TIMEOUT_MS / 60000} minutes`)
      break
    }

    // Queue was stopped
    if (!isRunning && !queueModeProcessing) break

    batchNumber++
    console.log(`[Rufus] ── Batch ${batchNumber} (${accumulatedPairs.length} pairs so far) ──`)

    // ── After first batch, do FULL PAGE REFRESH ──
    // This resets Rufus conversation state completely
    if (batchNumber > 1) {
      item.progress = `Batch ${batchNumber}: Refreshing page...`
      broadcastState()

      // Navigate away to clear ALL Rufus state
      await chrome.tabs.update(tabId, { url: 'about:blank' })
      await sleep(1500)

      // Navigate back to product page
      await chrome.tabs.update(tabId, { url: productUrl })
      await waitForTabLoad(tabId)
      await sleep(2500) // Extra time for dynamic content (Rufus widget, etc.)

      // Verify content script is loaded
      const alive = await pingContentScript(tabId)
      if (!alive) {
        console.log('[Rufus] Content script not responding after page refresh')
        break
      }
    }

    item.progress = `Batch ${batchNumber}: Clicking questions...`
    broadcastState()

    // ── Send batch command to content script ──
    let batchTimedOut = false
    const result = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'CLICK_BATCH_AND_EXTRACT',
        settings: {
          batchSize: 5,
          delayBetweenClicks: settings.delayBetweenClicks,
          selectors: settings.selectors,
          consecutiveOffTopic,
        },
        completedQuestions,
        topicKeywords,
      }),
      sleep(BATCH_TIMEOUT_MS).then(() => {
        batchTimedOut = true
        return null
      }),
    ])

    // Handle batch timeout — try to salvage whatever is in DOM
    if (batchTimedOut || !result) {
      console.log(`[Rufus] Batch ${batchNumber} timed out`)
      try {
        const partial = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_QA_ONLY', settings: { selectors: settings.selectors } }),
          sleep(10000).then(() => null),
        ])
        if (partial?.questions?.length > 0) {
          for (const pair of partial.questions) {
            accumulatedPairs.push(pair)
          }
        }
      } catch { /* ignore */ }
      break
    }

    // Login required — stop everything
    if (result.loginRequired) {
      return {
        success: false,
        loginRequired: true,
        error: result.error,
        questions: accumulatedPairs,
        clickedCount: completedQuestions.length,
      }
    }

    // Error with no pairs from this batch
    if (result.error && (!result.pairs || result.pairs.length === 0)) {
      console.log(`[Rufus] Batch ${batchNumber} error: ${result.error}`)
      // If we have accumulated pairs from previous batches, continue
      if (accumulatedPairs.length === 0) {
        return {
          success: false,
          error: result.error,
          questions: [],
          clickedCount: completedQuestions.length,
        }
      }
      break
    }

    // ── Accumulate pairs (de-duplicate across batches) ──
    if (result.pairs?.length > 0) {
      const existingKeys = new Set(
        accumulatedPairs.map((p) => `${p.question.toLowerCase().trim()}|||${p.answer.toLowerCase().trim()}`),
      )
      for (const pair of result.pairs) {
        const key = `${pair.question.toLowerCase().trim()}|||${pair.answer.toLowerCase().trim()}`
        if (!existingKeys.has(key)) {
          accumulatedPairs.push(pair)
          existingKeys.add(key)
        }
      }
      consecutiveEmptyBatches = 0
      console.log(`[Rufus] Batch ${batchNumber}: +${result.pairs.length} pairs (${accumulatedPairs.length} total)`)
    } else {
      consecutiveEmptyBatches++
      console.log(`[Rufus] Batch ${batchNumber}: no new pairs (empty batch ${consecutiveEmptyBatches}/${maxEmptyBatches})`)
    }

    // Update state for next batch
    if (result.clickedQuestions) {
      for (const q of result.clickedQuestions) {
        if (!completedQuestions.includes(q)) completedQuestions.push(q)
      }
    }
    if (result.topicKeywords) {
      topicKeywords.length = 0
      topicKeywords.push(...result.topicKeywords)
    }
    consecutiveOffTopic = result.consecutiveOffTopic || 0

    // ── Stop conditions ──
    if (result.stoppedOffTopic) {
      console.log('[Rufus] Stopped: too many consecutive off-topic questions')
      break
    }
    if (result.noMoreQuestions) {
      if (consecutiveEmptyBatches >= maxEmptyBatches) {
        console.log('[Rufus] Stopped: no new questions after multiple batches')
        break
      }
      // One more try after refresh (fresh Rufus might show different pills)
    }
    if (accumulatedPairs.length >= maxQuestions) {
      console.log(`[Rufus] Stopped: reached max questions (${maxQuestions})`)
      break
    }
  }

  console.log(`[Rufus] Extraction complete: ${accumulatedPairs.length} pairs from ${completedQuestions.length} questions across ${batchNumber} batches`)

  return {
    success: accumulatedPairs.length > 0,
    questions: accumulatedPairs,
    clickedCount: completedQuestions.length,
    exhausted: consecutiveEmptyBatches >= maxEmptyBatches,
    stoppedOffTopic: consecutiveOffTopic >= 5,
  }
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
      sendResponse({ queue, isRunning, currentIndex, queueMode, queueModeProcessing })
      return true

    case 'TOGGLE_QUEUE_MODE': {
      queueMode = !queueMode
      if (queueMode) {
        startQueuePolling()
      } else {
        stopQueuePolling()
        queueModeProcessing = false
      }
      broadcastState()
      persistState()
      sendResponse({ success: true, queueMode })
      return true
    }

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
      // Include both completed AND errored items that have partial Q&A results
      const completed = queue.filter((q) => (q.status === 'done' || q.status === 'error') && q.questions?.length)
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
