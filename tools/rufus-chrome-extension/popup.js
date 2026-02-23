/**
 * Rufus Q&A Extractor — Popup Script
 *
 * Manages the popup UI: adding ASINs, controlling the queue, displaying progress.
 * Products run one at a time — no parallel extraction.
 */

// ─── Elements ────────────────────────────────────────────────────
const marketplace = document.getElementById('marketplace')
const asinInput = document.getElementById('asinInput')
const addBtn = document.getElementById('addBtn')
const startBtn = document.getElementById('startBtn')
const stopBtn = document.getElementById('stopBtn')
const retryBtn = document.getElementById('retryBtn')
const clearBtn = document.getElementById('clearBtn')
const exportBtn = document.getElementById('exportBtn')
const statusBar = document.getElementById('statusBar')
const statusText = document.getElementById('statusText')
const progressText = document.getElementById('progressText')
const loginWarning = document.getElementById('loginWarning')
const queueList = document.getElementById('queueList')
const queueCount = document.getElementById('queueCount')
const settingsBtn = document.getElementById('settingsBtn')
const maxQuestionsSelect = document.getElementById('maxQuestionsSelect')
const queueModeToggle = document.getElementById('queueModeToggle')
const queueModeStatus = document.getElementById('queueModeStatus')

// ─── Load saved preferences ─────────────────────────────────────
chrome.storage.sync.get(['lastMarketplace', 'settings'], (result) => {
  if (result.lastMarketplace) marketplace.value = result.lastMarketplace
  // Restore max questions from settings (default 50)
  const saved = result.settings?.maxQuestions
  if (saved && maxQuestionsSelect.querySelector(`option[value="${saved}"]`)) {
    maxQuestionsSelect.value = saved
  }
})

// Save max questions when changed (updates the shared settings object)
maxQuestionsSelect.addEventListener('change', () => {
  const val = parseInt(maxQuestionsSelect.value, 10)
  chrome.storage.sync.get('settings', (result) => {
    const settings = result.settings || {}
    settings.maxQuestions = val
    chrome.storage.sync.set({ settings })
  })
})

// ─── State Rendering ─────────────────────────────────────────────

