/**
 * Rufus Q&A Extractor — Options Script
 *
 * Settings (non-sensitive) stored in chrome.storage.sync.
 * API key stored in chrome.storage.local (not synced to Google servers).
 */

// ⚠ Keep in sync with DEFAULT_SETTINGS.selectors in background.js.
// Out-of-sync defaults make "Reset Defaults" silently break the extension.
const DEFAULTS = {
  apiUrl: 'https://listing-builder-production.up.railway.app',
  apiKey: '',
  maxQuestions: 50,
  delayBetweenClicks: 3000,
  delayBetweenProducts: 5000,
  selectors: {
    rufusButton:
      '#nav-rufus-disco, [aria-label="Open Rufus panel"], [aria-label*="Rufus"], [data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [data-testid*="rufus"]',
    questionChip:
      'button.rufus-pill, .rufus-related-question-pill, li.rufus-carousel-card button',
    chatContainer:
      '#nav-flyout-rufus',
    questionBubble:
      '.rufus-customer-text',
    answerBubble:
      'div[data-csa-c-group-id^="markdownSection"]',
    loadingIndicator:
      '.rufus-loading-message-template, .rufus-loading-messages, .rufus-loading-title',
    rufusInput:
      '#rufus-text-area, #nav-flyout-rufus textarea[placeholder*="Ask Rufus" i]',
    rufusSubmit:
      '#rufus-submit-button, #nav-flyout-rufus button[aria-label="Submit"]',
  },
}

// ─── Element refs ────────────────────────────────────────────────
const fields = {
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  maxQuestions: document.getElementById('maxQuestions'),
  delayClicks: document.getElementById('delayClicks'),
  delayProducts: document.getElementById('delayProducts'),
  selRufusBtn: document.getElementById('selRufusBtn'),
  selQuestionChip: document.getElementById('selQuestionChip'),
  selChatContainer: document.getElementById('selChatContainer'),
  selQuestionBubble: document.getElementById('selQuestionBubble'),
  selAnswerBubble: document.getElementById('selAnswerBubble'),
  selLoading: document.getElementById('selLoading'),
  selRufusInput: document.getElementById('selRufusInput'),
  selRufusSubmit: document.getElementById('selRufusSubmit'),
}

function populateFields(settings, apiKey) {
  fields.apiUrl.value = settings.apiUrl || DEFAULTS.apiUrl
  fields.apiKey.value = apiKey || settings.apiKey || ''
  fields.maxQuestions.value = settings.maxQuestions || DEFAULTS.maxQuestions
  fields.delayClicks.value = settings.delayBetweenClicks || DEFAULTS.delayBetweenClicks
  fields.delayProducts.value = settings.delayBetweenProducts || DEFAULTS.delayBetweenProducts

  const sel = settings.selectors || DEFAULTS.selectors
  fields.selRufusBtn.value = sel.rufusButton || DEFAULTS.selectors.rufusButton
  fields.selQuestionChip.value = sel.questionChip || DEFAULTS.selectors.questionChip
  fields.selChatContainer.value = sel.chatContainer || DEFAULTS.selectors.chatContainer
  fields.selQuestionBubble.value = sel.questionBubble || DEFAULTS.selectors.questionBubble
  fields.selAnswerBubble.value = sel.answerBubble || DEFAULTS.selectors.answerBubble
  fields.selLoading.value = sel.loadingIndicator || DEFAULTS.selectors.loadingIndicator
  fields.selRufusInput.value = sel.rufusInput || DEFAULTS.selectors.rufusInput
  fields.selRufusSubmit.value = sel.rufusSubmit || DEFAULTS.selectors.rufusSubmit
}

function readFields() {
  return {
    settings: {
      apiUrl: fields.apiUrl.value.trim().replace(/\/$/, ''),
      maxQuestions: parseInt(fields.maxQuestions.value, 10) || DEFAULTS.maxQuestions,
      delayBetweenClicks: parseInt(fields.delayClicks.value, 10) || DEFAULTS.delayBetweenClicks,
      delayBetweenProducts: parseInt(fields.delayProducts.value, 10) || DEFAULTS.delayBetweenProducts,
      // Track which version the selectors belong to (for auto-migration)
      selectorsVersion: chrome.runtime.getManifest().version,
      selectors: {
        rufusButton: fields.selRufusBtn.value.trim() || DEFAULTS.selectors.rufusButton,
        questionChip: fields.selQuestionChip.value.trim() || DEFAULTS.selectors.questionChip,
        chatContainer: fields.selChatContainer.value.trim() || DEFAULTS.selectors.chatContainer,
        questionBubble: fields.selQuestionBubble.value.trim() || DEFAULTS.selectors.questionBubble,
        answerBubble: fields.selAnswerBubble.value.trim() || DEFAULTS.selectors.answerBubble,
        loadingIndicator: fields.selLoading.value.trim() || DEFAULTS.selectors.loadingIndicator,
        rufusInput: fields.selRufusInput.value.trim() || DEFAULTS.selectors.rufusInput,
        rufusSubmit: fields.selRufusSubmit.value.trim() || DEFAULTS.selectors.rufusSubmit,
      },
    },
    apiKey: fields.apiKey.value.trim(),
  }
}

// ─── Load ────────────────────────────────────────────────────────
// Load settings from sync and API key from local
Promise.all([
  new Promise((resolve) => chrome.storage.sync.get('settings', resolve)),
  new Promise((resolve) => chrome.storage.local.get('apiKey', resolve)),
]).then(([syncResult, localResult]) => {
  populateFields(syncResult.settings || DEFAULTS, localResult.apiKey || '')
})

// ─── Save ────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  const { settings, apiKey } = readFields()
  // Settings (non-sensitive) in sync, API key in local only
  chrome.storage.sync.set({ settings }, () => {
    chrome.storage.local.set({ apiKey }, () => {
      const msg = document.getElementById('savedMsg')
      msg.style.display = 'inline'
      setTimeout(() => (msg.style.display = 'none'), 2000)
    })
  })
})

// ─── Reset ───────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Reset all settings to defaults?')) {
    populateFields(DEFAULTS, '')
  }
})
