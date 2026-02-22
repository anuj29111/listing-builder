/**
 * Rufus Q&A Extractor — Popup Script
 *
 * Manages the popup UI: adding ASINs, controlling the queue, displaying progress.
 */

// ─── Elements ────────────────────────────────────────────────────
const marketplace = document.getElementById('marketplace')
const questionCount = document.getElementById('questionCount')
const asinInput = document.getElementById('asinInput')
const addBtn = document.getElementById('addBtn')
const startBtn = document.getElementById('startBtn')
const stopBtn = document.getElementById('stopBtn')
const clearBtn = document.getElementById('clearBtn')
const exportBtn = document.getElementById('exportBtn')
const statusBar = document.getElementById('statusBar')
const statusText = document.getElementById('statusText')
const progressText = document.getElementById('progressText')
const queueList = document.getElementById('queueList')
const queueCount = document.getElementById('queueCount')
const settingsBtn = document.getElementById('settingsBtn')

// ─── Load saved preferences ─────────────────────────────────────
chrome.storage.sync.get(['lastMarketplace', 'lastQuestionCount'], (result) => {
  if (result.lastMarketplace) marketplace.value = result.lastMarketplace
  if (result.lastQuestionCount) questionCount.value = result.lastQuestionCount
})

// ─── State Rendering ─────────────────────────────────────────────

function renderQueue(state) {
  const { queue, isRunning, currentIndex } = state
  queueCount.textContent = `(${queue.length})`

  // Update controls
  startBtn.disabled = isRunning || !queue.some((q) => q.status === 'pending')
  stopBtn.disabled = !isRunning

  // Status bar
  if (isRunning) {
    statusBar.classList.remove('hidden')
    statusBar.classList.add('running')
    const done = queue.filter((q) => q.status === 'done').length
    const errors = queue.filter((q) => q.status === 'error').length
    statusText.textContent = `Processing ASIN ${done + errors + 1} of ${queue.length}...`
    progressText.textContent = `${done} done, ${errors} errors`
  } else if (queue.length > 0) {
    statusBar.classList.remove('hidden', 'running')
    const done = queue.filter((q) => q.status === 'done').length
    const errors = queue.filter((q) => q.status === 'error').length
    const totalQA = queue.reduce((sum, q) => sum + (q.questions?.length || 0), 0)
    statusText.textContent = done > 0 ? `Complete: ${totalQA} Q&A pairs extracted` : 'Ready'
    progressText.textContent = `${done} done, ${errors} errors`
  } else {
    statusBar.classList.add('hidden')
  }

  // Render queue items
  queueList.innerHTML = ''
  for (const item of queue) {
    const div = document.createElement('div')
    div.className = 'queue-item'

    const asinSpan = document.createElement('span')
    asinSpan.className = 'asin'
    asinSpan.textContent = item.asin

    const badge = document.createElement('span')
    badge.className = `badge badge-${item.status}`
    badge.textContent = item.status === 'processing' ? 'running' : item.status

    div.appendChild(asinSpan)

    if (item.status === 'done' && item.questions?.length) {
      const qaSpan = document.createElement('span')
      qaSpan.className = 'qa-count'
      qaSpan.textContent = `${item.questions.length} Q&A`
      div.appendChild(qaSpan)
    }

    if (item.status === 'error' && item.error) {
      const errSpan = document.createElement('span')
      errSpan.className = 'qa-count'
      errSpan.style.color = '#dc2626'
      errSpan.textContent = item.error.substring(0, 30)
      errSpan.title = item.error
      div.appendChild(errSpan)
    }

    div.appendChild(badge)

    if (item.status === 'pending') {
      const removeBtn = document.createElement('button')
      removeBtn.className = 'remove-btn'
      removeBtn.textContent = '\u00d7'
      removeBtn.title = 'Remove'
      removeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'REMOVE_FROM_QUEUE', data: { asin: item.asin } })
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

  // Save preferences
  chrome.storage.sync.set({
    lastMarketplace: marketplace.value,
    lastQuestionCount: parseInt(questionCount.value, 10),
  })

  // Update question count in settings
  chrome.storage.sync.get('settings', (result) => {
    const settings = result.settings || {}
    settings.questionCount = parseInt(questionCount.value, 10)
    chrome.storage.sync.set({ settings })
  })

  chrome.runtime.sendMessage(
    { type: 'ADD_TO_QUEUE', data: { asins, marketplace: marketplace.value } },
    (response) => {
      if (response?.success) {
        asinInput.value = ''
        // Refresh state
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

clearBtn.addEventListener('click', () => {
  if (confirm('Clear all items from the queue?')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' })
  }
})

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_RESULTS' }, (response) => {
    if (!response?.data?.length) {
      alert('No completed results to export.')
      return
    }

    // Build CSV
    const rows = [['ASIN', 'Question', 'Answer']]
    for (const item of response.data) {
      for (const qa of item.questions) {
        rows.push([
          item.asin,
          `"${(qa.question || '').replace(/"/g, '""')}"`,
          `"${(qa.answer || '').replace(/"/g, '""')}"`,
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

// Allow Enter key in textarea to not submit
asinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.ctrlKey) {
    e.preventDefault()
    addBtn.click()
  }
})
