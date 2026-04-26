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
// ⚠ Keep selectors in sync with DEFAULTS in options.js.
const DEFAULT_SETTINGS = {
  apiUrl: 'https://listing-builder-production.up.railway.app',
  apiKey: '',
  maxQuestions: 50, // Max questions per product (user-configurable in Settings)
  delayBetweenClicks: 3000,
  delayBetweenProducts: 5000,
  selectors: {
    rufusButton: '#nav-rufus-disco, [aria-label="Open Rufus panel"], [aria-label*="Rufus"], [data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [data-testid*="rufus"]',
    questionChip: 'button.rufus-pill, .rufus-related-question-pill, li.rufus-carousel-card button',
    chatContainer: '#nav-flyout-rufus',
    // Each Q&A lives inside a .rufus-papyrus-turn container (ids: interaction0, interaction1, …).
    // Active turn is marked with .rufus-papyrus-active-turn during streaming.
    turnContainer: '.rufus-papyrus-turn',
    activeTurn: '.rufus-papyrus-active-turn',
    questionBubble: '.rufus-customer-text',
    // Each turn can have MULTIPLE markdownSection divs — concatenate them as the answer.
    answerBubble: 'div[data-csa-c-group-id^="markdownSection"]',
    loadingIndicator: '.rufus-loading-message-template, .rufus-loading-messages, .rufus-loading-title',
    // Custom-question mode: where to type and how to submit.
    rufusInput: '#rufus-text-area, #nav-flyout-rufus textarea[placeholder*="Ask Rufus" i]',
    rufusSubmit: '#rufus-submit-button, #nav-flyout-rufus button[aria-label="Submit"]',
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

  // Telemetry tracking across the whole per-product attempt
  const startedAtMs = Date.now()
  let errorPhase = null
  let errorStack = null
  let finalResponse = null
  let loginRequired = false
  let apiSendError = null

  try {
    // ── Step 1: Navigate to product page ──
    // Close old tab entirely and open a fresh one. A new tab gets a completely
    // clean browsing context — no residual localStorage, sessionStorage,
    // IndexedDB, or in-memory Rufus widget state from the previous product.
    errorPhase = 'navigate'
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
    errorPhase = 'content_script'
    const alive = await pingContentScript(activeTabId)
    if (!alive) {
      throw new Error('Content script did not respond after page load. Try reloading the extension.')
    }

    item.progress = 'Extracting Q&A...'
    broadcastState()
    await persistState()

    // ── Step 2: Run extraction ──
    // Custom-questions mode: type Amy-style prompts into Rufus, capture each answer.
    // Otherwise: standard chip-clicking refresh cycle.
    errorPhase = 'extract'
    if (item.customQuestions && item.customQuestions.length > 0) {
      finalResponse = await extractCustomQuestions(activeTabId, settings, item)
    } else {
      finalResponse = await extractWithRefreshCycle(activeTabId, productUrl, settings, item)
    }

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
        errorPhase = 'api_send'
        try {
          const apiResult = await sendToPlatform(item, settings)
          item.apiSent = true
          item.apiNewCount = apiResult.new_questions_added || 0
          item.progress = null
        } catch (apiErr) {
          item.apiError = apiErr.message
          item.progress = null
          apiSendError = apiErr.message
        }
      }
      errorPhase = null
    } else if (finalResponse && finalResponse.loginRequired) {
      // Amazon login required — stop the entire queue
      loginRequired = true
      errorPhase = 'login'
      item.status = 'error'
      item.error = finalResponse.error
      isRunning = false
    } else {
      item.status = 'error'
      item.error = finalResponse?.error || 'Extraction failed'
    }
  } catch (err) {
    item.status = 'error'
    item.error = err.message
    errorStack = err.stack?.slice(0, 10000) || null
  }

  // ── Step 4: ALWAYS ship telemetry (success or failure) so we can debug from the DB. ──
  // Fire-and-forget; swallow all errors.
  try {
    let domSnapshot = null
    const succeeded = !!(finalResponse?.success && (finalResponse.questions?.length || 0) > 0)
    // Capture DOM only on failures (keeps DB size sane)
    if (!succeeded && activeTabId) {
      domSnapshot = await captureDomSnapshot(activeTabId)
    }
    let status = 'success'
    if (loginRequired) status = 'login_required'
    else if (apiSendError) status = 'partial'
    else if (item.status === 'error') status = 'failed'
    else if (!succeeded) status = 'failed'
    else if (finalResponse?.stoppedOffTopic) status = 'partial'
    await sendTelemetry(settings, {
      asin: item.asin,
      marketplace: item.marketplace,
      status,
      questions_found: finalResponse?.questions?.length || 0,
      batches_run: finalResponse?.telemetry?.batches?.length || 0,
      seeds_explored: finalResponse?.seedsExplored || 0,
      seeds_total: finalResponse?.seedsTotal || 0,
      duration_ms: Date.now() - startedAtMs,
      error_message: item.error || apiSendError || null,
      error_phase: errorPhase,
      error_stack: errorStack,
      telemetry: {
        ...(finalResponse?.telemetry || {}),
        api_send_error: apiSendError || undefined,
        dom_snapshot_meta: domSnapshot
          ? {
              found: domSnapshot.found,
              url: domSnapshot.url,
              containerId: domSnapshot.containerId,
              containerClasses: domSnapshot.containerClasses,
              htmlLength: domSnapshot.htmlLength,
              bodyClasses: domSnapshot.bodyClasses,
            }
          : null,
      },
      dom_snapshot: domSnapshot?.html || null,
      amazon_logged_in: finalResponse?.loginRequired ? false : null,
    })
  } catch (telErr) {
    console.warn('[Telemetry] failed to send:', telErr?.message || telErr)
  }

  // Early-return for login required — user must intervene before any more ASINs
  if (loginRequired) {
    broadcastState()
    await persistState()
    return
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

    const {
      item_id,
      asin,
      marketplace,
      max_questions,
      loop_phase,
      custom_questions,
    } = data.item

    queueModeProcessing = true
    broadcastState()
    await persistState()

    // Process this ASIN using the extraction flow.
    // If custom_questions present (Pass 1 / Pass 2 of Amy loop), use Manual mode.
    // Otherwise, use auto-chips mode.
    await processQueueItem(
      item_id,
      asin,
      marketplace,
      max_questions || 50,
      settings,
      { loopPhase: loop_phase, customQuestions: custom_questions }
    )

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
async function processQueueItem(itemId, asin, marketplace, maxQuestions, settings, options = {}) {
  const { loopPhase = null, customQuestions = null } = options
  const useCustomMode = Array.isArray(customQuestions) && customQuestions.length > 0
  const baseUrl = MARKETPLACE_URLS[marketplace] || 'https://www.amazon.com'
  const productUrl = `${baseUrl}/dp/${asin}`

  // Telemetry tracking for the whole attempt
  const startedAtMs = Date.now()
  let errorPhase = null
  let errorStack = null
  let outerError = null
  let result = null
  let apiSendError = null

  try {
    // Navigate: close old tab, open fresh one
    errorPhase = 'navigate'
    if (activeTabId) {
      try { await chrome.tabs.remove(activeTabId) } catch { /* already closed */ }
      activeTabId = null
    }
    await sleep(300)
    const tab = await chrome.tabs.create({ url: productUrl, active: true })
    activeTabId = tab.id

    await waitForTabLoad(activeTabId)
    await sleep(2000)

    errorPhase = 'content_script'
    const alive = await pingContentScript(activeTabId)
    if (!alive) {
      throw new Error('Content script did not respond')
    }

    // Extract Q&A — branch based on loop phase:
    //   - Custom mode (Pass 1 / Pass 2 / single Manual run): type each question
    //     into Rufus directly, single chat session, context builds across Qs.
    //   - Auto-chips mode (default queue): click Rufus's suggested chips and
    //     refresh the page between batches.
    errorPhase = 'extract'
    settings.maxQuestions = maxQuestions
    if (useCustomMode) {
      const syntheticItem = {
        asin,
        marketplace,
        progress: null,
        customQuestions,
      }
      result = await extractCustomQuestions(activeTabId, settings, syntheticItem)
    } else {
      const dummyItem = { progress: null }
      result = await extractWithRefreshCycle(activeTabId, productUrl, settings, dummyItem)
    }

    const questions = result?.questions || []
    const hasQuestions = questions.length > 0

    // Send Q&A to platform (same as manual mode)
    if (settings.apiKey && hasQuestions) {
      errorPhase = 'api_send'
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
        apiSendError = apiErr.message
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
    errorPhase = null
  } catch (err) {
    console.error(`[Queue Mode] Error processing ${asin}:`, err.message)
    outerError = err.message
    errorStack = err.stack?.slice(0, 10000) || null
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

  // ── Ship extraction telemetry (always, success or fail) ──
  try {
    const questionsCount = result?.questions?.length || 0
    const succeeded = !!(result?.success && questionsCount > 0)
    let domSnapshot = null
    if (!succeeded && activeTabId) {
      domSnapshot = await captureDomSnapshot(activeTabId)
    }
    let status = 'success'
    if (result?.loginRequired) status = 'login_required'
    else if (apiSendError) status = 'partial'
    else if (!succeeded) status = 'failed'
    else if (result?.stoppedOffTopic) status = 'partial'
    await sendTelemetry(settings, {
      asin,
      marketplace,
      job_item_id: itemId,
      status,
      questions_found: questionsCount,
      batches_run: result?.telemetry?.batches?.length || 0,
      seeds_explored: result?.seedsExplored || 0,
      seeds_total: result?.seedsTotal || 0,
      duration_ms: Date.now() - startedAtMs,
      error_message: outerError || apiSendError || result?.error || null,
      error_phase: errorPhase,
      error_stack: errorStack,
      telemetry: {
        ...(result?.telemetry || {}),
        api_send_error: apiSendError || undefined,
        queue_mode: true,
        loop_phase: loopPhase || null,
        custom_mode: useCustomMode,
        custom_questions_count: useCustomMode ? customQuestions.length : 0,
        dom_snapshot_meta: domSnapshot
          ? {
              found: domSnapshot.found,
              url: domSnapshot.url,
              containerId: domSnapshot.containerId,
              containerClasses: domSnapshot.containerClasses,
              htmlLength: domSnapshot.htmlLength,
              bodyClasses: domSnapshot.bodyClasses,
            }
          : null,
      },
      dom_snapshot: domSnapshot?.html || null,
      amazon_logged_in: result?.loginRequired ? false : null,
    })
  } catch (telErr) {
    console.warn('[Telemetry] queue mode send failed:', telErr?.message || telErr)
  }

  // Delay before next poll
  await sleep(settings.delayBetweenProducts || 5000)
}

/**
 * Custom-question mode: type each user-supplied question into Rufus and
 * capture each answer. Single Rufus session, no page refresh — context
 * builds across the conversation, like Amy Wees' Rufus loop.
 */
async function extractCustomQuestions(tabId, settings, item) {
  const startTime = Date.now()
  const questions = item.customQuestions || []
  const BATCH_TIMEOUT_MS = Math.max(180000, questions.length * 45000) // 45s per Q minimum

  item.progress = `Asking ${questions.length} custom question${questions.length === 1 ? '' : 's'}...`
  broadcastState()

  let timedOut = false
  const result = await Promise.race([
    chrome.tabs.sendMessage(tabId, {
      type: 'ASK_CUSTOM_QUESTIONS',
      settings: {
        delayBetweenClicks: settings.delayBetweenClicks,
        selectors: settings.selectors,
      },
      questions,
    }),
    sleep(BATCH_TIMEOUT_MS).then(() => { timedOut = true; return null }),
  ])

  if (timedOut || !result) {
    try {
      const partial = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_QA_ONLY', settings: { selectors: settings.selectors } })
      const pairs = partial?.questions || []
      return {
        success: pairs.length > 0,
        error: 'Custom-question extraction timed out',
        questions: pairs,
        clickedCount: pairs.length,
        telemetry: { mode: 'custom', timed_out: true, asked_count: questions.length, duration_ms: Date.now() - startTime },
      }
    } catch {
      return { success: false, error: 'Custom-question extraction timed out', questions: [], telemetry: { mode: 'custom', timed_out: true } }
    }
  }

  if (result.loginRequired) {
    return {
      success: false,
      loginRequired: true,
      error: result.error,
      questions: result.pairs || [],
      telemetry: { mode: 'custom', login_required: true },
    }
  }

  return {
    success: (result.pairs?.length || 0) > 0,
    error: result.error || null,
    questions: result.pairs || [],
    clickedCount: result.askedQuestions?.length || 0,
    exhausted: true,
    telemetry: {
      mode: 'custom',
      asked_count: questions.length,
      captured_count: result.pairs?.length || 0,
      duration_ms: Date.now() - startTime,
    },
  }
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
  const completedQuestions = []    // ALL questions clicked (for counting + off-topic)
  const topicKeywords = []
  const accumulatedPairs = []
  let initialPills = []            // Golden set: initial pills from first batch
  const exploredSeeds = []         // Initial pills already explored as batch seeds
  let batchNumber = 0
  let consecutiveEmptyBatches = 0
  let consecutiveOffTopic = 0
  const maxEmptyBatches = 2
  const maxQuestions = settings.maxQuestions || 50
  const BATCH_TIMEOUT_MS = 180000 // 3 minutes per batch

  // Telemetry we'll ship to the backend once extraction finishes (success OR fail).
  // Inspected later in lb_rufus_extraction_logs to debug Amazon DOM changes.
  const telemetry = {
    batches: [],
    initialPillsSample: [],
    warnings: [],
  }

  while (accumulatedPairs.length < maxQuestions) {
    // Overall time limit
    if (Date.now() - startTime > EXTRACTION_TIMEOUT_MS) {
      console.log(`[Rufus] Overall extraction timeout after ${EXTRACTION_TIMEOUT_MS / 60000} minutes`)
      break
    }

    // Queue was stopped
    if (!isRunning && !queueModeProcessing) break

    batchNumber++
    console.log(`[Rufus] ── Batch ${batchNumber} (${accumulatedPairs.length} pairs, ${exploredSeeds.length}/${initialPills.length} seeds explored) ──`)

    // ── After first batch, do FULL PAGE REFRESH ──
    if (batchNumber > 1) {
      item.progress = `Batch ${batchNumber}: Refreshing page...`
      broadcastState()

      await chrome.tabs.update(tabId, { url: 'about:blank' })
      await sleep(1500)

      await chrome.tabs.update(tabId, { url: productUrl })
      await waitForTabLoad(tabId)
      await sleep(2500)

      const alive = await pingContentScript(tabId)
      if (!alive) {
        console.log('[Rufus] Content script not responding after page refresh')
        break
      }
    }

    item.progress = `Batch ${batchNumber}: Clicking questions...`
    broadcastState()

    // ── Send batch command to content script ──
    // Pass skippedSeeds so content.js knows which initial pills to skip
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
        skippedSeeds: exploredSeeds,  // Initial pills to skip (already explored)
      }),
      sleep(BATCH_TIMEOUT_MS).then(() => {
        batchTimedOut = true
        return null
      }),
    ])

    // Handle batch timeout
    if (batchTimedOut || !result) {
      console.log(`[Rufus] Batch ${batchNumber} timed out`)
      telemetry.batches.push({ n: batchNumber, timedOut: true })
      telemetry.warnings.push(`batch ${batchNumber} timed out after ${BATCH_TIMEOUT_MS / 1000}s`)
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
      telemetry.batches.push({ n: batchNumber, loginRequired: true })
      return {
        success: false,
        loginRequired: true,
        error: result.error,
        questions: accumulatedPairs,
        clickedCount: completedQuestions.length,
        telemetry,
        seedsExplored: exploredSeeds.length,
        seedsTotal: initialPills.length,
      }
    }

    // Error with no pairs from this batch
    if (result.error && (!result.pairs || result.pairs.length === 0)) {
      console.log(`[Rufus] Batch ${batchNumber} error: ${result.error}`)
      telemetry.batches.push({ n: batchNumber, error: result.error, pairs: 0 })
      if (accumulatedPairs.length === 0) {
        return {
          success: false,
          error: result.error,
          questions: [],
          clickedCount: completedQuestions.length,
          telemetry,
          seedsExplored: exploredSeeds.length,
          seedsTotal: initialPills.length,
        }
      }
      break
    }

    // ── Capture golden set from first batch ──
    if (batchNumber === 1 && result.freshPills?.length > 0) {
      initialPills = result.freshPills
      telemetry.initialPillsSample = initialPills.slice(0, 20) // First 20 as a sample
      console.log(`[Rufus] Golden set captured: ${initialPills.length} initial pills: ${initialPills.map((p) => p.substring(0, 30)).join(', ')}`)
    }

    // ── Verify reset on subsequent batches (≥60% overlap with golden set) ──
    let resetOverlapRatio = null
    if (batchNumber > 1 && initialPills.length > 0 && result.freshPills?.length > 0) {
      let overlap = 0
      for (const pill of result.freshPills) {
        if (initialPills.includes(pill)) overlap++
      }
      resetOverlapRatio = overlap / Math.max(result.freshPills.length, 1)
      console.log(`[Rufus] Reset verification: ${overlap}/${result.freshPills.length} pills match golden set (${(resetOverlapRatio * 100).toFixed(0)}%)`)
      if (resetOverlapRatio < 0.4) {
        console.log('[Rufus] WARNING: Low overlap — Rufus may not have fully reset')
        telemetry.warnings.push(`batch ${batchNumber} reset overlap ${(resetOverlapRatio * 100).toFixed(0)}% (<40%)`)
      }
    }

    // ── Track explored seeds (initial pills used as batch starters) ──
    if (result.clickedInitials?.length > 0) {
      for (const seed of result.clickedInitials) {
        if (!exploredSeeds.includes(seed)) {
          exploredSeeds.push(seed)
        }
      }
      console.log(`[Rufus] Seeds explored: ${exploredSeeds.length}/${initialPills.length}`)
    }

    // ── Accumulate pairs (de-duplicate across batches) ──
    // If no questions were clicked this batch, any pairs found are stale DOM leftovers
    // from Rufus's previous conversation history — don't count them as progress.
    const batchHadClicks = result.batchClicked?.length > 0
    let newPairs = 0
    if (result.pairs?.length > 0) {
      const existingKeys = new Set(
        accumulatedPairs.map((p) => `${p.question.toLowerCase().trim()}|||${p.answer.toLowerCase().trim()}`),
      )
      for (const pair of result.pairs) {
        const key = `${pair.question.toLowerCase().trim()}|||${pair.answer.toLowerCase().trim()}`
        if (!existingKeys.has(key)) {
          accumulatedPairs.push(pair)
          existingKeys.add(key)
          newPairs++
        }
      }
      if (newPairs > 0 && batchHadClicks) {
        consecutiveEmptyBatches = 0
      } else {
        consecutiveEmptyBatches++
      }
      console.log(`[Rufus] Batch ${batchNumber}: +${newPairs} NEW pairs (${result.pairs.length} total extracted, ${accumulatedPairs.length} accumulated)${!batchHadClicks ? ' [stale — no clicks]' : ''}`)
    } else {
      consecutiveEmptyBatches++
      console.log(`[Rufus] Batch ${batchNumber}: no pairs (empty batch ${consecutiveEmptyBatches}/${maxEmptyBatches})`)
    }

    // ── Record batch telemetry ──
    telemetry.batches.push({
      n: batchNumber,
      clicked: result.batchClicked?.length || 0,
      pairs_extracted: result.pairs?.length || 0,
      new_pairs: newPairs,
      fresh_pills: result.freshPills?.length || 0,
      harvested_pills: result.harvestedPills?.length || 0,
      clicked_initials: result.clickedInitials?.length || 0,
      reset_overlap_ratio: resetOverlapRatio,
      consecutive_empty: consecutiveEmptyBatches,
      selectors_hit: result.selectorsHit || null, // populated by content.js
      strategy_used: result.strategyUsed || null,  // turn-based / live-capture / etc.
      stopped_off_topic: !!result.stoppedOffTopic,
      no_more_questions: !!result.noMoreQuestions,
    })

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
    if (accumulatedPairs.length >= maxQuestions) {
      console.log(`[Rufus] Stopped: reached max questions (${maxQuestions})`)
      break
    }

    // Check if truly exhausted: all seeds explored AND no new follow-ups
    const allSeedsExplored = initialPills.length > 0 && exploredSeeds.length >= initialPills.length
    if (result.noMoreQuestions) {
      if (allSeedsExplored) {
        console.log('[Rufus] Stopped: all initial seeds explored and no new follow-ups')
        break
      }
      if (consecutiveEmptyBatches >= maxEmptyBatches) {
        console.log('[Rufus] Stopped: no new questions after multiple batches')
        break
      }
      // Still have unexplored seeds — refresh will show them as clickable
      console.log(`[Rufus] No new questions this batch, but ${initialPills.length - exploredSeeds.length} seeds unexplored — will refresh`)
    }
  }

  console.log(`[Rufus] Extraction complete: ${accumulatedPairs.length} pairs from ${completedQuestions.length} questions across ${batchNumber} batches (${exploredSeeds.length}/${initialPills.length} seeds explored)`)

  return {
    success: accumulatedPairs.length > 0,
    questions: accumulatedPairs,
    clickedCount: completedQuestions.length,
    exhausted: exploredSeeds.length >= initialPills.length && consecutiveEmptyBatches >= maxEmptyBatches,
    stoppedOffTopic: consecutiveOffTopic >= 5,
    telemetry,
    seedsExplored: exploredSeeds.length,
    seedsTotal: initialPills.length,
  }
}

