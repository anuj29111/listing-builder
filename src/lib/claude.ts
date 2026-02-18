import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_CLAUDE_MODEL } from '@/lib/constants'

const MAX_TOKENS = 32768

/**
 * Strip markdown code fences from Claude's response.
 * Some models return ```json ... ``` despite being told not to.
 */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim()
  // Remove ```json or ``` at start
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n')
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1)
    }
  }
  // Remove trailing ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  return cleaned.trim()
}

// ~150K tokens budget for prompt content (leaving room for system prompt + output tokens)
// Claude's context is 200K tokens; 1 token ≈ 4 chars
const MAX_PROMPT_CHARS = 600_000

/**
 * Truncate CSV content to fit within token limits.
 * Uses even sampling across the dataset to maintain representativeness.
 */
function truncateCSVContent(csvContent: string, maxChars: number = MAX_PROMPT_CHARS): {
  content: string
  truncated: boolean
  originalRows: number
  keptRows: number
} {
  if (csvContent.length <= maxChars) {
    const rowCount = csvContent.split('\n').filter((l) => l.trim()).length - 1
    return { content: csvContent, truncated: false, originalRows: rowCount, keptRows: rowCount }
  }

  const lines = csvContent.split('\n')
  const header = lines[0]
  const dataLines = lines.slice(1).filter((l) => l.trim())
  const originalRows = dataLines.length

  if (dataLines.length === 0) {
    return { content: header, truncated: false, originalRows: 0, keptRows: 0 }
  }

  // Calculate average line length to estimate how many rows we can fit
  const sampleSize = Math.min(100, dataLines.length)
  const sampleChars = dataLines.slice(0, sampleSize).join('\n').length
  const avgLineLength = sampleChars / sampleSize

  const availableChars = maxChars - header.length - 200 // 200 chars buffer for truncation note
  const maxDataLines = Math.max(1, Math.floor(availableChars / avgLineLength))

  // Sample evenly across the dataset (not just first N rows)
  // This ensures we get data from all time periods, rating ranges, etc.
  let sampledLines: string[]
  if (maxDataLines >= dataLines.length) {
    sampledLines = dataLines
  } else {
    const step = dataLines.length / maxDataLines
    sampledLines = []
    for (let i = 0; i < maxDataLines; i++) {
      const idx = Math.min(Math.floor(i * step), dataLines.length - 1)
      sampledLines.push(dataLines[idx])
    }
  }

  return {
    content: [header, ...sampledLines].join('\n'),
    truncated: true,
    originalRows,
    keptRows: sampledLines.length,
  }
}

async function getApiKey(): Promise<string> {
  // Try lb_admin_settings first (set via Admin Settings UI)
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'anthropic_api_key')
      .single()
    if (data?.value) return data.value
  } catch {
    // DB lookup failed, fall through to env var
  }

  // Fallback to environment variable
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) return apiKey

  throw new Error('ANTHROPIC_API_KEY not found. Set it in Admin Settings or as an environment variable.')
}

async function getClient(): Promise<Anthropic> {
  const apiKey = await getApiKey()
  return new Anthropic({ apiKey })
}

async function getModel(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'claude_model')
      .single()
    if (data?.value) return data.value
  } catch {
    // DB lookup failed, fall through to default
  }
  return DEFAULT_CLAUDE_MODEL
}

// --- Analysis Result Types ---

export interface KeywordTier {
  keyword: string
  searchVolume: number
  relevancy: number
  strategicValue: number
  strategicPlacement?: string // e.g., "TITLE - Position 1", "Bullet 1"
}

export interface KeywordAnalysisResult {
  // Legacy fields (always present)
  summary: {
    totalKeywords: number
    totalSearchVolume: number
    dataQuality: string
  }
  highRelevancy: KeywordTier[]
  mediumRelevancy: KeywordTier[]
  customerIntentPatterns: Array<{
    category: string
    keywordCount: number
    totalSearchVolume: number
    priority: string
    painPoints?: string
    opportunity?: string
  }>
  surfaceDemand: Array<{
    surfaceType: string
    keywordCount: number
    totalSearchVolume: number
  }>
  featureDemand: Array<{
    feature: string
    keywordCount: number
    totalSearchVolume: number
    priority: string
  }>
  titleKeywords: string[]
  bulletKeywords: string[]
  searchTermKeywords: string[]

  // New expanded fields (optional for backward compat)
  executiveSummary?: string
  keywordDistribution?: {
    high: { count: number; totalVolume: number; avgRelevancy: number }
    medium: { count: number; totalVolume: number; avgRelevancy: number }
    low: { count: number; totalVolume: number; avgRelevancy: number }
  }
  lowRelevancy?: KeywordTier[]
  keywordThemes?: Array<{
    dimension: string // "Surface", "Feature", "Color", "Tip Size", etc.
    themes: Array<{ name: string; keywordCount: number; totalSearchVolume: number }>
  }>
  competitiveIntelligence?: {
    brandPresence: Array<{ brand: string; searchVolume: number }>
    featureDifferentiation: string[]
    marketGaps: string[]
  }
  bulletKeywordMap?: Array<{
    bulletNumber: number
    keywords: string[]
    focus: string
  }>
  rufusQuestionAnticipation?: string[]
  marketOpportunity?: {
    totalAddressableMarket: number
    primaryTargetMarket: number
    competitionLevel: string
    growthPotential: string
  }
}

export interface ReviewAnalysisResult {
  // Legacy fields (always present)
  summary: {
    totalReviews: number
    averageRating: number
    positivePercent: number
    negativePercent: number
  }
  ratingDistribution: Array<{
    stars: number
    count: number
    percentage: number
    sentiment?: string
  }>
  useCases: Array<{
    useCase: string
    frequency: number
    priority: string
  }>
  strengths: Array<{
    strength: string
    mentions: number
    impact: string
  }>
  weaknesses: Array<{
    weakness: string
    mentions: number
    impact: string
  }>
  positiveLanguage: Array<{
    word: string
    frequency: number
    optimizationValue?: string
  }>
  negativeLanguage: Array<{
    word: string
    frequency: number
    issueToAddress?: string
  }>
  bulletStrategy: Array<{
    bulletNumber: number
    focus: string
    evidence: string
    priority: string
    customerPainPoint?: string
  }>

  // New expanded fields (optional for backward compat)
  executiveSummary?: string
  customerProfiles?: Array<{
    profile: string
    mentions: number
    description: string
  }>
  productNouns?: Array<{
    noun: string
    frequency: number
    listingIntegration: string
  }>
  crossProductAnalysis?: Array<{
    productId: string
    reviewCount: number
    positiveRate: number
    negativeRate: number
    performanceRating: string
  }>
  imageOptimizationOpportunities?: Array<{
    imageType: string
    rationale: string
    reviewEvidence: string
  }>
  competitivePositioning?: {
    marketGaps: Array<{ gap: string; customerNeed: string; opportunity: string }>
    messagingFramework: {
      primaryMessage: string
      supportPoints: string[]
      proofPoints: string[]
      riskReversal: string
    }
  }
  customerVoicePhrases?: {
    positiveEmotional: string[]
    functional: string[]
    useCaseLanguage: string[]
  }
}

export interface QnAAnalysisResult {
  // Legacy fields (always present)
  summary: {
    totalQuestions: number
    topConcerns: string[]
  }
  themes: Array<{
    theme: string
    questionCount: number
    priority: string
    sampleQuestions: string[]
    percentageOfTotal?: number
  }>
  customerConcerns: Array<{
    concern: string
    frequency: number
    addressInListing: boolean
    suggestedResponse: string
  }>
  contentGaps: Array<{
    gap: string
    importance: string
    recommendation: string
    priorityScore?: number
    customerImpact?: string
  }>
  faqForDescription: Array<{
    question: string
    answer: string
  }>

  // New expanded fields (optional for backward compat)
  executiveSummary?: string
  productSpecsConfirmed?: Array<{
    spec: string
    value: string
    source: string
  }>
  contradictions?: Array<{
    topic: string
    conflictingAnswers: string[]
    impact: string
    resolution: string
  }>
  confirmedFeatures?: {
    positive: Array<{ feature: string; evidence: string }>
    limitations: Array<{ limitation: string; evidence: string }>
  }
  questionTypeBreakdown?: Array<{
    type: string
    count: number
    percentage: number
    recommendation: string
  }>
  highRiskQuestions?: Array<{
    question: string
    risk: string
    defensiveAction: string
  }>
  competitiveDefense?: {
    brandProtectionOpportunities: string[]
    informationGapAdvantages: string[]
  }
  rufusOptimizationScore?: {
    score: number
    maxScore: number
    strengths: string[]
    improvements: string[]
  }
}

export type AnalysisResult =
  | KeywordAnalysisResult
  | ReviewAnalysisResult
  | QnAAnalysisResult

// --- Prompts ---