function renderQueue(state) {
  const { queue, isRunning, queueMode: qm, queueModeProcessing: qmp } = state
  queueCount.textContent = `(${queue.length})`

  // Update queue mode toggle
  if (queueModeToggle) {
    queueModeToggle.checked = !!qm
    if (queueModeStatus) {
      if (qmp) {
        queueModeStatus.textContent = 'Processing...'
        queueModeStatus.className = 'queue-mode-status active'
      } else if (qm) {
        queueModeStatus.textContent = 'Polling'
        queueModeStatus.className = 'queue-mode-status active'
      } else {
        queueModeStatus.textContent = 'Off'
        queueModeStatus.className = 'queue-mode-status'
      }
    }
  }

  const hasPending = queue.some((q) => q.status === 'pending')
  const hasFailed = queue.some((q) => q.status === 'error')
  const hasCompleted = queue.some((q) => q.status === 'done' || q.status === 'error')

  // Update controls
  startBtn.disabled = isRunning || !hasPending
  stopBtn.disabled = !isRunning
  retryBtn.disabled = isRunning || !hasFailed
  exportBtn.disabled = !queue.some((q) => (q.status === 'done' || q.status === 'error') && q.questions?.length)
  clearBtn.disabled = isRunning || !hasCompleted

  // Login warning
  const loginNeeded = queue.some((q) => q.status === 'error' && q.error?.includes('Not logged into Amazon'))
  loginWarning.classList.toggle('hidden', !loginNeeded)

  // Status bar
  if (isRunning) {
    statusBar.classList.remove('hidden')
    statusBar.classList.add('running')
    const done = queue.filter((q) => q.status === 'done').length
    const errors = queue.filter((q) => q.status === 'error').length
    const total = queue.length
    statusText.textContent = `Processing ${done + errors + 1} of ${total} (one at a time)...`
    progressText.textContent = `${done} done, ${errors} err`
  } else if (queue.length > 0) {
    statusBar.classList.remove('hidden', 'running')
    const done = queue.filter((q) => q.status === 'done').length
    const errors = queue.filter((q) => q.status === 'error').length
    const totalQA = queue.reduce((sum, q) => sum + (q.questions?.length || 0), 0)
    if (done > 0 || totalQA > 0) {
      statusText.textContent = `Done: ${totalQA} unique Q&A pairs`
    } else {
      statusText.textContent = 'Ready'
    }
    progressText.textContent = `${done} done, ${errors} err`
  } else {
    statusBar.classList.add('hidden')
  }

  // Render queue items
  queueList.innerHTML = ''
  for (const item of queue) {
    const div = document.createElement('div')
    div.className = 'queue-item'

    // ASIN
    const asinSpan = document.createElement('span')
    asinSpan.className = 'asin'
    asinSpan.textContent = item.asin
    div.appendChild(asinSpan)

    // Progress text (while processing)
    if (item.progress) {
      const progSpan = document.createElement('span')
      progSpan.className = 'progress-text'
      progSpan.textContent = item.progress
      progSpan.title = item.progress
      div.appendChild(progSpan)
    }

    // Q&A count (when done, or errored with partial results)
    if ((item.status === 'done' || item.status === 'error') && item.questions?.length) {
      const qaSpan = document.createElement('span')
      qaSpan.className = 'qa-count'
      qaSpan.textContent = `${item.questions.length} Q&A`
      if (item.exhausted) qaSpan.title = 'All questions exhausted'
      if (item.stoppedOffTopic) qaSpan.title = 'Stopped: off-topic questions'
      if (item.status === 'error') qaSpan.title = 'Partial results (extraction had error)'
      div.appendChild(qaSpan)

      // API sent indicator
      if (item.apiSent) {
        const apiSpan = document.createElement('span')
        apiSpan.className = 'api-badge'
        apiSpan.textContent = item.apiNewCount > 0 ? `+${item.apiNewCount} new` : 'sent'
        apiSpan.title = 'Sent to Listing Builder'
        div.appendChild(apiSpan)
      }
    }

    // Error text
    if (item.status === 'error' && item.error) {
      const errSpan = document.createElement('span')
      errSpan.className = 'progress-text'
      errSpan.style.color = '#dc2626'
      errSpan.textContent = item.error.substring(0, 50)
      errSpan.title = item.error
      div.appendChild(errSpan)
    }

    // Status badge
    const badge = document.createElement('span')
    badge.className = `badge badge-${item.status}`
    const badgeLabels = {
      pending: 'pending',
      processing: 'running',
      done: item.exhausted ? 'exhausted' : 'done',
      error: 'error',
    }
    badge.textContent = badgeLabels[item.status] || item.status
    div.appendChild(badge)

    // Remove button (only for pending items)
    if (item.status === 'pending') {
      const removeBtn = document.createElement('button')
      removeBtn.className = 'remove-btn'
      removeBtn.textContent = '\u00d7'
      removeBtn.title = 'Remove'
      removeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'REMOVE_FROM_QUEUE',
          data: { asin: item.asin, marketplace: item.marketplace },
        })
      })
      div.appendChild(removeBtn)
    }

    queueList.appendChild(div)
  }
}

// ─── Initial state load ──────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, renderQueue)

// ─── Listen for state updates ────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    renderQueue(message.data)
  }
})

// ─── Event Handlers ──────────────────────────────────────────────

addBtn.addEventListener('click', () => {
  const raw = asinInput.value.trim()
  if (!raw) return

  const asins = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (asins.length === 0) return

  // Save marketplace preference
  chrome.storage.sync.set({ lastMarketplace: marketplace.value })

  chrome.runtime.sendMessage(
    { type: 'ADD_TO_QUEUE', data: { asins, marketplace: marketplace.value } },
    (response) => {
      if (response?.success) {
        asinInput.value = ''
        chrome.runtime.sendMessage({ type: 'GET_STATE' }, renderQueue)
      }
    }
  )
})

startBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'START_QUEUE' })
})

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_QUEUE' })
})

retryBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RETRY_FAILED' })
})

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_COMPLETED' })
})

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_RESULTS' }, (response) => {
    if (!response?.data?.length) {
      alert('No completed results to export.')
      return
    }

    // Build CSV with proper escaping (handles newlines, commas, quotes)
    function csvEscape(val) {
      const str = String(val || '')
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = [['ASIN', 'Marketplace', 'Question', 'Answer']]
    for (const item of response.data) {
      for (const qa of item.questions) {
        rows.push([
          csvEscape(item.asin),
          csvEscape(item.marketplace),
          csvEscape(qa.question),
          csvEscape(qa.answer),
        ])
      }
    }

    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `rufus-qa-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  })
})

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

// Ctrl+Enter in textarea to add
asinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    addBtn.click()
  }
})

// Queue mode toggle
queueModeToggle.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_QUEUE_MODE' })
})