/**
 * Send an extraction telemetry log to the backend.
 * Fire-and-forget: never throws, never blocks extraction. All errors swallowed.
 *
 * @param {Object} settings - Extension settings (for apiUrl + apiKey)
 * @param {Object} log - Telemetry payload (matches /api/rufus-qna/telemetry body)
 */
async function sendTelemetry(settings, log) {
  if (!settings?.apiUrl || !settings?.apiKey) return
  try {
    await fetch(`${settings.apiUrl}/api/rufus-qna/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        ...log,
        extension_version: chrome.runtime.getManifest().version,
        user_agent: navigator.userAgent,
      }),
    })
  } catch (err) {
    console.warn('[Telemetry] send failed:', err?.message || err)
  }
}

/**
 * Grab a trimmed Rufus DOM snapshot from the active tab. Called when extraction
 * fails — gives us a snapshot of what Amazon's DOM looked like when the
 * selectors broke. Truncated to ~300KB so it fits in the telemetry row.
 */
async function captureDomSnapshot(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const container =
          document.getElementById('nav-flyout-rufus') ||
          document.querySelector('[id*="rufus"], [class*="rufus-panel"]')
        if (!container) {
          return {
            found: false,
            url: location.href,
            bodyClasses: document.body?.className?.slice(0, 500) || '',
          }
        }
        const html = container.outerHTML || ''
        return {
          found: true,
          url: location.href,
          bodyClasses: document.body?.className?.slice(0, 500) || '',
          containerId: container.id,
          containerClasses: typeof container.className === 'string' ? container.className.slice(0, 500) : '',
          htmlLength: html.length,
          html: html.length > 300000 ? html.slice(0, 300000) + '\n<!-- truncated -->' : html,
        }
      },
    })
    return result || null
  } catch (err) {
    console.warn('[Telemetry] DOM snapshot failed:', err?.message || err)
    return null
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
      const { asins, marketplace, customQuestions } = message.data
      const customQs = Array.isArray(customQuestions)
        ? customQuestions.map((s) => String(s).trim()).filter(Boolean)
        : []
      let added = 0
      for (const asin of asins) {
        const cleaned = asin.trim().toUpperCase()
        if (/^[A-Z0-9]{10}$/.test(cleaned)) {
          if (!queue.some((q) => q.asin === cleaned && q.marketplace === marketplace)) {
            const item = { asin: cleaned, marketplace, status: 'pending', questions: [] }
            if (customQs.length > 0) item.customQuestions = customQs
            queue.push(item)
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