function buildKeywordAnalysisPrompt(csvContent: string, categoryName: string, countryName: string): string {
  const { content, truncated, originalRows, keptRows } = truncateCSVContent(csvContent)
  const truncationNote = truncated
    ? `\n\nIMPORTANT: This is a representative sample of ${keptRows.toLocaleString()} out of ${originalRows.toLocaleString()} total rows, evenly sampled across the dataset. Scale your counts/totals proportionally when summarizing (e.g., totalKeywords should reflect the full ${originalRows.toLocaleString()}).\n`
    : ''

  return `You are an expert Amazon listing optimization analyst conducting a COMPREHENSIVE keyword analysis. Analyze the following keyword research CSV data for the product category "${categoryName}" in the "${countryName}" marketplace.
${truncationNote}
The CSV has these columns: Search Terms, Type, SV (search volume), Relev. (relevancy score 0-1), and ASIN rank columns.
- "SV" = monthly search volume
- "Relev." = relevancy score (higher = more relevant to the product). Values like "Residue" mean low/unclear relevancy.
- For strategicValue, calculate: searchVolume * relevancy. Treat "Residue" relevancy as 0.3.

Produce a DEEP, COMPREHENSIVE analysis. Do NOT be shallow. Analyze every angle: intent patterns, surface/application demand, feature signals, competitive gaps, keyword themes by multiple dimensions, and strategic placement for every bullet.

Return a JSON object with this EXACT structure:
{
  "executiveSummary": "<2-3 sentences: market opportunity, primary category, key strategic insight>",
  "summary": {
    "totalKeywords": <count>,
    "totalSearchVolume": <sum of all SV>,
    "dataQuality": "<brief assessment>"
  },
  "keywordDistribution": {
    "high": { "count": <keywords with relevancy>=0.6>, "totalVolume": <their SV sum>, "avgRelevancy": <avg> },
    "medium": { "count": <keywords 0.4-0.6>, "totalVolume": <SV sum>, "avgRelevancy": <avg> },
    "low": { "count": <keywords <0.4>, "totalVolume": <SV sum>, "avgRelevancy": <avg> }
  },
  "highRelevancy": [top 15 keywords relevancy>=0.6: {"keyword":"","searchVolume":0,"relevancy":0.0,"strategicValue":0,"strategicPlacement":"TITLE - Position 1 / Bullet 1 / Bullet 2 / Description / Search Terms"}],
  "mediumRelevancy": [top 10 keywords 0.4-0.6, same shape including strategicPlacement],
  "lowRelevancy": [top 10 keywords <0.4 by search volume: same shape - these are background/long-tail keywords],
  "keywordThemes": [3-6 theme dimensions. Each: {"dimension":"Surface Applications / Product Features / Color Specs / Size/Tip / Use Case / Brand","themes":[{"name":"","keywordCount":0,"totalSearchVolume":0}]}],
  "customerIntentPatterns": [5-8 distinct customer intents: {"category":"","keywordCount":0,"totalSearchVolume":0,"priority":"CRITICAL/HIGH/MEDIUM/LOW","painPoints":"what customers struggle with","opportunity":"how to position for this intent"}],
  "surfaceDemand": [all surface/application types found: {"surfaceType":"","keywordCount":0,"totalSearchVolume":0}],
  "featureDemand": [all features found: {"feature":"","keywordCount":0,"totalSearchVolume":0,"priority":"CRITICAL/HIGH/MEDIUM/LOW"}],
  "competitiveIntelligence": {
    "brandPresence": [brands found in keywords with SV: {"brand":"","searchVolume":0}],
    "featureDifferentiation": ["3-5 features that keywords suggest are differentiators"],
    "marketGaps": ["3-5 underserved keyword areas competitors aren't addressing"]
  },
  "titleKeywords": ["top 5-8 must-include keywords for title, ordered by priority"],
  "bulletKeywordMap": [{"bulletNumber":1,"keywords":["kw1","kw2"],"focus":"surface compatibility / key feature / etc"},{"bulletNumber":2,...},... for all 5 bullets],
  "bulletKeywords": ["top 10-15 keywords for bullet points (flat list)"],
  "searchTermKeywords": ["top 15-20 keywords for backend search terms"],
  "rufusQuestionAnticipation": ["5-8 questions customers will likely ask Rufus AI based on keyword patterns"],
  "marketOpportunity": {
    "totalAddressableMarket": <total monthly SV>,
    "primaryTargetMarket": <SV of high+medium relevancy>,
    "competitionLevel": "Low/Moderate/High/Very High",
    "growthPotential": "LOW/MEDIUM/HIGH with brief reason"
  }
}

Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${content}`
}

function buildReviewAnalysisPrompt(csvContent: string, categoryName: string, countryName: string): string {
  const { content, truncated, originalRows, keptRows } = truncateCSVContent(csvContent)
  const truncationNote = truncated
    ? `\n\nIMPORTANT: This is a representative sample of ${keptRows.toLocaleString()} out of ${originalRows.toLocaleString()} total reviews, evenly sampled across the dataset. Scale your counts proportionally (e.g., totalReviews = ${originalRows.toLocaleString()}, scale frequencies by ${(originalRows / keptRows).toFixed(1)}x).\n`
    : ''

  return `You are an expert Amazon listing optimization analyst conducting a COMPREHENSIVE review analysis. Analyze the following product review CSV data for the product category "${categoryName}" in the "${countryName}" marketplace.
${truncationNote}
The CSV has columns: Date, Author, Verified, Helpful, Title, Body, Rating, Images, Videos, URL, Variation, Style.

Produce a DEEP, COMPREHENSIVE analysis. Analyze every angle: use cases (find 20+), customer profiles, strengths and weaknesses with business impact, language patterns (positive, negative, product nouns), cross-product/ASIN performance if variation data exists, image optimization opportunities from review insights, competitive positioning, and authentic customer voice phrases for copy.

Return a JSON object with this EXACT structure:
{
  "executiveSummary": "<3-5 sentences: key strategic insights, primary strength, critical weakness, market positioning opportunity, quality assessment>",
  "summary": {
    "totalReviews": <count>,
    "averageRating": <float>,
    "positivePercent": <% of 4-5 star>,
    "negativePercent": <% of 1-2 star>
  },
  "ratingDistribution": [for each 1-5 star: {"stars":5,"count":0,"percentage":0.0,"sentiment":"Highly satisfied/Satisfied/Neutral/Dissatisfied/Highly dissatisfied"}],
  "customerProfiles": [3-5 distinct buyer personas identified from reviews: {"profile":"Food Service Industry/Business Users/Educators/Creative Community/etc","mentions":0,"description":"brief profile description"}],
  "useCases": [top 20 use cases by frequency: {"useCase":"","frequency":0,"priority":"CRITICAL/HIGH/MEDIUM/LOW"}],
  "strengths": [top 10 product strengths: {"strength":"","mentions":0,"impact":"PRIMARY DIFFERENTIATOR/CRITICAL FEATURE/USER EXPERIENCE/TRUST BUILDER/PURCHASE DRIVER/SELECTION APPEAL/RELIABILITY/PERFORMANCE"}],
  "weaknesses": [top 10 product weaknesses: {"weakness":"","mentions":0,"impact":"CRITICAL ISSUE/RELIABILITY FAILURE/FEATURE FAILURE/TRUST DESTROYER/QUALITY CONTROL/PERFORMANCE GAP/VALUE CONCERN/BASIC FUNCTION FAIL"}],
  "positiveLanguage": [top 12 positive descriptors: {"word":"","frequency":0,"optimizationValue":"Use in bullets/Feature emphasis/Color positioning/Quality assurance/Visual appeal/Outcome description/Emotional trigger"}],
  "negativeLanguage": [top 12 negative descriptors: {"word":"","frequency":0,"issueToAddress":"Longevity concerns/Quality issues/Usability barriers/Expectation gaps/Coverage issues/Reliability issues"}],
  "productNouns": [top 10 product-defining nouns customers use: {"noun":"","frequency":0,"listingIntegration":"Primary product term/Variety emphasis/Technology identifier/Surface specification/Precision feature"}],
  "crossProductAnalysis": [if Variation/Style/ASIN data exists, show per-variation breakdown: {"productId":"ASIN or variation name","reviewCount":0,"positiveRate":0.0,"negativeRate":0.0,"performanceRating":"BEST/HIGH/GOOD/AVERAGE/BELOW AVERAGE/POOR"}. If no variation data, return empty array],
  "bulletStrategy": [5 bullets: {"bulletNumber":1,"focus":"","evidence":"specific review evidence","priority":"HIGH/MEDIUM","customerPainPoint":"the pain point this bullet addresses"}],
  "imageOptimizationOpportunities": [5-6 image suggestions driven by review insights: {"imageType":"Before/After Demo/Color Chart/Multi-Surface/Professional Use/No-Mess Application/etc","rationale":"why this image matters","reviewEvidence":"what reviews say that supports this"}],
  "competitivePositioning": {
    "marketGaps": [3-5 gaps: {"gap":"","customerNeed":"","opportunity":""}],
    "messagingFramework": {
      "primaryMessage": "one-line primary positioning message",
      "supportPoints": ["3-4 support points"],
      "proofPoints": ["3-4 proof points from reviews"],
      "riskReversal": "how to preemptively address top weakness"
    }
  },
  "customerVoicePhrases": {
    "positiveEmotional": ["5-8 authentic positive phrases customers use, e.g. 'great for menu boards'"],
    "functional": ["5-8 functional phrases, e.g. 'liquid chalk markers', 'erasable and washable'"],
    "useCaseLanguage": ["5-8 use case phrases, e.g. 'chalkboard menu displays', 'window decorating'"]
  }
}

Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${content}`
}

