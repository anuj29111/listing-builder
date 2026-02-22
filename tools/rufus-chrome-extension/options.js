/**
 * Rufus Q&A Extractor — Options Script
 */

const DEFAULTS = {
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  questionCount: 20,
  delayBetweenClicks: 3000,
  delayBetweenProducts: 5000,
  selectors: {
    rufusButton:
      '[data-action="rufus-open"], #rufus-entry-point, .rufus-launcher, [aria-label*="Rufus"], [data-testid*="rufus"]',
    questionChip:
      '.rufus-suggestion, [data-testid="rufus-suggestion"], .rufus-chip, [role="button"][data-suggestion]',
    chatContainer:
      '.rufus-chat-container, [data-testid="rufus-messages"], .rufus-messages',
    questionBubble:
      '.rufus-message-user, [data-testid="rufus-user-message"], .rufus-question',
    answerBubble:
      '.rufus-message-bot, [data-testid="rufus-bot-message"], .rufus-answer',
    loadingIndicator:
      '.rufus-loading, [data-testid="rufus-loading"], .rufus-typing',
  },
}

// ─── Element refs ────────────────────────────────────────────────
const fields = {
  apiUrl: document.getElementById('apiUrl'),
  apiKey: document.getElementById('apiKey'),
  questionCount: document.getElementById('questionCount'),
  delayClicks: document.getElementById('delayClicks'),
  delayProducts: document.getElementById('delayProducts'),
  selRufusBtn: document.getElementById('selRufusBtn'),
  selQuestionChip: document.getElementById('selQuestionChip'),
  selChatContainer: document.getElementById('selChatContainer'),
  selQuestionBubble: document.getElementById('selQuestionBubble'),
  selAnswerBubble: document.getElementById('selAnswerBubble'),
  selLoading: document.getElementById('selLoading'),
}

function populateFields(settings) {
  fields.apiUrl.value = settings.apiUrl || DEFAULTS.apiUrl
  fields.apiKey.value = settings.apiKey || ''
  fields.questionCount.value = settings.questionCount || DEFAULTS.questionCount
  fields.delayClicks.value = settings.delayBetweenClicks || DEFAULTS.delayBetweenClicks
  fields.delayProducts.value = settings.delayBetweenProducts || DEFAULTS.delayBetweenProducts

  const sel = settings.selectors || DEFAULTS.selectors
  fields.selRufusBtn.value = sel.rufusButton || DEFAULTS.selectors.rufusButton
  fields.selQuestionChip.value = sel.questionChip || DEFAULTS.selectors.questionChip
  fields.selChatContainer.value = sel.chatContainer || DEFAULTS.selectors.chatContainer
  fields.selQuestionBubble.value = sel.questionBubble || DEFAULTS.selectors.questionBubble
  fields.selAnswerBubble.value = sel.answerBubble || DEFAULTS.selectors.answerBubble
  fields.selLoading.value = sel.loadingIndicator || DEFAULTS.selectors.loadingIndicator
}

function readFields() {
  return {
    apiUrl: fields.apiUrl.value.trim().replace(/\/$/, ''),
    apiKey: fields.apiKey.value.trim(),
    questionCount: parseInt(fields.questionCount.value, 10) || DEFAULTS.questionCount,
    delayBetweenClicks: parseInt(fields.delayClicks.value, 10) || DEFAULTS.delayBetweenClicks,
    delayBetweenProducts: parseInt(fields.delayProducts.value, 10) || DEFAULTS.delayBetweenProducts,
    selectors: {
      rufusButton: fields.selRufusBtn.value.trim() || DEFAULTS.selectors.rufusButton,
      questionChip: fields.selQuestionChip.value.trim() || DEFAULTS.selectors.questionChip,
      chatContainer: fields.selChatContainer.value.trim() || DEFAULTS.selectors.chatContainer,
      questionBubble: fields.selQuestionBubble.value.trim() || DEFAULTS.selectors.questionBubble,
      answerBubble: fields.selAnswerBubble.value.trim() || DEFAULTS.selectors.answerBubble,
      loadingIndicator: fields.selLoading.value.trim() || DEFAULTS.selectors.loadingIndicator,
    },
  }
}

// ─── Load ────────────────────────────────────────────────────────
chrome.storage.sync.get('settings', (result) => {
  populateFields(result.settings || DEFAULTS)
})

// ─── Save ────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  const settings = readFields()
  chrome.storage.sync.set({ settings }, () => {
    const msg = document.getElementById('savedMsg')
    msg.style.display = 'inline'
    setTimeout(() => (msg.style.display = 'none'), 2000)
  })
})

// ─── Reset ───────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Reset all settings to defaults?')) {
    populateFields(DEFAULTS)
  }
})