function buildQnAAnalysisPrompt(csvContent: string, categoryName: string, countryName: string, isRufus: boolean): string {
  const { content, truncated, originalRows, keptRows } = truncateCSVContent(csvContent)
  const source = isRufus ? 'Amazon Rufus AI' : 'Amazon customer'
  const truncationNote = truncated
    ? `\n\nIMPORTANT: This is a representative sample of ${keptRows.toLocaleString()} out of ${originalRows.toLocaleString()} total Q&A pairs, evenly sampled. Scale counts proportionally.\n`
    : ''

  return `You are an expert Amazon listing optimization analyst conducting a COMPREHENSIVE Q&A analysis. Analyze the following ${source} Q&A data for the product category "${categoryName}" in the "${countryName}" marketplace.
${truncationNote}
The data is formatted as Q&A pairs (Q1:, A1:, Q2:, A2:, etc.).

Produce a DEEP, COMPREHENSIVE analysis. Analyze every angle: product specs confirmed from Q&A, surface/feature compatibility, contradictions in answers, 10+ information gaps with priority scores, confirmed features (positive and limitations), question type breakdown with percentages, high-risk questions for competitor ad placement, competitive defense strategy, and a Rufus AI optimization score.

Return a JSON object with this EXACT structure:
{
  "executiveSummary": "<3-5 sentences: critical finding, product specs confirmed, market alignment with keyword data, number of information gaps found>",
  "summary": {
    "totalQuestions": <count>,
    "topConcerns": ["top 3-5 concerns"]
  },
  "productSpecsConfirmed": [product specifications confirmed from Q&A answers: {"spec":"Tip Size/Quantity/Colors/Product Type/Target Surfaces/etc","value":"confirmed value","source":"Q# reference or general"}],
  "themes": [5-8 question themes: {"theme":"","questionCount":0,"priority":"HIGH/MEDIUM/LOW","percentageOfTotal":0,"sampleQuestions":["q1","q2","q3"]}],
  "contradictions": [any contradictions found in answers - where one answer says yes and another says no: {"topic":"e.g. Whiteboard Compatibility","conflictingAnswers":["Answer 1: Yes...","Answer 2: No..."],"impact":"Major confusion for customers / Minor inconsistency","resolution":"recommended resolution for listing"}. Return empty array if none found],
  "customerConcerns": [top 12 concerns: {"concern":"","frequency":0,"addressInListing":true/false,"suggestedResponse":""}],
  "contentGaps": [10-12 information gaps the listing doesn't address but customers ask about: {"gap":"","importance":"CRITICAL/HIGH/MEDIUM/LOW","priorityScore":<1-15 numerical>,"customerImpact":"HIGH/MEDIUM/LOW","recommendation":"specific action to take"}],
  "confirmedFeatures": {
    "positive": [features confirmed working from Q&A: {"feature":"","evidence":"brief evidence from Q&A"}],
    "limitations": [confirmed limitations: {"limitation":"","evidence":"brief evidence"}]
  },
  "questionTypeBreakdown": [breakdown by question pattern: {"type":"Can these be used on.../Are these markers.../How.../Do they...","count":0,"percentage":0,"recommendation":"how to address this question type in listing"}],
  "highRiskQuestions": [3-5 questions where competitors could place ads or steal customers: {"question":"","risk":"why this is risky","defensiveAction":"how to defend in listing"}],
  "faqForDescription": [top 8 Q&As to weave into listing: {"question":"","answer":""}],
  "competitiveDefense": {
    "brandProtectionOpportunities": ["3-5 opportunities to protect brand position"],
    "informationGapAdvantages": ["3-5 advantages from proactively addressing gaps competitors leave open"]
  },
  "rufusOptimizationScore": {
    "score": <1-5>,
    "maxScore": 5,
    "strengths": ["what the Q&A data shows is well-covered"],
    "improvements": ["what needs to be added to the listing to handle Rufus questions"]
  }
}

Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${content}`
}

// --- Listing Generation Types ---

export interface ListingGenerationInput {
  productName: string
  brand: string
  asin?: string
  attributes: Record<string, string>
  categoryName: string
  countryName: string
  language: string
  charLimits: {
    title: number
    bullet: number
    bulletCount: number
    description: number
    searchTerms: number
  }
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  optimizationMode?: 'new' | 'optimize_existing'
  existingListingText?: { title: string; bullets: string[]; description: string } | null
}

export interface ListingGenerationResult {
  planningMatrix: Array<{
    bulletNumber: number
    primaryFocus: string
    qnaGapsAddressed: string[]
    reviewThemes: string[]
    priorityKeywords: string[]
    rufusQuestionTypes: string[]
  }>
  title: string[]
  bullets: Array<{
    seo: { concise: string; medium: string; longer: string }
    benefit: { concise: string; medium: string; longer: string }
    balanced: { concise: string; medium: string; longer: string }
  }>
  description: string[]
  searchTerms: string[]
  subjectMatter: string[][]
  backendAttributes: Record<string, string[]>
}

// --- Listing Generation Prompt ---

function buildListingGenerationPrompt(input: ListingGenerationInput): string {
  const {
    productName, brand, asin, attributes, categoryName, countryName, language,
    charLimits, keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis,
    optimizationMode, existingListingText,
  } = input

  const attrStr = Object.entries(attributes)
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n') || '  (none provided)'

  let keywordSection = 'No keyword data available. Use general best practices for Amazon listings in this category.'
  if (keywordAnalysis) {
    const titleKw = keywordAnalysis.titleKeywords?.join(', ') || 'N/A'
    const bulletKw = keywordAnalysis.bulletKeywords?.join(', ') || 'N/A'
    const searchKw = keywordAnalysis.searchTermKeywords?.join(', ') || 'N/A'
    const intents = keywordAnalysis.customerIntentPatterns
      ?.map((p) => `${p.category} (${p.priority})${p.painPoints ? ` — Pain points: ${p.painPoints}` : ''}`)
      .join('\n  ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'

    const execSummary = keywordAnalysis.executiveSummary ? `\nExecutive Summary: ${keywordAnalysis.executiveSummary}` : ''
    const bulletMap = keywordAnalysis.bulletKeywordMap
      ?.map((b) => `Bullet ${b.bulletNumber}: ${b.keywords.join(', ')} — Focus: ${b.focus}`)
      .join('\n  ') || ''
    const bulletMapStr = bulletMap ? `\nPer-bullet keyword mapping:\n  ${bulletMap}` : ''
    const competitive = keywordAnalysis.competitiveIntelligence
    const competitiveStr = competitive
      ? `\nCompetitive gaps to exploit: ${competitive.marketGaps?.join('; ') || 'N/A'}\nFeature differentiators: ${competitive.featureDifferentiation?.join('; ') || 'N/A'}`
      : ''
    const rufusQs = keywordAnalysis.rufusQuestionAnticipation
      ?.slice(0, 6)
      .join('\n  ') || ''
    const rufusStr = rufusQs ? `\nRufus AI questions to preemptively answer:\n  ${rufusQs}` : ''

    keywordSection = `${execSummary}
Must-include title keywords (by search volume priority): ${titleKw}
Bullet point keywords to weave in: ${bulletKw}
Backend search term keywords: ${searchKw}
Customer intent patterns:
  ${intents}
Key feature demand signals: ${features}${bulletMapStr}${competitiveStr}${rufusStr}`
  }

  let reviewSection = 'No review data available. Focus on general product benefits.'
  if (reviewAnalysis) {
    const execSummary = reviewAnalysis.executiveSummary ? `Executive Summary: ${reviewAnalysis.executiveSummary}\n` : ''
    const strengths = reviewAnalysis.strengths
      ?.slice(0, 8)
      .map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.slice(0, 6)
      .map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const posLang = reviewAnalysis.positiveLanguage
      ?.slice(0, 8)
      .map((w) => `${w.word}${w.optimizationValue ? ` [${w.optimizationValue}]` : ''}`)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.slice(0, 4)
      .map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    const bulletStrat = reviewAnalysis.bulletStrategy
      ?.map((b) => `Bullet ${b.bulletNumber}: Focus on "${b.focus}" — Evidence: ${b.evidence}${b.customerPainPoint ? ` — Addresses: ${b.customerPainPoint}` : ''}`)
      .join('\n  ') || 'N/A'

    const voicePhrases = reviewAnalysis.customerVoicePhrases
    const voiceParts: string[] = []
    if (voicePhrases?.positiveEmotional?.length) voiceParts.push(...voicePhrases.positiveEmotional.slice(0, 4))
    if (voicePhrases?.functional?.length) voiceParts.push(...voicePhrases.functional.slice(0, 3))
    if (voicePhrases?.useCaseLanguage?.length) voiceParts.push(...voicePhrases.useCaseLanguage.slice(0, 3))
    const voiceStr = voiceParts.length > 0 ? `\nCustomer voice phrases to echo in copy: ${voiceParts.map((p) => `"${p}"`).join(', ')}` : ''
    const profiles = reviewAnalysis.customerProfiles
      ?.map((p) => `${p.profile}: ${p.description}`)
      .join('; ') || ''
    const profileStr = profiles ? `\nKey customer profiles: ${profiles}` : ''
    const messaging = reviewAnalysis.competitivePositioning?.messagingFramework
    const msgStr = messaging
      ? `\nMessaging framework — Primary: "${messaging.primaryMessage}" | Supporting: ${messaging.supportPoints?.join('; ') || 'N/A'} | Proof: ${messaging.proofPoints?.join('; ') || 'N/A'}`
      : ''

    reviewSection = `${execSummary}Product strengths to highlight: ${strengths}
Top use cases to emphasize: ${useCases}
Customer language that resonates: ${posLang}
Weaknesses to preemptively address: ${weaknesses}
Bullet strategy from review analysis:
  ${bulletStrat}${voiceStr}${profileStr}${msgStr}`
  }

  let qnaSection = 'No Q&A data available.'
  if (qnaAnalysis) {
    const execSummary = qnaAnalysis.executiveSummary ? `Executive Summary: ${qnaAnalysis.executiveSummary}\n` : ''
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 6)
      .map((c) => `${c.concern} — Suggested: ${c.suggestedResponse}`)
      .join('\n  ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.map((g) => `${g.gap} (${g.importance})${g.priorityScore ? ` [priority: ${g.priorityScore}]` : ''}`)
      .join(', ') || 'N/A'
    const faqs = qnaAnalysis.faqForDescription
      ?.slice(0, 4)
      .map((f) => `Q: ${f.question} / A: ${f.answer}`)
      .join('\n  ') || 'N/A'

    const contradictions = qnaAnalysis.contradictions
      ?.slice(0, 3)
      .map((c) => `"${c.topic}": ${c.resolution}`)
      .join('; ') || ''
    const contradStr = contradictions ? `\nContradictions to resolve in listing: ${contradictions}` : ''
    const highRisk = qnaAnalysis.highRiskQuestions
      ?.slice(0, 4)
      .map((q) => `${q.question} → ${q.defensiveAction}`)
      .join('\n  ') || ''
    const riskStr = highRisk ? `\nHigh-risk questions to preemptively address:\n  ${highRisk}` : ''
    const specs = qnaAnalysis.productSpecsConfirmed
      ?.slice(0, 8)
      .map((s) => `${s.spec}: ${s.value}`)
      .join('; ') || ''
    const specStr = specs ? `\nConfirmed product specs: ${specs}` : ''
    const defenseParts: string[] = []
    if (qnaAnalysis.competitiveDefense?.brandProtectionOpportunities?.length) {
      defenseParts.push(`Brand protection: ${qnaAnalysis.competitiveDefense.brandProtectionOpportunities.slice(0, 3).join('; ')}`)
    }
    if (qnaAnalysis.competitiveDefense?.informationGapAdvantages?.length) {
      defenseParts.push(`Info gap advantages: ${qnaAnalysis.competitiveDefense.informationGapAdvantages.slice(0, 3).join('; ')}`)
    }
    const defenseStr = defenseParts.length > 0 ? `\nCompetitive defense: ${defenseParts.join(' | ')}` : ''

    qnaSection = `${execSummary}Top customer concerns to address in listing:
  ${concerns}
Content gaps to fill: ${gaps}
FAQ to weave into description:
  ${faqs}${specStr}${contradStr}${riskStr}${defenseStr}`
  }

  let competitorSection = ''
  if (competitorAnalysis) {
    const titlePatterns = competitorAnalysis.titlePatterns
      ?.slice(0, 5)
      .map((p) => `"${p.pattern}" (${p.frequency}x) — e.g. "${p.example}"`)
      .join('\n  ') || 'N/A'
    const bulletThemes = competitorAnalysis.bulletThemes
      ?.slice(0, 6)
      .map((t) => `${t.theme} (${t.frequency}x)`)
      .join(', ') || 'N/A'
    const gaps = competitorAnalysis.differentiationGaps
      ?.slice(0, 5)
      .map((g) => `${g.gap}: ${g.opportunity} (${g.priority})`)
      .join('\n  ') || 'N/A'
    const usps = competitorAnalysis.usps
      ?.slice(0, 4)
      .map((u) => `${u.usp} — Competitor weakness: ${u.competitorWeakness}`)
      .join('\n  ') || 'N/A'

    competitorSection = `
=== COMPETITOR INTELLIGENCE ===
Executive Summary: ${competitorAnalysis.executiveSummary}
Competitor title patterns to learn from (and differentiate against):
  ${titlePatterns}
Common bullet themes across competitors: ${bulletThemes}
Differentiation gaps to exploit:
  ${gaps}
Our unique selling propositions:
  ${usps}`
  }

  let existingListingSection = ''
  if (optimizationMode === 'optimize_existing' && existingListingText) {
    const bullets = existingListingText.bullets
      .map((b, i) => `  Bullet ${i + 1}: ${b}`)
      .join('\n')
    existingListingSection = `

=== EXISTING LISTING TO OPTIMIZE ===
This is an OPTIMIZATION task. The customer has an existing listing they want improved. Analyze it first, then generate optimized versions.

Current Title: ${existingListingText.title}
Current Bullets:
${bullets}
Current Description: ${existingListingText.description}

OPTIMIZATION INSTRUCTIONS:
1. Score the existing listing 1-10 on: keyword coverage, benefit communication, readability, competitive positioning
2. Identify missing high-volume keywords that should be added
3. Identify weak/generic phrases that can be made more specific and compelling
4. Preserve elements that are already strong (don't fix what isn't broken)
5. Your generated variations should be OPTIMIZED versions of this listing, not entirely new listings
6. Each variation strategy (SEO/Benefit/Balanced) should improve upon the original in its specific dimension`
  }

  return `You are an expert Amazon listing copywriter. ${optimizationMode === 'optimize_existing' ? 'Optimize an existing' : 'Generate an optimized'} product listing for the following product.

=== PRODUCT INFO ===
Product: ${productName}
Brand: ${brand}
ASIN: ${asin || 'Not provided'}
Category: ${categoryName}
Marketplace: ${countryName}
Language: ALL content MUST be written in ${language}
Attributes:
${attrStr}

=== CHARACTER LIMITS (STRICT — do not exceed) ===
Title: ${charLimits.title} characters max
Each Bullet Point: ${charLimits.bullet} characters max (generate exactly ${charLimits.bulletCount} bullets)
Description: ${charLimits.description} characters max
Search Terms: ${charLimits.searchTerms} characters max (backend only, not visible to customers)

=== KEYWORD INTELLIGENCE ===
${keywordSection}

=== CUSTOMER REVIEW INSIGHTS ===
${reviewSection}

=== Q&A / CUSTOMER CONCERNS ===
${qnaSection}${competitorSection}${existingListingSection}

=== PLANNING PHASE ===
BEFORE writing any content, you MUST first create a planningMatrix. For each bullet (1-${charLimits.bulletCount}), decide:
- What is the primary focus of this bullet?
- Which Q&A gaps does it address?
- Which review themes does it leverage?
- Which priority keywords must be woven in?
- What Rufus AI question types does it preemptively answer?

This planning step ensures each bullet has a distinct purpose and maximum coverage of customer needs.

=== OUTPUT FORMAT ===
Return a JSON object with this EXACT structure:
{
  "planningMatrix": [
    {
      "bulletNumber": 1,
      "primaryFocus": "Main theme for this bullet",
      "qnaGapsAddressed": ["gap 1", "gap 2"],
      "reviewThemes": ["theme 1", "theme 2"],
      "priorityKeywords": ["kw1", "kw2"],
      "rufusQuestionTypes": ["question type 1"]
    }
  ],
  "title": ["SEO-dense title", "Benefit-focused title", "Balanced title", "Feature-rich title", "Concise/clean title"],
  "bullets": [
    {
      "seo": { "concise": "110-140 char SEO bullet", "medium": "140-180 char SEO bullet", "longer": "180-${charLimits.bullet} char SEO bullet" },
      "benefit": { "concise": "110-140 char benefit bullet", "medium": "140-180 char benefit bullet", "longer": "180-${charLimits.bullet} char benefit bullet" },
      "balanced": { "concise": "110-140 char balanced bullet", "medium": "140-180 char balanced bullet", "longer": "180-${charLimits.bullet} char balanced bullet" }
    }
  ],
  "description": ["SEO variation", "Benefit variation", "Balanced variation"],
  "searchTerms": ["variation 1", "variation 2", "variation 3"],
  "subjectMatter": [
    ["field 1 var 1", "field 1 var 2", "field 1 var 3"],
    ["field 2 var 1", "field 2 var 2", "field 2 var 3"],
    ["field 3 var 1", "field 3 var 2", "field 3 var 3"]
  ],
  "backendAttributes": {
    "material": ["value1", "value2"],
    "target_audience": ["value1"],
    "special_features": ["value1", "value2"],
    "recommended_uses": ["value1", "value2"],
    "included_components": ["value1"]
  }
}

=== RULES ===
1. Generate exactly 5 DISTINCT title variations:
   - Title 1: Keyword-dense, SEO-optimized — maximum keyword coverage while readable
   - Title 2: Benefit-focused — speak to customer desires and needs
   - Title 3: Balanced — keywords + benefits combined naturally
   - Title 4: Feature-rich — highlight specific product features and specifications
   - Title 5: Concise/clean — short, punchy, premium feel
2. ALL titles MUST start with the brand name "${brand}"
3. For EACH bullet point, generate 3 strategies x 3 lengths = 9 variations:
   - SEO strategy: keyword-dense, search-optimized
   - Benefit strategy: emotional, customer-focused, addresses pain points
   - Balanced strategy: keywords + benefits naturally combined
   - Concise: 110-140 characters
   - Medium: 140-180 characters
   - Longer: 180-${charLimits.bullet} characters (but NEVER exceed the limit)
4. Bullets should start with a CAPITALIZED benefit phrase followed by a dash or colon, then details
5. Each bullet must serve its planningMatrix purpose — no two bullets should overlap in primary focus
6. Description: 3 distinct variations (SEO, Benefit, Balanced)
7. Search terms: no brand name, no ASINs, no commas (space-separated), include misspellings and synonyms
8. Subject matter: short descriptive phrases for Amazon's subject matter fields (3 fields, each under 50 chars)
9. Backend attributes: recommend values for Amazon's backend fields based on keyword/review/Q&A data. Include at least: material, target_audience, special_features, recommended_uses, included_components. Add more if relevant.
10. STRICT character limits — count characters carefully
11. ALL content in ${language}
12. Only return valid JSON, no markdown fences or explanation`
}

// --- Listing Generation Function ---

export async function generateListing(
  input: ListingGenerationInput
): Promise<{ result: ListingGenerationResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildListingGenerationPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'Generation Failed: Response was cut off due to token limit. Try reducing the number of product attributes or simplifying the product name.'
    )
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonText = stripMarkdownFences(text)

  const result = JSON.parse(jsonText) as ListingGenerationResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Section Refinement (Phase 5: Modular Chats) ---

import type { ChatMessage } from '@/types/api'

export interface SectionRefinementInput {
  sectionType: string
  sectionLabel: string
  currentVariations: string[]
  selectedVariationIndex: number
  charLimit: number
  userMessage: string
  approvedSections: Array<{ label: string; selectedText: string }>
  productName: string
  brand: string
  categoryName: string
  countryName: string
  language: string
  previousMessages: ChatMessage[]
}

function buildSectionRefinementPrompt(input: SectionRefinementInput): string {
  const {
    sectionLabel, currentVariations, selectedVariationIndex, charLimit,
    userMessage, approvedSections, productName, brand, categoryName,
    countryName, language, previousMessages,
  } = input

  let contextBlock = ''
  if (approvedSections.length > 0) {
    contextBlock = `=== APPROVED LISTING CONTEXT (maintain consistency with these) ===
${approvedSections.map((s) => `${s.label}:\n${s.selectedText}`).join('\n\n')}

`
  }

  let chatHistory = ''
  if (previousMessages.length > 0) {
    chatHistory = `=== PREVIOUS CONVERSATION ===
${previousMessages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

`
  }

  const variationsBlock = currentVariations
    .map((v, i) =>
      `Variation ${i + 1}${i === selectedVariationIndex ? ' (CURRENTLY SELECTED)' : ''}:\n${v}`
    )
    .join('\n\n')

  return `You are an expert Amazon listing copywriter. Refine the "${sectionLabel}" section based on the user's request.

=== PRODUCT INFO ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
Marketplace: ${countryName}
Language: ALL content MUST be in ${language}

${contextBlock}${chatHistory}=== CURRENT VARIATIONS ===
${variationsBlock}

=== CHARACTER LIMIT ===
${charLimit} characters max — the refined version MUST stay under this limit.

=== USER REQUEST ===
${userMessage}

=== INSTRUCTIONS ===
1. Consider the user's request carefully
2. Reference the currently selected variation as your starting point
3. Maintain consistency with approved sections shown above
4. Create a refined version that addresses the user's feedback
5. Stay strictly under ${charLimit} characters
6. Keep the same language (${language})
7. Return ONLY the refined text — no explanation, no JSON, no markdown fences`
}

export async function refineSection(
  input: SectionRefinementInput
): Promise<{ refinedText: string; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildSectionRefinementPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { refinedText: text, model, tokensUsed }
}

// --- Competitor Analysis ---

function buildCompetitorAnalysisPrompt(
  competitors: Array<{ title: string; bullets: string[]; description: string }>,
  categoryName: string,
  countryName: string
): string {
  const competitorTexts = competitors
    .map((c, i) => {
      const bullets = c.bullets.map((b, j) => `  Bullet ${j + 1}: ${b}`).join('\n')
      return `--- Competitor ${i + 1} ---
Title: ${c.title}
Bullets:
${bullets}
Description: ${c.description}`
    })
    .join('\n\n')

  return `You are an expert Amazon listing strategist. Analyze the following ${competitors.length} competitor listings for the "${categoryName}" category in the "${countryName}" marketplace.

=== COMPETITOR LISTINGS ===
${competitorTexts}

=== TASK ===
Perform a COMPREHENSIVE competitive analysis. Identify patterns, gaps, and opportunities.

Return a JSON object with this EXACT structure:
{
  "executiveSummary": "<3-5 sentences: key competitive landscape insights, primary opportunity, biggest gap to exploit>",
  "competitors": [
    { "title": "competitor title", "bullets": ["bullet1",...], "description": "competitor description" }
  ],
  "titlePatterns": [
    { "pattern": "pattern description", "frequency": <how many competitors use it>, "example": "example from a competitor" }
  ],
  "bulletThemes": [
    { "theme": "theme description", "frequency": <how many competitors mention it>, "examples": ["example 1", "example 2"] }
  ],
  "featureComparisonMatrix": [
    { "feature": "feature name", "competitors": { "Comp 1": true/false/"specific value", "Comp 2": true/false/"value" } }
  ],
  "differentiationGaps": [
    { "gap": "what competitors miss", "opportunity": "how to exploit this", "priority": "CRITICAL/HIGH/MEDIUM/LOW" }
  ],
  "usps": [
    { "usp": "unique selling proposition", "evidence": "why this is a USP", "competitorWeakness": "specific weakness to exploit" }
  ]
}

Rules:
1. Identify at least 5-8 title patterns (common structures, keyword placements, brand patterns)
2. Identify at least 6-10 bullet themes (recurring topics across competitors)
3. Feature comparison matrix should cover 8-12 features
4. Find at least 4-6 differentiation gaps
5. Suggest at least 3-5 USPs based on competitor weaknesses
6. Only return valid JSON, no markdown fences or explanation`
}

export async function analyzeCompetitors(
  competitors: Array<{ title: string; bullets: string[]; description: string }>,
  categoryName: string,
  countryName: string
): Promise<{ result: import('@/types/api').CompetitorAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildCompetitorAnalysisPrompt(competitors, categoryName, countryName)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as import('@/types/api').CompetitorAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Q&A Coverage Verification ---

function buildQnAVerificationPrompt(
  listingText: Record<string, string>,
  qnaAnalysis: QnAAnalysisResult
): string {
  const listingContent = Object.entries(listingText)
    .map(([key, val]) => `${key}: ${val}`)
    .join('\n\n')

  const concerns = qnaAnalysis.customerConcerns
    ?.map((c) => `- ${c.concern} (frequency: ${c.frequency})`)
    .join('\n') || 'N/A'

  const gaps = qnaAnalysis.contentGaps
    ?.map((g) => `- ${g.gap} (${g.importance})`)
    .join('\n') || 'N/A'

  const themes = qnaAnalysis.themes
    ?.map((t) => t.sampleQuestions?.map((q) => `- [${t.theme}] ${q}`).join('\n'))
    .filter(Boolean)
    .join('\n') || 'N/A'

  return `You are an expert Amazon listing quality auditor. Verify how well the following listing addresses customer questions and concerns from Q&A data.

=== LISTING CONTENT ===
${listingContent}

=== CUSTOMER CONCERNS FROM Q&A ===
${concerns}

=== CONTENT GAPS FROM Q&A ===
${gaps}

=== SAMPLE CUSTOMER QUESTIONS ===
${themes}

=== TASK ===
For each customer concern and question, check if the listing addresses it — fully, partially, or not at all. Be thorough and specific.

Return a JSON object with this EXACT structure:
{
  "overallScore": <1-10 score for Q&A coverage>,
  "totalQuestions": <total concerns/gaps checked>,
  "addressedCount": <fully addressed>,
  "partiallyAddressedCount": <partially addressed>,
  "unaddressedCount": <not addressed>,
  "coverageMatrix": [
    {
      "question": "the customer concern or question",
      "addressed": true/false,
      "partially": true/false,
      "addressedIn": "Title / Bullet 1 / Description / null",
      "excerpt": "the specific text that addresses it, or null",
      "recommendation": "how to address this gap, or null if fully addressed"
    }
  ]
}

Rules:
1. Check EVERY concern and content gap, not just a sample
2. "addressed" = the listing clearly answers/addresses this concern
3. "partially" = the listing touches on it but doesn't fully answer
4. "addressedIn" = which section of the listing addresses it
5. "excerpt" = the specific phrase/sentence that addresses it
6. "recommendation" = what to add/change if not fully addressed, including WHICH section to update
7. Only return valid JSON, no markdown fences or explanation`
}

export async function verifyQnACoverage(
  listingText: Record<string, string>,
  qnaAnalysis: QnAAnalysisResult
): Promise<{ result: import('@/types/api').QnACoverageResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildQnAVerificationPrompt(listingText, qnaAnalysis)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as import('@/types/api').QnACoverageResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Image Stack Recommendations ---

function buildImageStackRecommendationPrompt(
  categoryName: string,
  keywordAnalysis?: KeywordAnalysisResult | null,
  reviewAnalysis?: ReviewAnalysisResult | null,
  qnaAnalysis?: QnAAnalysisResult | null
): string {
  let researchContext = ''

  if (keywordAnalysis) {
    const features = keywordAnalysis.featureDemand
      ?.slice(0, 8)
      .map((f) => `${f.feature} (${f.priority}, SV: ${f.totalSearchVolume})`)
      .join('\n  ') || 'N/A'
    const surfaces = keywordAnalysis.surfaceDemand
      ?.slice(0, 6)
      .map((s) => `${s.surfaceType} (SV: ${s.totalSearchVolume})`)
      .join(', ') || 'N/A'
    const intents = keywordAnalysis.customerIntentPatterns
      ?.slice(0, 6)
      .map((p) => `${p.category} (${p.priority})`)
      .join(', ') || 'N/A'
    researchContext += `\n=== KEYWORD INTELLIGENCE ===
Feature demand:\n  ${features}
Surface/application demand: ${surfaces}
Customer intents: ${intents}\n`
  }

  if (reviewAnalysis) {
    const strengths = reviewAnalysis.strengths
      ?.slice(0, 6)
      .map((s) => `${s.strength} (${s.mentions} mentions, ${s.impact})`)
      .join('\n  ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.slice(0, 8)
      .map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.slice(0, 4)
      .map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    const imageOps = reviewAnalysis.imageOptimizationOpportunities
      ?.map((o) => `${o.imageType}: ${o.rationale} (Evidence: ${o.reviewEvidence})`)
      .join('\n  ') || ''
    const imageOpsStr = imageOps ? `\nImage optimization opportunities from reviews:\n  ${imageOps}` : ''
    researchContext += `\n=== CUSTOMER REVIEW INSIGHTS ===
Strengths:\n  ${strengths}
Use cases: ${useCases}
Weaknesses to address: ${weaknesses}${imageOpsStr}\n`
  }

  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 6)
      .map((c) => `${c.concern} (frequency: ${c.frequency})`)
      .join(', ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.slice(0, 5)
      .map((g) => `${g.gap} (${g.importance})`)
      .join(', ') || 'N/A'
    researchContext += `\n=== Q&A CUSTOMER CONCERNS ===
Top concerns: ${concerns}
Content gaps: ${gaps}\n`
  }

  if (!researchContext) {
    researchContext = '\nNo research data available. Use general Amazon secondary image best practices.\n'
  }

  return `You are an expert Amazon listing image strategist. Based on research data, recommend the optimal 9 secondary image types for position 2-10 of an Amazon listing.

Category: ${categoryName}
${researchContext}
=== TASK ===
Recommend exactly 9 image types for secondary image positions (2-10). Each recommendation should be data-driven — backed by keyword demand, review insights, or customer Q&A patterns.

Standard secondary image types to consider (adapt and prioritize based on data):
- Lifestyle/In-Use, Key Features Infographic, How-To/Usage Guide
- Size/Dimensions/Contents, Materials/Quality Close-up, Comparison Chart
- Benefits Infographic, Social Proof/Trust, Brand Story
- Before/After, Multi-Surface Demo, Color Chart, Bundle/Contents Flatlay
- Problem/Solution, Warranty/Guarantee, User-Generated Style

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "overallStrategy": "2-3 sentence strategic rationale for the recommended image stack",
  "recommendations": [
    {
      "position": 1,
      "recommendedType": "Image type name",
      "rationale": "Why this image type at this position — cite specific research data",
      "evidence": {
        "keywordSignals": ["relevant keyword 1", "relevant keyword 2"],
        "reviewMentions": <number of relevant review mentions>,
        "qnaQuestions": <number of relevant Q&A questions>
      },
      "confidence": "HIGH/MEDIUM/LOW"
    }
  ]
}

Rules:
1. Position 1 should be the highest-impact image (first thing after main image)
2. Prioritize: features with high keyword demand > review pain points > Q&A gaps
3. Vary image types — don't recommend 3 infographics in a row
4. Consider the psychological flow: hook → features → proof → trust → brand
5. Cite specific data from the research to justify each recommendation
6. Only return valid JSON, no markdown fences or explanation`
}

export async function generateImageStackRecommendations(
  categoryName: string,
  keywordAnalysis?: KeywordAnalysisResult | null,
  reviewAnalysis?: ReviewAnalysisResult | null,
  qnaAnalysis?: QnAAnalysisResult | null
): Promise<{ result: import('@/types/api').ImageStackRecommendationsResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildImageStackRecommendationPrompt(categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as import('@/types/api').ImageStackRecommendationsResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Analysis Functions ---

export async function analyzeKeywords(
  csvContent: string,
  categoryName: string,
  countryName: string
): Promise<{ result: KeywordAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildKeywordAnalysisPrompt(csvContent, categoryName, countryName)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as KeywordAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

export async function analyzeReviews(
  csvContent: string,
  categoryName: string,
  countryName: string
): Promise<{ result: ReviewAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildReviewAnalysisPrompt(csvContent, categoryName, countryName)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as ReviewAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

export async function analyzeQnA(
  csvContent: string,
  categoryName: string,
  countryName: string,
  isRufus: boolean
): Promise<{ result: QnAAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildQnAAnalysisPrompt(csvContent, categoryName, countryName, isRufus)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as QnAAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Pre-Analyzed File Conversion ---

const ANALYSIS_JSON_SCHEMAS: Record<string, string> = {
  keyword_analysis: `{
  "executiveSummary": "string",
  "summary": { "totalKeywords": number, "totalSearchVolume": number, "dataQuality": "string" },
  "keywordDistribution": { "high": { "count": 0, "totalVolume": 0, "avgRelevancy": 0 }, "medium": {...}, "low": {...} },
  "highRelevancy": [{ "keyword": "", "searchVolume": 0, "relevancy": 0.0, "strategicValue": 0, "strategicPlacement": "TITLE/Bullet 1/etc" }],
  "mediumRelevancy": [same shape],
  "lowRelevancy": [same shape],
  "keywordThemes": [{ "dimension": "Surface/Feature/Color/etc", "themes": [{ "name": "", "keywordCount": 0, "totalSearchVolume": 0 }] }],
  "customerIntentPatterns": [{ "category": "", "keywordCount": 0, "totalSearchVolume": 0, "priority": "HIGH/MEDIUM/LOW", "painPoints": "", "opportunity": "" }],
  "surfaceDemand": [{ "surfaceType": "", "keywordCount": 0, "totalSearchVolume": 0 }],
  "featureDemand": [{ "feature": "", "keywordCount": 0, "totalSearchVolume": 0, "priority": "CRITICAL/HIGH/MEDIUM/LOW" }],
  "competitiveIntelligence": { "brandPresence": [{ "brand": "", "searchVolume": 0 }], "featureDifferentiation": [""], "marketGaps": [""] },
  "titleKeywords": [""], "bulletKeywordMap": [{ "bulletNumber": 1, "keywords": [""], "focus": "" }], "bulletKeywords": [""], "searchTermKeywords": [""],
  "rufusQuestionAnticipation": [""],
  "marketOpportunity": { "totalAddressableMarket": 0, "primaryTargetMarket": 0, "competitionLevel": "", "growthPotential": "" }
}`,
  review_analysis: `{
  "executiveSummary": "string",
  "summary": { "totalReviews": number, "averageRating": float, "positivePercent": number, "negativePercent": number },
  "ratingDistribution": [{ "stars": 5, "count": 0, "percentage": 0.0, "sentiment": "" }],
  "customerProfiles": [{ "profile": "", "mentions": 0, "description": "" }],
  "useCases": [{ "useCase": "", "frequency": 0, "priority": "CRITICAL/HIGH/MEDIUM/LOW" }],
  "strengths": [{ "strength": "", "mentions": 0, "impact": "PRIMARY DIFFERENTIATOR/CRITICAL FEATURE/etc" }],
  "weaknesses": [{ "weakness": "", "mentions": 0, "impact": "CRITICAL ISSUE/RELIABILITY FAILURE/etc" }],
  "positiveLanguage": [{ "word": "", "frequency": 0, "optimizationValue": "" }],
  "negativeLanguage": [{ "word": "", "frequency": 0, "issueToAddress": "" }],
  "productNouns": [{ "noun": "", "frequency": 0, "listingIntegration": "" }],
  "crossProductAnalysis": [{ "productId": "", "reviewCount": 0, "positiveRate": 0, "negativeRate": 0, "performanceRating": "" }],
  "bulletStrategy": [{ "bulletNumber": 1, "focus": "", "evidence": "", "priority": "HIGH/MEDIUM", "customerPainPoint": "" }],
  "imageOptimizationOpportunities": [{ "imageType": "", "rationale": "", "reviewEvidence": "" }],
  "competitivePositioning": { "marketGaps": [{ "gap": "", "customerNeed": "", "opportunity": "" }], "messagingFramework": { "primaryMessage": "", "supportPoints": [""], "proofPoints": [""], "riskReversal": "" } },
  "customerVoicePhrases": { "positiveEmotional": [""], "functional": [""], "useCaseLanguage": [""] }
}`,
  qna_analysis: `{
  "executiveSummary": "string",
  "summary": { "totalQuestions": number, "topConcerns": [""] },
  "productSpecsConfirmed": [{ "spec": "", "value": "", "source": "" }],
  "themes": [{ "theme": "", "questionCount": 0, "priority": "HIGH/MEDIUM/LOW", "percentageOfTotal": 0, "sampleQuestions": [""] }],
  "contradictions": [{ "topic": "", "conflictingAnswers": [""], "impact": "", "resolution": "" }],
  "customerConcerns": [{ "concern": "", "frequency": 0, "addressInListing": true, "suggestedResponse": "" }],
  "contentGaps": [{ "gap": "", "importance": "CRITICAL/HIGH/MEDIUM/LOW", "priorityScore": 0, "customerImpact": "", "recommendation": "" }],
  "confirmedFeatures": { "positive": [{ "feature": "", "evidence": "" }], "limitations": [{ "limitation": "", "evidence": "" }] },
  "questionTypeBreakdown": [{ "type": "", "count": 0, "percentage": 0, "recommendation": "" }],
  "highRiskQuestions": [{ "question": "", "risk": "", "defensiveAction": "" }],
  "faqForDescription": [{ "question": "", "answer": "" }],
  "competitiveDefense": { "brandProtectionOpportunities": [""], "informationGapAdvantages": [""] },
  "rufusOptimizationScore": { "score": 0, "maxScore": 5, "strengths": [""], "improvements": [""] }
}`,
}

/**
 * Convert a pre-analyzed text/markdown file into the structured JSON format.
 * This is a lightweight AI call (~2K tokens) compared to full analysis (~200K tokens).
 */
export async function convertAnalysisFile(
  content: string,
  analysisType: string
): Promise<{ result: Record<string, unknown>; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const schema = ANALYSIS_JSON_SCHEMAS[analysisType] || ANALYSIS_JSON_SCHEMAS.keyword_analysis

  // Truncate content if very large (analysis files shouldn't be huge, but just in case)
  const maxContentChars = 100_000
  const truncatedContent = content.length > maxContentChars
    ? content.slice(0, maxContentChars) + '\n\n[... truncated]'
    : content

  const prompt = `Convert the following analysis document into the exact JSON structure below. Extract all relevant data from the document and map it to the correct fields. If a field's data is not present in the document, use reasonable defaults (0 for numbers, empty arrays for lists).

TARGET JSON STRUCTURE:
${schema}

ANALYSIS DOCUMENT:
${truncatedContent}

Return ONLY valid JSON, no markdown fences or explanation.`

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as Record<string, unknown>
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

/**
 * Merge two completed analysis results (JSON-to-JSON) into a single comprehensive analysis.
 * Much cheaper than re-analyzing raw files — just merging two structured JSON objects via AI.
 */
export async function mergeAnalysisResults(
  csvAnalysis: Record<string, unknown>,
  fileAnalysis: Record<string, unknown>,
  analysisType: string,
  categoryName: string,
  countryName: string
): Promise<{ result: Record<string, unknown>; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const schema = ANALYSIS_JSON_SCHEMAS[analysisType] || ANALYSIS_JSON_SCHEMAS.keyword_analysis

  const csvJson = JSON.stringify(csvAnalysis, null, 2)
  const fileJson = JSON.stringify(fileAnalysis, null, 2)

  const prompt = `You have TWO completed analyses for ${categoryName} (${countryName}) that must be merged into a single comprehensive result.

SOURCE 1 — CSV ANALYSIS (from raw data, AI-generated):
${csvJson}

SOURCE 2 — IMPORTED ANALYSIS (from pre-analyzed file):
${fileJson}

MERGE INSTRUCTIONS:
1. Combine both sources into one comprehensive analysis
2. For arrays (keywords, strengths, concerns, etc.): merge and deduplicate — keep items from BOTH sources
3. For numerical summaries (totals, counts): use the HIGHER/more comprehensive value
4. For strategic fields (priorities, recommendations): keep the strongest/most actionable from either source
5. For keyword lists (titleKeywords, bulletKeywords, searchTermKeywords): union both lists, deduplicate, keep the most relevant
6. Remove exact duplicates but keep items that are similar but distinct

TARGET JSON STRUCTURE:
${schema}

Return ONLY valid JSON, no markdown fences or explanation.`

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as Record<string, unknown>
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Phase 10: A+ Content Generation ---

export interface APlusGenerateInput {
  templateType: string
  productName: string
  brand: string
  categoryName: string
  researchContext: string
}

const APLUS_TEMPLATES: Record<string, string> = {
  hero_banner: `{
  "headline": "compelling headline (max 80 chars)",
  "subheadline": "supporting subheadline (max 120 chars)",
  "description": "2-3 sentence description highlighting key value proposition",
  "cta_text": "short call-to-action text (max 30 chars)"
}`,
  comparison_chart: `{
  "columns": [
    { "header": "Product variant or competitor name", "features": ["feature 1 value", "feature 2 value", "feature 3 value", "feature 4 value", "feature 5 value"] }
  ]
}
Generate 3-4 columns comparing the product against competitors or comparing product variants. Include 5-6 feature rows.`,
  feature_grid: `{
  "features": [
    { "title": "short feature name (max 40 chars)", "description": "1-2 sentence feature description" }
  ]
}
Generate 4-5 key features that address customer needs.`,
  technical_specs: `{
  "specs": [
    { "label": "specification name", "value": "specification value" }
  ]
}
Generate 8-12 relevant technical specifications.`,
  usage_scenarios: `{
  "scenarios": [
    { "title": "scenario name (max 50 chars)", "description": "1-2 sentence scenario description showing product in use" }
  ]
}
Generate 4-6 real-world usage scenarios.`,
  brand_story: `{
  "headline": "brand story headline (max 80 chars)",
  "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "cta_text": "call-to-action text (max 30 chars)"
}
Write a compelling brand story with 2-3 paragraphs.`,
}

export async function generateAPlusContent(input: APlusGenerateInput): Promise<{
  content: Record<string, unknown>
  model: string
  tokensUsed: number
}> {
  const client = await getClient()
  const model = await getModel()

  const templateSchema = APLUS_TEMPLATES[input.templateType] || APLUS_TEMPLATES.feature_grid

  const prompt = `You are an expert Amazon A+ Content writer. Generate compelling A+ content for the following product.

Product: ${input.brand} ${input.productName}
Category: ${input.categoryName}
Template Type: ${input.templateType.replace(/_/g, ' ')}

${input.researchContext ? `Research Context (use insights from this data):\n${input.researchContext}\n` : ''}

Generate content that:
- Is persuasive and customer-focused
- Highlights unique selling points
- Addresses common customer questions and concerns
- Uses clear, benefit-driven language
- Follows Amazon A+ Content best practices

Return ONLY valid JSON matching this exact schema:
${templateSchema}

Return ONLY the JSON object, no markdown, no explanation.`

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const content = JSON.parse(stripMarkdownFences(text)) as Record<string, unknown>
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { content, model, tokensUsed }
}

// --- Workshop: AI Image Prompt Generation ---

export interface WorkshopPromptInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
}

export interface WorkshopPromptResult {
  prompts: Array<{
    label: string
    prompt: string
    approach: string
  }>
  callout_suggestions: Array<{
    type: 'keyword' | 'benefit' | 'usp'
    text: string
  }>
}

function buildWorkshopPromptsPrompt(input: WorkshopPromptInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis } = input

  let researchContext = ''

  if (keywordAnalysis) {
    const topKeywords = keywordAnalysis.titleKeywords?.slice(0, 8).join(', ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.slice(0, 6)
      .map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'
    const surfaces = keywordAnalysis.surfaceDemand
      ?.slice(0, 5)
      .map((s) => `${s.surfaceType} (${s.totalSearchVolume} SV)`)
      .join(', ') || 'N/A'
    researchContext += `\n=== KEYWORD INTELLIGENCE ===
Top keywords customers search: ${topKeywords}
Key feature demand: ${features}
Surface/context demand: ${surfaces}\n`
  }

  if (reviewAnalysis) {
    const strengths = reviewAnalysis.strengths
      ?.slice(0, 6)
      .map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.slice(0, 6)
      .map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const posLang = reviewAnalysis.positiveLanguage
      ?.slice(0, 6)
      .map((w) => w.word)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.slice(0, 4)
      .map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER REVIEW INSIGHTS ===
Product strengths: ${strengths}
Top use cases: ${useCases}
Positive language: ${posLang}
Weaknesses to avoid showing: ${weaknesses}\n`
  }

  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 5)
      .map((c) => c.concern)
      .join(', ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.slice(0, 3)
      .map((g) => g.gap)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER Q&A CONCERNS ===
Top concerns: ${concerns}
Content gaps: ${gaps}\n`
  }

  if (!researchContext) {
    researchContext = '\nNo research data available. Use general best practices for Amazon product photography.\n'
  }

  return `You are an expert Amazon product photography director. Generate 12 diverse main image prompts for an Amazon listing.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}
=== TASK ===
Generate exactly 12 different main image prompts. Each must be a detailed, specific prompt suitable for AI image generation (DALL-E 3, Gemini, etc). The prompts are for the MAIN IMAGE on Amazon — the first image customers see in search results.

Amazon main image requirements: white background, product must be the focus, no text/graphics/watermarks on the image itself.

Each prompt MUST be meaningfully different — not just rephrased. Vary these dimensions:
1. Camera angle (front, 45-degree, top-down, slight tilt, eye-level)
2. Product presentation (single product, product with accessories, product open/in-use-pose, product with packaging)
3. Composition (centered, rule-of-thirds, close-up detail, full product with space)
4. Lighting style (studio flat, dramatic side light, soft diffused, high-key bright)
5. Visual storytelling (clean minimal, premium/luxury feel, practical/functional, colorful/vibrant)
6. Props/context hints (if allowed — e.g., the product resting on a surface that suggests use, hands holding it)

Use the research data to inform your prompts:
- Feature demand → emphasize those features visually
- Use cases → suggest compositions that hint at those use cases
- Strengths → make them visually obvious
- Customer concerns → address them visually (e.g., if "durability" is a concern, show robust construction)
- Positive language → inform the mood/feeling of the image

Also generate 3 callout text suggestions (these are text badges/overlays that go ON TOP of the image in post-production, NOT in the AI prompt):
1. A keyword-focused callout (most-searched term)
2. A benefit-focused callout (what customers love most)
3. A USP callout (what makes this product unique vs competitors)

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "prompts": [
    {
      "label": "Short 3-6 word description of this variation",
      "prompt": "Full detailed image generation prompt (50-150 words)",
      "approach": "one of: studio-clean, studio-premium, lifestyle, feature-closeup, bundle-flatlay, scale-reference, in-use, emotional, concern-address, brand-story, dramatic, minimal"
    }
  ],
  "callout_suggestions": [
    { "type": "keyword", "text": "The callout text (3-8 words)" },
    { "type": "benefit", "text": "The callout text (3-8 words)" },
    { "type": "usp", "text": "The callout text (3-8 words)" }
  ]
}`
}

// --- Secondary Image Prompts ---

export interface SecondaryPromptInput {
  productName: string
  brand: string
  categoryName: string
  listingTitle?: string | null
  bulletPoints?: string[]
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
}

export interface SecondaryConceptResult {
  concepts: Array<{
    position: number
    title: string
    headline: string
    sub_headline: string
    visual_reference: string
    hero_image: string
    supporting_visuals: string
    background: string
    unique_selling_point: string
    prompt: string
  }>
}

function buildSecondaryPromptsPrompt(input: SecondaryPromptInput): string {
  const { productName, brand, categoryName, listingTitle, bulletPoints, keywordAnalysis, reviewAnalysis, qnaAnalysis } = input

  let researchContext = ''

  if (keywordAnalysis) {
    const topKeywords = keywordAnalysis.titleKeywords?.slice(0, 8).join(', ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.slice(0, 6)
      .map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'
    researchContext += `\n=== KEYWORD INTELLIGENCE ===
Top keywords: ${topKeywords}
Key feature demand: ${features}\n`
  }

  if (reviewAnalysis) {
    const strengths = reviewAnalysis.strengths
      ?.slice(0, 6)
      .map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.slice(0, 6)
      .map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.slice(0, 4)
      .map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER REVIEW INSIGHTS ===
Strengths: ${strengths}
Use cases: ${useCases}
Weaknesses to address: ${weaknesses}\n`
  }

  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 5)
      .map((c) => c.concern)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER Q&A CONCERNS ===
Top concerns: ${concerns}\n`
  }

  let listingContext = ''
  if (listingTitle || (bulletPoints && bulletPoints.length > 0)) {
    listingContext = `\n=== LISTING CONTENT ===
Title: ${listingTitle || 'N/A'}
Bullet points:\n${bulletPoints?.map((b, i) => `${i + 1}. ${b}`).join('\n') || 'N/A'}\n`
  }

  if (!researchContext && !listingContext) {
    researchContext = '\nNo research data available. Use general best practices for Amazon secondary images.\n'
  }

  return `You are an expert Amazon listing image strategist. Generate 9 secondary image concepts for an Amazon product listing.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}${listingContext}
=== TASK ===
Generate exactly 9 secondary image concepts. These are the supporting images (positions 2-10) in an Amazon listing after the main image. Each concept should tell a different part of the product story.

Standard Amazon secondary image types to cover (adapt based on product):
1. Lifestyle/In-Use — Show the product being used in a real setting
2. Key Features Infographic — Highlight 4-6 key features with callout text
3. How It Works / How To Use — Step-by-step usage guide
4. Size/Dimensions/Contents — Show what's included, dimensions, scale reference
5. Materials/Ingredients/Quality — Close-up on quality, materials, certifications
6. Comparison/Why Choose Us — Compare vs competitors or alternatives
7. Benefits Infographic — Customer benefits with icons and supporting text
8. Social Proof/Awards/Trust — Certifications, awards, customer testimonials
9. Brand Story/Packaging — Brand values, packaging design, unboxing experience

For each concept, provide:
- A clear title describing the image type
- A bold headline (text overlay for the image, 5-10 words)
- A sub-headline (supporting tagline, 8-15 words)
- Visual reference description (layout, composition, scene)
- Hero image description (the main visual element)
- Supporting visuals (icons, badges, callouts)
- Background style/color
- Unique selling point this image communicates
- Full image generation prompt (50-150 words, suitable for DALL-E 3 / Gemini)

Use the research data to decide which features, benefits, and concerns to emphasize in each image.

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "concepts": [
    {
      "position": 1,
      "title": "Image type title",
      "headline": "Bold headline text for overlay",
      "sub_headline": "Supporting tagline text",
      "visual_reference": "Layout and composition description",
      "hero_image": "Main visual element description",
      "supporting_visuals": "Icons, badges, and callout descriptions",
      "background": "Background style and color",
      "unique_selling_point": "What this image communicates",
      "prompt": "Full detailed image generation prompt (50-150 words)"
    }
  ]
}`
}

export async function generateSecondaryImagePrompts(
  input: SecondaryPromptInput
): Promise<{ result: SecondaryConceptResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildSecondaryPromptsPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as SecondaryConceptResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Video Thumbnail Prompt Generation ---

export interface ThumbnailPromptInput {
  productName: string
  brand: string
  categoryName: string
  listingTitle?: string | null
  bulletPoints?: string[]
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
}

export interface ThumbnailConceptResult {
  concepts: Array<{
    position: number
    title: string
    approach: string
    description: string
    text_overlay: string
    prompt: string
  }>
}

function buildThumbnailPromptsPrompt(input: ThumbnailPromptInput): string {
  const { productName, brand, categoryName, listingTitle, bulletPoints, keywordAnalysis, reviewAnalysis, qnaAnalysis } = input

  let researchContext = ''

  if (keywordAnalysis) {
    const topKeywords = keywordAnalysis.titleKeywords?.slice(0, 8).join(', ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.slice(0, 6)
      .map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'
    researchContext += `\n=== KEYWORD INTELLIGENCE ===
Top keywords: ${topKeywords}
Key feature demand: ${features}\n`
  }

  if (reviewAnalysis) {
    const strengths = reviewAnalysis.strengths
      ?.slice(0, 6)
      .map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.slice(0, 6)
      .map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER REVIEW INSIGHTS ===
Strengths: ${strengths}
Use cases: ${useCases}\n`
  }

  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 5)
      .map((c) => c.concern)
      .join(', ') || 'N/A'
    researchContext += `\n=== CUSTOMER Q&A CONCERNS ===
Top concerns: ${concerns}\n`
  }

  let listingContext = ''
  if (listingTitle || (bulletPoints && bulletPoints.length > 0)) {
    listingContext = `\n=== LISTING CONTENT ===
Title: ${listingTitle || 'N/A'}
Bullet points:\n${bulletPoints?.map((b, i) => `${i + 1}. ${b}`).join('\n') || 'N/A'}\n`
  }

  if (!researchContext && !listingContext) {
    researchContext = '\nNo research data available. Use general best practices for Amazon product video thumbnails.\n'
  }

  return `You are an expert Amazon product video thumbnail designer. Generate 3 to 5 video thumbnail concepts for an Amazon product listing video.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}${listingContext}
=== TASK ===
Generate 3 to 5 video thumbnail concepts. These are static images used as the thumbnail/cover frame for product videos on Amazon. They must be eye-catching, clickable, and communicate a clear value proposition in under 1 second of viewing.

Each concept should use a DIFFERENT approach from this list:
1. Hero Shot — Product front-and-center with bold benefit text. High contrast, clean background.
2. Before/After — Split-screen showing transformation or problem-to-solution.
3. Lifestyle Action — Product in use, mid-action, conveying energy and real-world context.
4. Feature Callout — Close-up on 2-3 key features with annotation arrows or circles.
5. Unboxing/What's Included — Everything laid out, showing value and completeness.

Video thumbnail best practices:
- Visually distinct from the main listing image (different angle, background, energy)
- Text overlays are expected — suggest bold, short text (5-12 words)
- Bright, high-contrast colors for clickability in search results
- Show the product clearly but with MORE context/energy than the main image
- Consider mobile viewing: large text, clear focal point, high contrast
- 16:9 landscape orientation is standard for video thumbnails

Use research data to pick the most compelling angles:
- Feature demand → which features to spotlight
- Customer concerns → what to address visually
- Use cases → which scenario to show
- Strengths → what emotional tone to convey

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "concepts": [
    {
      "position": 1,
      "title": "Short descriptive title (3-6 words)",
      "approach": "one of: hero_shot, before_after, lifestyle_action, feature_callout, unboxing",
      "description": "What this thumbnail communicates and why (1-2 sentences)",
      "text_overlay": "Suggested bold text overlay for the thumbnail (5-12 words)",
      "prompt": "Full image generation prompt (50-150 words). Describe scene, composition, lighting, colors, product placement. Do NOT include text in the prompt — text overlays are added separately."
    }
  ]
}`
}

export async function generateVideoThumbnailPrompts(
  input: ThumbnailPromptInput
): Promise<{ result: ThumbnailConceptResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildThumbnailPromptsPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as ThumbnailConceptResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Swatch Image Prompt Generation ---

export interface SwatchPromptInput {
  productName: string
  brand: string
  categoryName: string
  variants: Array<{
    name: string
    color_hex?: string
    material?: string
    description?: string
  }>
}

export interface SwatchConceptResult {
  concepts: Array<{
    position: number
    variant_name: string
    prompt: string
  }>
}

function buildSwatchPromptsPrompt(input: SwatchPromptInput): string {
  const { productName, brand, categoryName, variants } = input

  const variantList = variants
    .map((v, i) => {
      const parts = [`${i + 1}. "${v.name}"`]
      if (v.color_hex) parts.push(`Hex: ${v.color_hex}`)
      if (v.material) parts.push(`Material: ${v.material}`)
      if (v.description) parts.push(`Description: ${v.description}`)
      return parts.join(' | ')
    })
    .join('\n')

  return `You are an expert Amazon product photography director specializing in swatch and variant images. Generate image prompts for product variant swatches.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}

=== VARIANTS ===
${variantList}

=== TASK ===
Generate one image prompt per variant. Each swatch image should:
- Show the product variant clearly with accurate color/material representation
- Use a clean, consistent white background for uniformity across all swatches
- Maintain the SAME camera angle, lighting, and composition across all variants
- Focus on the variant-defining characteristic (color, material, pattern, texture)
- Be suitable for a small swatch thumbnail (clear at 100x100px) AND full-size viewing
- If hex color provided, describe that exact color using vivid natural language
- If material provided, emphasize texture and material qualities in the prompt

Swatch image best practices:
- Consistent framing across all variants (same zoom, angle, crop)
- Soft, even studio lighting for true-to-life colors
- No text overlays on swatch images
- Product fills 60-80% of the frame
- Pure white (#FFFFFF) background
- Square 1:1 aspect ratio

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "concepts": [
    {
      "position": 1,
      "variant_name": "The variant name from input",
      "prompt": "Detailed image generation prompt (50-100 words). Describe exact color/material/texture, lighting setup, camera angle, background, and product presentation. Emphasize consistency with other variants."
    }
  ]
}`
}

export async function generateSwatchPrompts(
  input: SwatchPromptInput
): Promise<{ result: SwatchConceptResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildSwatchPromptsPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as SwatchConceptResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

export async function generateImagePrompts(
  input: WorkshopPromptInput
): Promise<{ result: WorkshopPromptResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildWorkshopPromptsPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as WorkshopPromptResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}
