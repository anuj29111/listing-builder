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
  spPromptInsights?: {
    totalPrompts: number
    relevantPrompts: number
    filteredOut: number
    promptThemes: Array<{
      theme: string
      count: number
      avgImpressions: number
      hasClicks: boolean
    }>
    topPerformingPrompts: Array<{
      prompt: string
      impressions: number
      clicks: number
      ctr: number
    }>
    contentGapsFromPrompts: Array<{
      prompt: string
      addressed: boolean
      recommendation: string
    }>
    suggestedListingImprovements: string[]
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

function buildQnAAnalysisPrompt(csvContent: string, categoryName: string, countryName: string, isRufus: boolean, hasSpPrompts: boolean = false): string {
  const { content, truncated, originalRows, keptRows } = truncateCSVContent(csvContent)
  const source = isRufus ? 'Amazon Rufus AI' : 'Amazon customer'
  const truncationNote = truncated
    ? `\n\nIMPORTANT: This is a representative sample of ${keptRows.toLocaleString()} out of ${originalRows.toLocaleString()} total Q&A pairs, evenly sampled. Scale counts proportionally.\n`
    : ''

  const spPromptsInstruction = hasSpPrompts ? `

The data also includes SP Prompts (Sponsored Products Prompts) from Amazon Ads. SP Prompts are questions Amazon's Rufus AI shows to shoppers in sponsored product placements. The SP Prompts section is in CSV format with columns including: Prompt details, Impressions, Clicks, CTR, Sales, etc.

CRITICAL — NICHE FILTERING: The SP Prompts file may contain prompts from MULTIPLE product categories. You MUST filter to ONLY those prompts relevant to the "${categoryName}" category/niche. Discard any prompts that are clearly about different product types (e.g., if analyzing chalk markers, discard prompts about canvas, toys, paints). Count and report how many were filtered out.

Add this section to your JSON output:
"spPromptInsights": {
  "totalPrompts": <total SP prompt rows in data>,
  "relevantPrompts": <count after niche filtering>,
  "filteredOut": <count discarded as irrelevant to ${categoryName}>,
  "promptThemes": [top 5 theme clusters from relevant prompts: {"theme":"tip variety/versatility/surface compatibility/etc","count":0,"avgImpressions":0,"hasClicks":true/false}],
  "topPerformingPrompts": [top 5 relevant prompts by impressions: {"prompt":"Does Chalkola have...","impressions":0,"clicks":0,"ctr":0.0}],
  "contentGapsFromPrompts": [gaps the SP prompts reveal that the listing should address: {"prompt":"sample prompt text","addressed":true/false,"recommendation":"specific listing improvement"}],
  "suggestedListingImprovements": ["3-5 specific listing improvements based on what Rufus is asking shoppers about in ad placements"]
}` : ''

  return `You are an expert Amazon listing optimization analyst conducting a COMPREHENSIVE Q&A analysis. Analyze the following ${source} Q&A data for the product category "${categoryName}" in the "${countryName}" marketplace.
${truncationNote}
The data is formatted as Q&A pairs (Q1:, A1:, Q2:, A2:, etc.).${hasSpPrompts ? ' The data also contains SP Prompts CSV data (see instructions below).' : ''}

Produce a DEEP, COMPREHENSIVE analysis. Analyze every angle: product specs confirmed from Q&A, surface/feature compatibility, contradictions in answers, 10+ information gaps with priority scores, confirmed features (positive and limitations), question type breakdown with percentages, high-risk questions for competitor ad placement, competitive defense strategy, and a Rufus AI optimization score.
${spPromptsInstruction}

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
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  optimizationMode?: 'new' | 'optimize_existing' | 'based_on_existing'
  existingListingText?: { title: string; bullets: string[]; description: string; reference_asin?: string } | null
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

// --- Shared helper: build competitive intelligence section from MI or legacy competitor data ---

function buildCompetitiveSection(
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null,
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null,
  options?: { sliceCaps?: boolean }
): string {
  const cap = options?.sliceCaps !== false // default true for listings, false for images
  // Prefer Market Intelligence over legacy competitor analysis
  if (marketIntelligence) {
    const mi = marketIntelligence
    const landscape = (cap ? mi.competitiveLandscape?.slice(0, 8) : mi.competitiveLandscape)
      ?.map((c) => `${c.brand} — Rating: ${c.avgRating}, Reviews: ${c.reviewCount}, Features: ${c.keyFeatures?.join(', ') || 'N/A'}`)
      .join('\n  ') || 'N/A'
    const titlePatterns = (cap ? mi.competitorPatterns?.titlePatterns?.slice(0, 5) : mi.competitorPatterns?.titlePatterns)
      ?.map((p) => `"${p.pattern}" (${p.frequency}x) — e.g. "${p.example}"`)
      .join('\n  ') || 'N/A'
    const bulletThemes = (cap ? mi.competitorPatterns?.bulletThemes?.slice(0, 6) : mi.competitorPatterns?.bulletThemes)
      ?.map((t) => `${t.theme} (${t.frequency}x)`)
      .join(', ') || 'N/A'
    const painPoints = (cap ? mi.topPainPoints?.slice(0, 5) : mi.topPainPoints)
      ?.map((p) => `${p.title}: ${p.description} (Impact: ${p.impactPercentage}%)`)
      .join('\n  ') || 'N/A'
    const segments = (cap ? mi.customerSegments?.slice(0, 4) : mi.customerSegments)
      ?.map((s) => `${s.name} (${s.ageRange}, ${s.occupation})`)
      .join('\n  ') || 'N/A'
    const messaging = mi.messagingFramework
    const msgStr = messaging
      ? `Primary: "${messaging.primaryMessage}"\n  Support: ${messaging.supportPoints?.join('; ') || 'N/A'}\n  Proof: ${messaging.proofPoints?.join('; ') || 'N/A'}`
      : 'N/A'
    const voicePhrases = mi.customerVoicePhrases
    const emotionalVoice = (cap ? voicePhrases?.positiveEmotional?.slice(0, 6) : voicePhrases?.positiveEmotional)
      ?.map((p) => `"${p}"`)
      .join(', ') || ''
    const functionalVoice = (cap ? voicePhrases?.functional?.slice(0, 6) : voicePhrases?.functional)
      ?.map((p) => `"${p}"`)
      .join(', ') || ''
    const pricing = mi.competitorPatterns?.pricingRange
    const pricingStr = pricing
      ? `$${pricing.min}-$${pricing.max} (avg $${pricing.average}, ${pricing.currency})`
      : 'N/A'
    const stratRecs = mi.strategicRecommendations
    const stratStr = stratRecs
      ? `Pricing: ${(cap ? stratRecs.pricing?.slice(0, 3) : stratRecs.pricing)?.join('; ') || 'N/A'}\n  Product: ${(cap ? stratRecs.product?.slice(0, 3) : stratRecs.product)?.join('; ') || 'N/A'}`
      : 'N/A'
    const imageRecs = mi.imageRecommendations?.join('\n  ') || ''
    const avatars = (cap ? mi.detailedAvatars?.slice(0, 3) : mi.detailedAvatars)
      ?.map((a) => `${a.name} (${a.role}) — ${a.keyMotivations}`)
      .join('\n  ') || ''

    let section = `
=== MARKET INTELLIGENCE ===
Executive Summary: ${mi.executiveSummary || 'N/A'}
Competitive landscape:
  ${landscape}
Competitor title patterns:
  ${titlePatterns}
Common bullet themes: ${bulletThemes}
Pricing range: ${pricingStr}
Top customer pain points:
  ${painPoints}
Customer segments:
  ${segments}
Messaging framework:
  ${msgStr}
Strategic recommendations:
  ${stratStr}`
    if (emotionalVoice || functionalVoice) {
      section += `\nCustomer voice phrases: ${emotionalVoice}${emotionalVoice && functionalVoice ? ', ' : ''}${functionalVoice}`
    }
    if (avatars) {
      section += `\nDetailed customer avatars:
  ${avatars}`
    }
    if (imageRecs) {
      section += `\nImage recommendations:
  ${imageRecs}`
    }
    return section
  }

  // Fallback: legacy competitor analysis
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
    return `
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

  return ''
}

// --- Listing Generation Prompt ---

function buildListingGenerationPrompt(input: ListingGenerationInput): string {
  const {
    productName, brand, asin, attributes, categoryName, countryName, language,
    charLimits, keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis,
    marketIntelligence, optimizationMode, existingListingText,
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

  const competitorSection = buildCompetitiveSection(competitorAnalysis, marketIntelligence, { sliceCaps: true })

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
  } else if (optimizationMode === 'based_on_existing' && existingListingText) {
    const bullets = existingListingText.bullets
      .map((b, i) => `  Bullet ${i + 1}: ${b}`)
      .join('\n')
    existingListingSection = `

=== REFERENCE PRODUCT LISTING ===
This content is from a SIMILAR/REFERENCE product${existingListingText.reference_asin ? ` (ASIN: ${existingListingText.reference_asin})` : ''}. The user is creating a listing for a DIFFERENT but similar product based on this reference.

Reference Title: ${existingListingText.title}
Reference Bullets:
${bullets}
Reference Description: ${existingListingText.description}

ADAPTATION INSTRUCTIONS:
1. Use this reference listing as INSPIRATION for structure, tone, and selling approach
2. DO NOT copy content verbatim — adapt everything for the product described in PRODUCT INFO above
3. Identify what makes the reference listing effective (keyword patterns, benefit framing, structure)
4. Apply those effective patterns to the new product's unique features and attributes
5. The new listing should be BETTER than the reference — improve keyword coverage, benefit clarity, and competitive positioning
6. If the products are similar (e.g., different size/color/pack count), adapt specifics while preserving proven phrasing patterns`
  }

  return `You are an expert Amazon listing copywriter. ${optimizationMode === 'optimize_existing' ? 'Optimize an existing' : optimizationMode === 'based_on_existing' ? 'Adapt and optimize a reference' : 'Generate an optimized'} product listing for the following product.

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
4. Use normal sentence case in bullets — NEVER use ALL CAPS for any words (except recognized acronyms like UV, LED, FDA). Amazon prohibits ALL CAPS. Start each bullet with a descriptive benefit phrase followed by a dash or colon, then details.
5. Each bullet must serve its planningMatrix purpose — no two bullets should overlap in primary focus
6. Description: 3 distinct variations (SEO, Benefit, Balanced)
7. Search terms: no brand name, no ASINs, space-separated, all lowercase. NO words already in title/bullets/description. No articles/prepositions. Use singular OR plural, not both. No subjective claims or temporary statements.
8. Subject matter: short descriptive phrases for Amazon's subject matter fields (3 fields, each under 50 chars)
9. Backend attributes: recommend values for ALL applicable Amazon backend fields based on research. Minimum 8 categories.
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

// --- Phased Generation (Cascading Keyword Waterfall) ---

import type { KeywordCoverage } from '@/types/database'
import type {
  TitlePhaseResult,
  BulletsPhaseResult,
  DescriptionPhaseResult,
  BackendPhaseResult,
} from '@/types/api'

/**
 * Extracts the shared context block (product info + research data) used by all 4 phases.
 * This is the full, untruncated research data — no cost optimization.
 */
function buildSharedContext(input: ListingGenerationInput): string {
  const {
    productName, brand, asin, attributes, categoryName, countryName, language,
    charLimits, keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis,
    marketIntelligence, optimizationMode, existingListingText,
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

  const competitorSection = buildCompetitiveSection(competitorAnalysis, marketIntelligence, { sliceCaps: true })

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
  } else if (optimizationMode === 'based_on_existing' && existingListingText) {
    const bullets = existingListingText.bullets
      .map((b, i) => `  Bullet ${i + 1}: ${b}`)
      .join('\n')
    existingListingSection = `

=== REFERENCE PRODUCT LISTING ===
This content is from a SIMILAR/REFERENCE product${existingListingText.reference_asin ? ` (ASIN: ${existingListingText.reference_asin})` : ''}. The user is creating a listing for a DIFFERENT but similar product based on this reference.

Reference Title: ${existingListingText.title}
Reference Bullets:
${bullets}
Reference Description: ${existingListingText.description}

ADAPTATION INSTRUCTIONS:
1. Use this reference listing as INSPIRATION for structure, tone, and selling approach
2. DO NOT copy content verbatim — adapt everything for the product described in PRODUCT INFO above
3. Identify what makes the reference listing effective (keyword patterns, benefit framing, structure)
4. Apply those effective patterns to the new product's unique features and attributes
5. The new listing should be BETTER than the reference — improve keyword coverage, benefit clarity, and competitive positioning
6. If the products are similar (e.g., different size/color/pack count), adapt specifics while preserving proven phrasing patterns`
  }

  return `=== PRODUCT INFO ===
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
Each Bullet Point: ${charLimits.bullet} characters max (${charLimits.bulletCount} bullets)
Description: ${charLimits.description} characters max
Search Terms: ${charLimits.searchTerms} characters max (backend only, not visible to customers)

=== KEYWORD INTELLIGENCE ===
${keywordSection}

=== CUSTOMER REVIEW INSIGHTS ===
${reviewSection}

=== Q&A / CUSTOMER CONCERNS ===
${qnaSection}${competitorSection}${existingListingSection}`
}

/**
 * Format keyword coverage tracker for inclusion in prompts.
 */
function formatKeywordCoverage(coverage: KeywordCoverage | null): string {
  if (!coverage) return ''

  const placedLines = coverage.placed
    .slice(0, 30)
    .map((kw) => `  - "${kw.keyword}" → ${kw.placedIn}${kw.position ? ` (${kw.position})` : ''} [SV: ${kw.searchVolume}, rel: ${kw.relevancy}]`)
    .join('\n')

  const highPriority = coverage.remaining.filter((kw) => kw.relevancy >= 0.6)
  const medPriority = coverage.remaining.filter((kw) => kw.relevancy >= 0.4 && kw.relevancy < 0.6)
  const lowPriority = coverage.remaining.filter((kw) => kw.relevancy < 0.4)

  let remainingLines = ''
  if (highPriority.length > 0) {
    remainingLines += `\n  HIGH PRIORITY (relevancy >= 0.6):\n${highPriority.map((kw) => `    - "${kw.keyword}" (SV: ${kw.searchVolume}, rel: ${kw.relevancy}) → ${kw.suggestedPlacement}`).join('\n')}`
  }
  if (medPriority.length > 0) {
    remainingLines += `\n  MEDIUM PRIORITY (relevancy 0.4-0.6):\n${medPriority.map((kw) => `    - "${kw.keyword}" (SV: ${kw.searchVolume}, rel: ${kw.relevancy}) → ${kw.suggestedPlacement}`).join('\n')}`
  }
  if (lowPriority.length > 0) {
    remainingLines += `\n  LOWER PRIORITY (relevancy < 0.4):\n${lowPriority.slice(0, 20).map((kw) => `    - "${kw.keyword}" (SV: ${kw.searchVolume}, rel: ${kw.relevancy}) → ${kw.suggestedPlacement}`).join('\n')}`
  }

  return `
=== KEYWORD PLACEMENT TRACKER ===
Current coverage score: ${coverage.coverageScore}/100

Keywords already placed (DO NOT waste space repeating these unless natural):
${placedLines || '  (none yet — this is the first phase)'}

Keywords still needing placement (PRIORITIZE these):${remainingLines || '\n  (all keywords placed — great coverage!)'}
`
}

// --- Phase 1: Title Generation ---

function buildTitlePhasePrompt(input: ListingGenerationInput): string {
  const shared = buildSharedContext(input)
  const { brand, charLimits, language } = input

  const minChars = charLimits.title - 15
  const targetChars = charLimits.title - 5

  return `You are an expert Amazon listing copywriter specializing in title optimization for A9/A10 algorithm ranking.

${shared}

=== YOUR TASK: GENERATE 5 TITLE VARIATIONS ===

Title is the HIGHEST WEIGHT element in Amazon's search algorithm. Every unused character is a WASTED keyword indexing opportunity.

**CRITICAL LENGTH REQUIREMENT — THIS IS THE #1 PRIORITY:**
- Amazon allows ${charLimits.title} characters for titles in this marketplace.
- Each title MUST be at least ${minChars} characters long. Titles under ${minChars} characters are UNACCEPTABLE and will be rejected.
- Target ${targetChars}-${charLimits.title} characters per title.
- After writing each title, COUNT its characters. If it's under ${minChars}, add more keywords, features, or specifications until it reaches ${minChars}+.
- Example: If your title is 140 characters, you have ${charLimits.title - 140} MORE characters to fill with valuable keywords. ADD THEM.

KEYWORD PLACEMENT PRIORITY:
- First 80 characters: Highest relevancy (0.8-1.0) and highest search volume keywords
- Characters 80-150: Medium-high relevancy keywords and key features
- Characters 150-${charLimits.title}: Additional keywords, specifications, use cases, materials, quantities
- All titles MUST start with "${brand}"

TECHNIQUES TO REACH ${minChars}+ CHARACTERS:
- Add product specifications (size, quantity, weight, dimensions)
- Add use cases ("for Home, Office, School, Kids, Adults")
- Add materials and features ("Non-Toxic, Washable, Premium Quality")
- Add who it's for ("for Artists, Beginners, Professionals")
- Use " - " or " | " separators to add keyword phrases
- Add pack/set information ("Set of 24", "48 Count Pack")

Generate 5 DISTINCT title variations:
1. **SEO-dense** — Maximum keyword packing. Stuff every high-volume term possible while maintaining readability.
2. **Benefit-focused** — Lead with customer benefits, weave keywords naturally, still hit ${minChars}+ chars.
3. **Balanced** — Keywords + benefits combined. Must still be ${minChars}+ characters.
4. **Feature-rich** — Highlight specific product features and specifications. Easy to fill ${minChars}+ with features.
5. **Long-tail** — Target long-tail keyword phrases and niche use cases. Fill the full ${charLimits.title} characters.

=== OUTPUT FORMAT ===
Return a JSON object with this EXACT structure:
{
  "titles": ["title 1 (MUST be ${minChars}-${charLimits.title} chars)", "title 2", "title 3", "title 4", "title 5"],
  "keywordCoverage": {
    "placed": [
      { "keyword": "keyword text", "searchVolume": 18000, "relevancy": 0.95, "placedIn": "title", "position": "first 80 chars" }
    ],
    "remaining": [
      { "keyword": "keyword text", "searchVolume": 5000, "relevancy": 0.7, "suggestedPlacement": "bullet_1" }
    ],
    "coverageScore": 25
  }
}

=== KEYWORD COVERAGE TRACKING RULES ===
1. In "placed": list EVERY keyword from the research data that appears in ANY of your 5 titles
2. In "remaining": list ALL keywords from the research data that are NOT in any title, with suggested placement for the next phase (bullets)
3. coverageScore: estimate 0-100 what % of total keyword value is covered by titles alone (typically 20-35%)
4. Use the keyword data from research to fill searchVolume and relevancy accurately
5. Be thorough — account for ALL keywords in the research data

=== RULES ===
1. ALL content in ${language}
2. MINIMUM ${minChars} characters per title. This is NON-NEGOTIABLE. Any title under ${minChars} characters is a failure. Count characters before finalizing.
3. Maximum ${charLimits.title} characters per title.
4. Only return valid JSON, no markdown fences or explanation`
}

export async function generateTitlePhase(
  input: ListingGenerationInput
): Promise<{ result: TitlePhaseResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildTitlePhasePrompt(input)
  const minChars = input.charLimits.title - 15
  const maxChars = input.charLimits.title

  let totalTokens = 0
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  // Try up to 2 rounds: initial generation + 1 retry for short titles
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 16384,
      messages,
    })

    if (response.stop_reason === 'max_tokens') {
      throw new Error('Title generation was cut off due to token limit. This should not happen — please report this issue.')
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

    const jsonText = stripMarkdownFences(text)
    const result = JSON.parse(jsonText) as TitlePhaseResult

    // Validate title lengths — LLMs are bad at counting characters
    const shortTitles = result.titles
      .map((t, i) => ({ index: i + 1, title: t, len: t.length }))
      .filter((t) => t.len < minChars)

    if (shortTitles.length === 0 || attempt === 1) {
      // Also enforce max length by trimming
      result.titles = result.titles.map((t) => t.length > maxChars ? t.slice(0, maxChars) : t)
      return { result, model, tokensUsed: totalTokens }
    }

    // Titles too short — send a follow-up asking to lengthen them
    const feedback = shortTitles
      .map((t) => `- Title ${t.index}: ${t.len} chars (NEED ${minChars}+)`)
      .join('\n')

    messages.push(
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `PROBLEM: ${shortTitles.length} of your titles are TOO SHORT. Amazon allows ${maxChars} characters and you are wasting keyword indexing space.\n\n${feedback}\n\nRewrite ALL 5 titles to be ${minChars}-${maxChars} characters each. Add more keywords, features, specifications, use cases, materials, or audience descriptors to fill the space. Return the same JSON format with the lengthened titles. Every character you don't use is a missed keyword opportunity.`,
      }
    )
  }

  // Should not reach here, but just in case
  throw new Error('Title generation failed after retry')
}

// --- Phase 2: Bullets Generation ---

function buildBulletsPhasePrompt(
  input: ListingGenerationInput,
  confirmedTitle: string,
  keywordCoverage: KeywordCoverage
): string {
  const shared = buildSharedContext(input)
  const coverageBlock = formatKeywordCoverage(keywordCoverage)
  const { charLimits, language } = input

  return `You are an expert Amazon listing copywriter. Generate bullet points that maximize keyword coverage while providing compelling, benefit-driven content.

${shared}

=== CONFIRMED TITLE (already finalized — reference for consistency) ===
${confirmedTitle}

${coverageBlock}

=== YOUR TASK: PLANNING MATRIX + 5 TO ${charLimits.bulletCount} BULLET POINTS ===

Bullet points have the SECOND HIGHEST weight in Amazon's search algorithm after title.

STEP 1 — PLANNING MATRIX:
BEFORE writing any content, create a planningMatrix. Determine the exact bullet count (minimum 5, maximum ${charLimits.bulletCount}) based on research depth. Only create bullets 6-${charLimits.bulletCount} if there are remaining critical keywords, Q&A gaps, or review themes that justify them. For each bullet, decide:
- What is the primary focus of this bullet?
- Which Q&A gaps does it address?
- Which review themes does it leverage?
- Which priority keywords from the "remaining" list MUST be woven in?
- What Rufus AI question types does it preemptively answer?

KEYWORD PLACEMENT PRIORITY FOR BULLETS:
- Bullets 1-2: High relevancy keywords (0.6-0.8) that didn't fit in title
- Bullets 3-4: Medium relevancy keywords (0.4-0.6)
- Bullet 5: Catch remaining medium keywords + address critical Q&A gaps
- Bullets 6-${charLimits.bulletCount} (ONLY IF NEEDED): Cover remaining low-medium keywords, Rufus AI questions, or underserved review themes

STEP 2 — GENERATE BULLETS:
For EACH bullet, generate exactly 3 distinct variations:
- Each variation must be a complete, well-optimized bullet that seamlessly blends SEO keywords with customer benefits
- Target length: 180-${charLimits.bullet} characters per variation (NEVER exceed ${charLimits.bullet})
- Each variation should use different keyword combinations, phrasings, or emphasis angles while covering the same planningMatrix focus
- All 3 variations should be polished and ready for use — not "SEO-only" or "benefit-only" versions

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
  "bullets": [
    ["Variation 1 for bullet 1 (180-${charLimits.bullet} chars)", "Variation 2 for bullet 1", "Variation 3 for bullet 1"]
  ],
  "keywordCoverage": {
    "placed": [
      { "keyword": "kw", "searchVolume": 5000, "relevancy": 0.7, "placedIn": "bullet_1", "position": "opening phrase" }
    ],
    "remaining": [
      { "keyword": "kw", "searchVolume": 1000, "relevancy": 0.3, "suggestedPlacement": "description" }
    ],
    "coverageScore": 65
  }
}

=== KEYWORD COVERAGE TRACKING RULES ===
1. In "placed": MERGE the previous placed keywords (from title) WITH new keywords placed in bullets. Include ALL previously placed keywords too.
2. In "remaining": only keywords that are in NEITHER title NOR any bullet
3. coverageScore: cumulative coverage (title + bullets), typically 55-70%
4. Be thorough — every keyword from research must appear in either placed or remaining

=== RULES ===
1. Use normal sentence case — NEVER use ALL CAPS for any words (except recognized acronyms like UV, LED, FDA). Amazon prohibits ALL CAPS in bullet points. Start each bullet with a descriptive benefit phrase followed by a dash or colon, then details.
2. Each bullet must serve its planningMatrix purpose — no two bullets should overlap in primary focus
3. Generate between 5 and ${charLimits.bulletCount} bullets based on research depth. Each bullet must have exactly 3 variations (as a JSON array of 3 strings). Only create bullets beyond 5 if there are enough remaining keywords, Q&A gaps, or review themes to justify them.
4. STRICT character limits — count characters carefully. NEVER exceed ${charLimits.bullet} characters per bullet variation. Target 180-${charLimits.bullet} characters.
5. ALL content in ${language}
6. Only return valid JSON, no markdown fences or explanation`
}

export async function generateBulletsPhase(
  input: ListingGenerationInput,
  confirmedTitle: string,
  keywordCoverage: KeywordCoverage
): Promise<{ result: BulletsPhaseResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildBulletsPhasePrompt(input, confirmedTitle, keywordCoverage)
  const maxChars = input.charLimits.bullet

  let totalTokens = 0
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  // Try up to 2 rounds: initial generation + 1 retry for over-limit bullets
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 32768,
      messages,
    })

    if (response.stop_reason === 'max_tokens') {
      throw new Error('Bullet generation was cut off due to token limit. Please report this issue.')
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

    const jsonText = stripMarkdownFences(text)
    const result = JSON.parse(jsonText) as BulletsPhaseResult

    // Normalize bullets to string[][] (handle legacy object format)
    result.bullets = result.bullets.map((bullet) => {
      if (Array.isArray(bullet)) return bullet as string[]
      const b = bullet as unknown as { seo?: string; benefit?: string; balanced?: string }
      return [b.seo || '', b.benefit || '', b.balanced || ''].filter(Boolean)
    })

    // Validate character lengths
    const overLimitBullets: { bulletNum: number; varIdx: number; len: number }[] = []
    result.bullets.forEach((variations, bulletIdx) => {
      variations.forEach((v, varIdx) => {
        if (v.length > maxChars) {
          overLimitBullets.push({ bulletNum: bulletIdx + 1, varIdx: varIdx + 1, len: v.length })
        }
      })
    })

    if (overLimitBullets.length === 0 || attempt === 1) {
      // Hard-trim any still-over variations on final attempt
      result.bullets = result.bullets.map((variations) =>
        variations.map((v) => v.length > maxChars ? v.slice(0, maxChars) : v)
      )
      return { result, model, tokensUsed: totalTokens }
    }

    // Bullets over limit — send follow-up asking to shorten
    const feedback = overLimitBullets
      .map((b) => `- Bullet ${b.bulletNum}, Variation ${b.varIdx}: ${b.len} chars (LIMIT: ${maxChars})`)
      .join('\n')

    messages.push(
      { role: 'assistant', content: text },
      {
        role: 'user',
        content: `PROBLEM: ${overLimitBullets.length} bullet variations EXCEED the ${maxChars} character limit.\n\n${feedback}\n\nRewrite ALL bullets ensuring EVERY variation is ${maxChars} characters or fewer. Trim wordiness, remove filler phrases, use shorter synonyms. Return the same JSON format with shortened bullets.`,
      }
    )
  }

  // Should not reach here, but just in case
  throw new Error('Bullet generation failed after retry')
}

// --- Phase 3: Description + Search Terms Generation ---

function buildDescriptionPhasePrompt(
  input: ListingGenerationInput,
  confirmedTitle: string,
  confirmedBullets: string[],
  keywordCoverage: KeywordCoverage
): string {
  const shared = buildSharedContext(input)
  const coverageBlock = formatKeywordCoverage(keywordCoverage)
  const { charLimits, language } = input

  const bulletsBlock = confirmedBullets
    .map((b, i) => `  Bullet ${i + 1}: ${b}`)
    .join('\n')

  return `You are an expert Amazon listing copywriter. Generate descriptions and search terms that capture ALL remaining keyword value not covered by the title and bullets.

${shared}

=== CONFIRMED CONTENT (already finalized — reference for consistency and keyword tracking) ===
Title: ${confirmedTitle}

Bullets:
${bulletsBlock}

${coverageBlock}

=== YOUR TASK: 3 DESCRIPTION VARIATIONS + 3 SEARCH TERM VARIATIONS ===

Description has THIRD HIGHEST weight in Amazon's algorithm. Search terms are pure backend — invisible to customers but fully indexed.

DESCRIPTION STRATEGY:
- Weave ALL remaining medium-relevancy keywords naturally into flowing paragraphs
- Address any Q&A gaps not yet covered by bullets
- Include use cases, scenarios, and contextual details from review analysis
- Make it readable and compelling — NOT keyword-stuffed
- ${charLimits.description} characters max

SEARCH TERMS STRATEGY:
- This is the FINAL SWEEP — catch EVERYTHING still missing
- ${charLimits.searchTerms} characters max
- STRICT Amazon Search Terms Rules:
  * Space-separated ONLY — NO commas, NO semicolons, NO punctuation
  * All lowercase
  * NO brand names, NO ASINs, NO product identifiers
  * NO words already used in title, bullets, or description (Amazon already indexes those — repeating wastes space)
  * Use singular OR plural of a word, NOT both (e.g., "marker" not "marker markers")
  * NO articles or prepositions (a, an, and, by, for, of, the, with, in, on, at)
  * NO subjective claims (amazing, best, cheap, premium, top, great, perfect, popular, trending)
  * NO temporary statements (new, on sale, limited time, available now, latest, just launched)
  * Include: misspellings, synonyms, long-tail variations, related terms
  * Include Spanish/foreign language variants if relevant to marketplace

=== OUTPUT FORMAT ===
Return a JSON object with this EXACT structure:
{
  "descriptions": ["SEO variation", "Benefit variation", "Balanced variation"],
  "searchTerms": ["variation 1", "variation 2", "variation 3"],
  "keywordCoverage": {
    "placed": [
      { "keyword": "kw", "searchVolume": 1000, "relevancy": 0.3, "placedIn": "description", "position": "first paragraph" }
    ],
    "remaining": [
      { "keyword": "kw", "searchVolume": 100, "relevancy": 0.1, "suggestedPlacement": "backend_attributes" }
    ],
    "coverageScore": 92
  }
}

=== KEYWORD COVERAGE TRACKING RULES ===
1. In "placed": MERGE all previously placed keywords (title + bullets) WITH new keywords placed in description + search terms
2. In "remaining": only keywords that are genuinely not placed anywhere — this should be very few or zero
3. coverageScore: cumulative (title + bullets + description + search terms), aim for 90%+
4. Search terms should push coverage toward 95%+

=== RULES ===
1. Description: 3 distinct variations (SEO-focused, Benefit-focused, Balanced). ${charLimits.description} chars max each.
2. Search terms: space-separated, no brand name, no ASINs, include misspellings and synonyms. ${charLimits.searchTerms} chars max each.
3. ALL content in ${language}
4. Only return valid JSON, no markdown fences or explanation`
}

export async function generateDescriptionPhase(
  input: ListingGenerationInput,
  confirmedTitle: string,
  confirmedBullets: string[],
  keywordCoverage: KeywordCoverage
): Promise<{ result: DescriptionPhaseResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildDescriptionPhasePrompt(input, confirmedTitle, confirmedBullets, keywordCoverage)

  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Description generation was cut off due to token limit. Please report this issue.')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonText = stripMarkdownFences(text)
  const result = JSON.parse(jsonText) as DescriptionPhaseResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Phase 4: Backend (Subject Matter + Backend Attributes) ---

function buildBackendPhasePrompt(
  input: ListingGenerationInput,
  confirmedTitle: string,
  confirmedBullets: string[],
  confirmedDescription: string,
  confirmedSearchTerms: string,
  keywordCoverage: KeywordCoverage
): string {
  const shared = buildSharedContext(input)
  const coverageBlock = formatKeywordCoverage(keywordCoverage)
  const { language } = input

  const bulletsBlock = confirmedBullets
    .map((b, i) => `  Bullet ${i + 1}: ${b}`)
    .join('\n')

  return `You are an expert Amazon listing optimizer specializing in backend attributes and product categorization.

${shared}

=== CONFIRMED CONTENT (all finalized sections) ===
Title: ${confirmedTitle}

Bullets:
${bulletsBlock}

Description: ${confirmedDescription}

Search Terms: ${confirmedSearchTerms}

${coverageBlock}

=== YOUR TASK: SUBJECT MATTER + BACKEND ATTRIBUTES ===

These are the final backend fields that help Amazon's systems categorize and surface your product.

SUBJECT MATTER:
- Short descriptive phrases for Amazon's subject matter fields
- 3 fields, each under 50 characters
- Generate 3 variations of each field

BACKEND ATTRIBUTES:
Based on ALL research data (keywords, reviews, Q&A, competitor analysis), recommend values for ALL applicable Amazon backend fields from the master list below. ONLY include fields relevant to this specific product category — skip any that are genuinely not applicable:

MASTER FIELD LIST:
- material, target_audience, special_features, recommended_uses, included_components
- subject_character, theme, style, model_number
- line_size, water_resistance_level, body_shape
- surface_recommendation, grip_type, hand_orientation
- ink_base, ink_color, point_type, marker_type
- age_range_description, educational_objective, skill_level
- pattern, color_map, finish_type, item_form
- power_source, voltage, wattage
- unit_count, item_weight, item_dimensions
- Add any other Amazon backend fields specific to this product category not listed above

RULES:
- Use natural language values that match how customers search
- Multi-value fields: provide up to 5 values in priority order
- Minimum 8 attribute categories for any product
- Data-driven: base values on actual customer language from research

=== OUTPUT FORMAT ===
Return a JSON object with this EXACT structure:
{
  "subjectMatter": [
    ["field 1 var 1", "field 1 var 2", "field 1 var 3"],
    ["field 2 var 1", "field 2 var 2", "field 2 var 3"],
    ["field 3 var 1", "field 3 var 2", "field 3 var 3"]
  ],
  "backendAttributes": {
    "material": ["value1", "value2"],
    "target_audience": ["value1", "value2"],
    "special_features": ["value1", "value2", "value3"],
    "recommended_uses": ["value1", "value2", "value3"],
    "included_components": ["value1"],
    "theme": ["value1"],
    "style": ["value1", "value2"],
    "surface_recommendation": ["value1", "value2"]
  },
  "keywordCoverage": {
    "placed": [],
    "remaining": [],
    "coverageScore": 97
  }
}

=== RULES ===
1. Subject matter: 3 fields × 3 variations, each under 50 chars
2. Backend attributes: data-driven recommendations based on research, at least 8 attribute categories (more for complex products)
3. keywordCoverage.placed: merge ALL previously placed keywords + any new ones captured in backend attributes
4. keywordCoverage.remaining: should be minimal — only truly irrelevant keywords
5. coverageScore: final cumulative score, aim for 95%+
6. ALL content in ${language}
7. Only return valid JSON, no markdown fences or explanation`
}

export async function generateBackendPhase(
  input: ListingGenerationInput,
  confirmedTitle: string,
  confirmedBullets: string[],
  confirmedDescription: string,
  confirmedSearchTerms: string,
  keywordCoverage: KeywordCoverage
): Promise<{ result: BackendPhaseResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildBackendPhasePrompt(input, confirmedTitle, confirmedBullets, confirmedDescription, confirmedSearchTerms, keywordCoverage)

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Backend attributes generation was cut off due to token limit. Please report this issue.')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonText = stripMarkdownFences(text)
  const result = JSON.parse(jsonText) as BackendPhaseResult
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
  qnaAnalysis?: QnAAnalysisResult | null,
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null,
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
): string {
  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
  })

  return `You are an expert Amazon listing image strategist. Based on research data, recommend the optimal 9 secondary image types for position 2-10 of an Amazon listing.

Category: ${categoryName}
${researchContext}
=== TASK ===
Recommend exactly 9 image types for secondary image positions (2-10). Each recommendation should be data-driven — backed by keyword demand, review insights, customer Q&A patterns, and competitor intelligence.

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
  qnaAnalysis?: QnAAnalysisResult | null,
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null,
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
): Promise<{ result: import('@/types/api').ImageStackRecommendationsResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildImageStackRecommendationPrompt(categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence)

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
  isRufus: boolean,
  hasSpPrompts: boolean = false
): Promise<{ result: QnAAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildQnAAnalysisPrompt(csvContent, categoryName, countryName, isRufus, hasSpPrompts)

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

// --- Market Intelligence Analysis (Standalone POC) ---

export interface MarketIntelligenceData {
  keyword: string
  keywords?: string[]
  marketplace: string
  searchResults: Array<{
    pos: number
    title: string
    asin: string
    price: number | null
    rating: number | null
    reviews_count: number | null
    is_prime: boolean
    sales_volume: string | null
  }>
  competitors: Array<{
    asin: string
    title: string
    brand: string
    price: number | null
    price_initial: number | null
    currency: string
    rating: number
    reviews_count: number
    bullet_points: string
    description: string
    product_overview: Array<{ title: string; description: string }>
    images: string[]
    is_prime_eligible: boolean
    amazon_choice: boolean
    deal_type: string | null
    coupon: string | null
    sales_volume: string | null
    sales_rank: unknown
    reviews: Array<{
      rating: number
      title: string
      content: string
      author: string
      is_verified: boolean
      helpful_count: number
    }>
  }>
  // Full reviews data (separate from inline product reviews)
  reviewsData?: Record<string, Array<{
    rating: number
    title: string
    content: string
    author: string
    is_verified: boolean
    helpful_count: number
    id?: string
    timestamp?: string
  }>>
  // Q&A data per product
  questionsData?: Record<string, Array<{
    question: string
    answer: string
    votes: number
    author?: string
    date?: string
  }>>
  marketStats: {
    avgPrice: number
    minPrice: number
    maxPrice: number
    avgRating: number
    totalReviews: number
    primePercentage: number
    amazonChoiceCount: number
    currency: string
  }
}

function buildCompetitorBlock(comp: MarketIntelligenceData['competitors'][0], idx: number): string {
  const reviews = (comp.reviews || [])
    .map(r => `    ${'\u2605'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} "${r.title}" — ${r.content?.slice(0, 300) || 'No content'}${r.content && r.content.length > 300 ? '...' : ''} — ${r.is_verified ? 'Verified' : 'Unverified'}, ${r.helpful_count} helpful`)
    .join('\n')

  const overview = (comp.product_overview || [])
    .map(o => `    ${o.title}: ${o.description}`)
    .join('\n')

  return `
--- Competitor ${idx + 1}: ${comp.asin} ---
Title: ${comp.title}
Brand: ${comp.brand || 'Unknown'} | Price: ${comp.currency || '$'}${comp.price ?? 'N/A'}${comp.price_initial ? ` (was ${comp.currency || '$'}${comp.price_initial})` : ''} | Rating: ${comp.rating ?? 'N/A'}/5 | Reviews: ${comp.reviews_count?.toLocaleString() ?? 'N/A'}
Prime: ${comp.is_prime_eligible ? 'Yes' : 'No'} | Amazon's Choice: ${comp.amazon_choice ? 'Yes' : 'No'}${comp.deal_type ? ` | Deal: ${comp.deal_type}` : ''}${comp.coupon ? ` | Coupon: ${comp.coupon}` : ''}${comp.sales_volume ? ` | Sales: ${comp.sales_volume}` : ''}

Bullet Points:
${comp.bullet_points || '  (none)'}

Description:
${comp.description?.slice(0, 1500) || '  (none)'}${comp.description && comp.description.length > 1500 ? '...' : ''}
${overview ? `\nProduct Overview:\n${overview}` : ''}
${reviews ? `\nTop Reviews (${comp.reviews?.length || 0}):\n${reviews}` : ''}`
}

function buildCompetitorBlockLight(comp: MarketIntelligenceData['competitors'][0], idx: number): string {
  const overview = (comp.product_overview || [])
    .map(o => `    ${o.title}: ${o.description}`)
    .join('\n')

  return `
--- Competitor ${idx + 1}: ${comp.asin} ---
Title: ${comp.title}
Brand: ${comp.brand || 'Unknown'} | Price: ${comp.currency || '$'}${comp.price ?? 'N/A'}${comp.price_initial ? ` (was ${comp.currency || '$'}${comp.price_initial})` : ''} | Rating: ${comp.rating ?? 'N/A'}/5 | Reviews: ${comp.reviews_count?.toLocaleString() ?? 'N/A'}
Prime: ${comp.is_prime_eligible ? 'Yes' : 'No'} | Amazon's Choice: ${comp.amazon_choice ? 'Yes' : 'No'}${comp.deal_type ? ` | Deal: ${comp.deal_type}` : ''}${comp.coupon ? ` | Coupon: ${comp.coupon}` : ''}${comp.sales_volume ? ` | Sales: ${comp.sales_volume}` : ''}

Bullet Points:
${comp.bullet_points || '  (none)'}

Description:
${comp.description?.slice(0, 1500) || '  (none)'}${comp.description && comp.description.length > 1500 ? '...' : ''}
${overview ? `\nProduct Overview:\n${overview}` : ''}`
}

// === 4-PHASE MARKET INTELLIGENCE ANALYSIS ===
// Phase 1: Review Deep-Dive → Phase 2: Q&A Analysis → Phase 3: Market & Competitive → Phase 4: Customer & Strategy

function buildMIPhase1ReviewsPrompt(data: MarketIntelligenceData): string {
  const keywordsLabel = data.keywords && data.keywords.length > 1
    ? data.keywords.join(', ')
    : data.keyword

  // Build review blocks per product — use full reviews if available, fallback to inline
  const reviewBlocks: string[] = []
  for (const comp of data.competitors) {
    const fullReviews = data.reviewsData?.[comp.asin] || comp.reviews || []
    if (fullReviews.length === 0) continue

    const reviewLines = fullReviews
      .map((r, i) => `  [${i + 1}] ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} "${r.title || ''}" — ${(r.content || '').slice(0, 400)}${r.content && r.content.length > 400 ? '...' : ''} — ${r.is_verified ? 'Verified' : 'Unverified'}${r.helpful_count > 0 ? `, ${r.helpful_count} helpful` : ''}`)
      .join('\n')

    reviewBlocks.push(`\n--- ${comp.asin} | ${comp.brand || 'Unknown'} — "${comp.title?.slice(0, 80)}" | ${comp.rating}/5 | ${comp.reviews_count?.toLocaleString() || '?'} total reviews ---\n${reviewLines}`)
  }

  const totalReviews = reviewBlocks.reduce((sum, block) => sum + (block.match(/\[(\d+)\]/g)?.length || 0), 0)

  return `You are an expert Amazon review analyst. Perform a deep-dive analysis of ${totalReviews} reviews across ${data.competitors.length} competing products for "${keywordsLabel}" on ${data.marketplace}.

=== REVIEWS BY PRODUCT ===
${reviewBlocks.join('\n')}

=== YOUR TASK: PHASE 1 — REVIEW DEEP-DIVE ===

Analyze EVERY review provided. This data is the foundation for all subsequent analysis phases. Be thorough and precise with counts.

Return a JSON object with this EXACT structure:
{
  "sentimentAnalysis": {
    "positive": <% of reviews that are positive (4-5 stars)>,
    "painPoints": <% of reviews mentioning problems/complaints>,
    "featureRequests": <% of reviews requesting features/improvements>,
    "totalReviews": ${totalReviews},
    "averageRating": <weighted average across all products>
  },
  "topPositiveThemes": [8-12 themes: {"theme":"Vibrant Colors","mentions":<exact count>}],
  "painPointsList": [8-12 pain points: {"theme":"Ink Runs","mentions":<exact count>}],
  "featureRequestsList": [5-10 feature requests: {"theme":"More Color Options","mentions":<count>}],
  "topPainPoints": [top 5-7 pain points: {"title":"...","description":"...","impactPercentage":<% of negative reviews>}],
  "primaryMotivations": [top 5-7 motivations: {"title":"...","description":"...","frequencyDescription":"Mentioned in X% of positive reviews"}],
  "buyingDecisionFactors": [top 6-8 ranked: {"rank":1,"title":"...","description":"..."}],
  "perProductSummaries": [one per product: {
    "asin":"<asin>",
    "brand":"<brand>",
    "title":"<product title>",
    "positiveThemes":["theme1","theme2","theme3"],
    "negativeThemes":["theme1","theme2"],
    "uniqueSellingPoints":["usp1","usp2"],
    "commonComplaints":["complaint1","complaint2"],
    "reviewCount":<reviews analyzed for this product>,
    "avgRating":<average rating for this product>
  }]
}

Be thorough. Every number MUST be grounded in the actual review data. Count real mentions.

Only return valid JSON, no markdown fences or explanation.`
}

function buildMIPhase2QnAPrompt(data: MarketIntelligenceData, phase1Summary: string): string {
  const keywordsLabel = data.keywords && data.keywords.length > 1
    ? data.keywords.join(', ')
    : data.keyword

  // Build Q&A blocks per product
  const qnaBlocks: string[] = []
  let totalQnAs = 0
  if (data.questionsData) {
    for (const comp of data.competitors) {
      const questions = data.questionsData[comp.asin] || []
      if (questions.length === 0) continue
      totalQnAs += questions.length

      const qLines = questions
        .map((q, i) => `  [${i + 1}] Q: ${q.question}\n       A: ${(q.answer || 'No answer').slice(0, 300)}${q.votes ? ` (${q.votes} votes)` : ''}`)
        .join('\n')

      qnaBlocks.push(`\n--- ${comp.asin} | ${comp.brand || 'Unknown'} — "${comp.title?.slice(0, 80)}" ---\n${qLines}`)
    }
  }

  const qnaSection = qnaBlocks.length > 0
    ? `=== Q&A DATA (${totalQnAs} questions across ${qnaBlocks.length} products) ===\n${qnaBlocks.join('\n')}`
    : '=== Q&A DATA ===\nNo Q&A data available for these products.'

  return `You are an expert Amazon market analyst. This is PHASE 2 of a 4-phase analysis for "${keywordsLabel}" on ${data.marketplace}.

=== PHASE 1 REVIEW SUMMARY ===
${phase1Summary}

${qnaSection}

=== YOUR TASK: PHASE 2 — Q&A ANALYSIS & CONTENT GAPS ===

Analyze all Q&A data to identify what customers ask before buying, what concerns they have, and what information gaps exist in competitor listings.

Return a JSON object with this EXACT structure:
{
  "topQuestions": [top 10-15 most important questions: {"question":"...","answer":"...","votes":<count>,"category":"Product Specs/Usage/Compatibility/Quality/Safety","asin":"<source asin>"}],
  "questionThemes": [5-8 question categories: {"theme":"Surface Compatibility","count":<questions about this>,"description":"Customers frequently ask about which surfaces these work on"}],
  "unansweredGaps": [5-8 gaps: {"gap":"...","importance":"CRITICAL/HIGH/MEDIUM","recommendation":"..."}],
  "buyerConcerns": [5-8 pre-purchase concerns: {"concern":"...","frequency":"Very Common/Common/Occasional","resolution":"How to address this in listing"}],
  "contentGaps": [5-8 content gaps competitors miss: {"gap":"...","importance":"CRITICAL/HIGH/MEDIUM","recommendation":"..."}]
}

If no Q&A data is available, derive gaps and concerns from the Phase 1 review analysis — what questions do reviews implicitly answer that should be in listings?

Only return valid JSON, no markdown fences or explanation.`
}

function buildMIPhase3MarketPrompt(data: MarketIntelligenceData, phase1Result: Record<string, unknown>, phase2Result: Record<string, unknown>): string {
  const keywordsLabel = data.keywords && data.keywords.length > 1
    ? data.keywords.join(', ')
    : data.keyword

  const searchLandscape = data.searchResults.slice(0, 20)
    .map(r => `  #${r.pos} | ${r.title?.slice(0, 80)} | ${r.asin} | $${r.price ?? 'N/A'} | ${r.rating ?? 'N/A'}★ | ${r.reviews_count?.toLocaleString() ?? '?'} reviews${r.is_prime ? ' | Prime' : ''}${r.sales_volume ? ` | ${r.sales_volume}` : ''}`)
    .join('\n')

  const competitorBlocks = data.competitors
    .map((c, i) => buildCompetitorBlockLight(c, i))
    .join('\n')

  return `You are an expert Amazon market intelligence analyst. This is PHASE 3 of a 4-phase analysis for "${keywordsLabel}" on ${data.marketplace}.

=== PHASE 1 RESULTS — REVIEW DEEP-DIVE ===
${JSON.stringify(phase1Result, null, 2)}

=== PHASE 2 RESULTS — Q&A ANALYSIS ===
${JSON.stringify(phase2Result, null, 2)}

=== SEARCH LANDSCAPE (Top 20 Organic Results) ===
${searchLandscape}

=== COMPETITOR PRODUCT DATA (${data.competitors.length} products) ===
${competitorBlocks}

=== MARKET STATS ===
Avg Price: ${data.marketStats.currency}${data.marketStats.avgPrice.toFixed(2)} | Range: ${data.marketStats.currency}${data.marketStats.minPrice.toFixed(2)}-${data.marketStats.currency}${data.marketStats.maxPrice.toFixed(2)}
Avg Rating: ${data.marketStats.avgRating.toFixed(1)}/5 | Total Reviews: ${data.marketStats.totalReviews.toLocaleString()} | Prime: ${data.marketStats.primePercentage.toFixed(0)}% | AC: ${data.marketStats.amazonChoiceCount}

=== YOUR TASK: PHASE 3 — MARKET & COMPETITIVE ANALYSIS ===

Using Phase 1 review insights, Phase 2 Q&A analysis, and the product listing data, analyze the competitive landscape.

Return a JSON object with this EXACT structure:
{
  "competitiveLandscape": [one per competitor: {"brand":"...","avgRating":<rating>,"reviewCount":<count>,"category":"...","keyFeatures":["f1","f2","f3"],"marketShare":"<estimated %>"}],
  "competitorPatterns": {
    "titlePatterns": [top 5: {"pattern":"Brand + Count + Type + Feature","frequency":<count>,"example":"<actual title>"}],
    "bulletThemes": [top 5: {"theme":"Surface Compatibility","frequency":<count>,"example":"<excerpt>"}],
    "pricingRange": {"min":<lowest>,"max":<highest>,"average":<avg>,"median":<median>,"currency":"<symbol>"}
  },
  "customerSegments": [4-6 segments: {"name":"Creative Teacher Emily","ageRange":"25-34","occupation":"Teacher","traits":["trait1","trait2","trait3"]}]
}

Only return valid JSON, no markdown fences or explanation.`
}

function buildMIPhase4StrategyPrompt(data: MarketIntelligenceData, phase1Result: Record<string, unknown>, phase2Result: Record<string, unknown>, phase3Result: Record<string, unknown>): string {
  const keywordsLabel = data.keywords && data.keywords.length > 1
    ? data.keywords.join(', ')
    : data.keyword

  return `You are an expert Amazon market intelligence strategist. This is PHASE 4 (final) of a 4-phase analysis for "${keywordsLabel}" on ${data.marketplace}.

=== PHASE 1 — REVIEW DEEP-DIVE ===
${JSON.stringify(phase1Result, null, 2)}

=== PHASE 2 — Q&A ANALYSIS ===
${JSON.stringify(phase2Result, null, 2)}

=== PHASE 3 — MARKET & COMPETITIVE ===
${JSON.stringify(phase3Result, null, 2)}

=== MARKET CONTEXT ===
Products analyzed: ${data.competitors.length} | Avg Price: ${data.marketStats.currency}${data.marketStats.avgPrice.toFixed(2)} | Avg Rating: ${data.marketStats.avgRating.toFixed(1)} | Total Reviews: ${data.marketStats.totalReviews.toLocaleString()}

=== YOUR TASK: PHASE 4 — CUSTOMER INTELLIGENCE & STRATEGY ===

Synthesize ALL prior phases into actionable customer intelligence and strategy. Every recommendation must reference real data from prior phases.

Return a JSON object with this EXACT structure:
{
  "executiveSummary": "<3-5 sentences: market opportunity, competitive summary, primary need, differentiation angle, positioning>",
  "customerDemographics": [6-8 age ranges: {"ageRange":"18-24","male":<count>,"female":<count>}],
  "detailedAvatars": [2-3 personas: {
    "name":"<name>","initials":"<2 letters>","role":"Primary",
    "buyerPercentage":<% of buyers>,
    "demographics":{"age":<age>,"gender":"...","location":"...","income":"...","purchaseFrequency":"..."},
    "psychographics":{"lifestyle":"...","values":["v1","v2","v3"],"interests":["i1","i2","i3"]},
    "buyingBehavior":["b1","b2","b3"],
    "keyMotivations":"<2-3 sentences>"
  }],
  "imageRecommendations": ["8-10 specific image recommendations based on review mentions + competitor gaps"],
  "keyMarketInsights": {
    "primaryTargetMarket": {"priceRange":"$X-$Y","region":"...","income":"...","ageRange":"..."},
    "growthOpportunity": {"growthRate":"...","focusArea":"...","marketType":"..."},
    "featurePriority": {"importance":"...","features":["f1","f2","f3"]}
  },
  "strategicRecommendations": {
    "pricing": ["3 recommendations"],
    "product": ["3 recommendations"],
    "marketing": ["3 recommendations"],
    "operations": ["3 recommendations"]
  },
  "messagingFramework": {
    "primaryMessage": "<one-line positioning>",
    "supportPoints": ["3-4 points"],
    "proofPoints": ["3-4 points"],
    "riskReversal": "<address top pain point>"
  },
  "customerVoicePhrases": {
    "positiveEmotional": ["5-8 authentic phrases from reviews"],
    "functional": ["5-8 functional phrases"],
    "useCaseLanguage": ["5-8 use case phrases"]
  }
}

IMPORTANT: Reference Phase 1-3 results. Avatars should mention real pain points. Strategy should address real gaps. Use real customer voice from reviews.

Only return valid JSON, no markdown fences or explanation.`
}

// --- 4-Phase Analysis Executor Functions ---

async function runMIPhase(
  promptBuilder: () => string,
  phaseLabel: string
): Promise<{ result: Record<string, unknown>; model: string; tokensUsed: number; inputTokens: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = promptBuilder()

  const MAX_RETRIES = 3
  const BASE_DELAY_RATE_LIMIT = 60_000  // 60s — token bucket refills per minute
  const BASE_DELAY_SERVER_ERROR = 10_000 // 10s for 5xx errors

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 16384,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const result = JSON.parse(stripMarkdownFences(text)) as Record<string, unknown>
      const inputTokens = response.usage?.input_tokens ?? 0
      const tokensUsed = inputTokens + (response.usage?.output_tokens ?? 0)

      if (attempt > 0) {
        console.log(`[MI] ${phaseLabel} succeeded on attempt ${attempt + 1}`)
      }

      return { result, model, tokensUsed, inputTokens }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const isApiError = err instanceof Anthropic.APIError
      const statusCode = isApiError ? (err.status ?? 0) : 0
      const isRateLimit = statusCode === 429
      const isServerError = statusCode >= 500
      const isRetryable = isRateLimit || isServerError

      if (!isRetryable || attempt >= MAX_RETRIES) {
        console.error(`[MI] ${phaseLabel} failed (attempt ${attempt + 1}, status ${statusCode}): ${lastError.message}`)
        throw lastError
      }

      const baseDelay = isRateLimit ? BASE_DELAY_RATE_LIMIT : BASE_DELAY_SERVER_ERROR
      const delay = baseDelay * Math.pow(2, attempt)
      console.log(`[MI] ${phaseLabel} attempt ${attempt + 1} failed (${isRateLimit ? '429 rate limit' : `${statusCode} server error`}), retrying in ${Math.round(delay / 1000)}s...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

export async function analyzeMarketIntelligencePhase1Reviews(
  data: MarketIntelligenceData
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligenceReviewPhaseResult; model: string; tokensUsed: number; inputTokens: number }> {
  const { result, model, tokensUsed, inputTokens } = await runMIPhase(
    () => buildMIPhase1ReviewsPrompt(data),
    'Phase 1: Reviews'
  )
  return { result: result as unknown as import('@/types/market-intelligence').MarketIntelligenceReviewPhaseResult, model, tokensUsed, inputTokens }
}

export async function analyzeMarketIntelligencePhase2QnA(
  data: MarketIntelligenceData,
  phase1Result: Record<string, unknown>
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligenceQnAPhaseResult; model: string; tokensUsed: number; inputTokens: number }> {
  const phase1Summary = JSON.stringify({
    sentimentAnalysis: phase1Result.sentimentAnalysis,
    topPainPoints: phase1Result.topPainPoints,
    primaryMotivations: phase1Result.primaryMotivations,
    perProductSummaries: phase1Result.perProductSummaries,
  }, null, 2)

  const { result, model, tokensUsed, inputTokens } = await runMIPhase(
    () => buildMIPhase2QnAPrompt(data, phase1Summary),
    'Phase 2: Q&A'
  )
  return { result: result as unknown as import('@/types/market-intelligence').MarketIntelligenceQnAPhaseResult, model, tokensUsed, inputTokens }
}

export async function analyzeMarketIntelligencePhase3Market(
  data: MarketIntelligenceData,
  phase1Result: Record<string, unknown>,
  phase2Result: Record<string, unknown>
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligenceMarketPhaseResult; model: string; tokensUsed: number; inputTokens: number }> {
  const { result, model, tokensUsed, inputTokens } = await runMIPhase(
    () => buildMIPhase3MarketPrompt(data, phase1Result, phase2Result),
    'Phase 3: Market'
  )
  return { result: result as unknown as import('@/types/market-intelligence').MarketIntelligenceMarketPhaseResult, model, tokensUsed, inputTokens }
}

export async function analyzeMarketIntelligencePhase4Strategy(
  data: MarketIntelligenceData,
  phase1Result: Record<string, unknown>,
  phase2Result: Record<string, unknown>,
  phase3Result: Record<string, unknown>
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligenceStrategyPhaseResult; model: string; tokensUsed: number; inputTokens: number }> {
  const { result, model, tokensUsed, inputTokens } = await runMIPhase(
    () => buildMIPhase4StrategyPrompt(data, phase1Result, phase2Result, phase3Result),
    'Phase 4: Strategy'
  )
  return { result: result as unknown as import('@/types/market-intelligence').MarketIntelligenceStrategyPhaseResult, model, tokensUsed, inputTokens }
}

// Legacy aliases for backward compatibility
export async function analyzeMarketIntelligencePhase1(
  data: MarketIntelligenceData
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligencePhase1Result; model: string; tokensUsed: number; inputTokens: number }> {
  return analyzeMarketIntelligencePhase1Reviews(data) as Promise<{ result: import('@/types/market-intelligence').MarketIntelligencePhase1Result; model: string; tokensUsed: number; inputTokens: number }>
}

export async function analyzeMarketIntelligencePhase2(
  data: MarketIntelligenceData,
  phase1Result: import('@/types/market-intelligence').MarketIntelligencePhase1Result
): Promise<{ result: import('@/types/market-intelligence').MarketIntelligencePhase2Result; model: string; tokensUsed: number }> {
  return analyzeMarketIntelligencePhase4Strategy(data, phase1Result as unknown as Record<string, unknown>, {}, {}) as Promise<{ result: import('@/types/market-intelligence').MarketIntelligencePhase2Result; model: string; tokensUsed: number }>
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

// --- A+ Content Strategy (Full Visual Direction + Strategic Flow) ---

export interface APlusStrategyResult {
  modules: Array<{
    position: number
    strategic_role: string
    template_type: string
    title: string
    text_content: Record<string, unknown>
    visual_concept: string
    image_description: string
    key_features_highlighted: string[]
    color_direction: string
  }>
  storytelling_flow: string
}

export interface APlusStrategyInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
}

function buildAPlusStrategyPrompt(input: APlusStrategyInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis,
          competitorAnalysis, marketIntelligence, listingTitle, bulletPoints, listingDescription, creativeBrief } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief,
  })

  return `You are an expert Amazon A+ Content strategist and visual designer. Generate a complete A+ Content strategy with 7 modules in strategic storytelling order.

=== PRODUCT ===
Product: ${brand} ${productName}
Category: ${categoryName}
${researchContext}
=== STRATEGIC CONTEXT ===
A+ Content (Enhanced Brand Content) appears below the bullet points on an Amazon product detail page. It's a visual storytelling section that can increase conversion by 3-10%. The modules must flow as a cohesive narrative that takes the customer from curiosity to purchase confidence.

=== STORYTELLING ARC ===
Follow this proven 7-module strategic flow. Each module has a SPECIFIC role in the conversion journey:

Module 1 — HOOK & BRAND INTRODUCTION (Standard Image Header with Text)
Purpose: Stop the scroll, establish brand credibility, communicate the core value proposition in 3 seconds.
Visual: Hero product image with vibrant styling, brand logo, tagline. High-impact, aspirational.
Text: Compelling headline + 2-3 key benefit bullets.

Module 2 — PROBLEM/SOLUTION (Standard Text & Image Sidebar)
Purpose: Identify the customer's pain point and position the product as the solution.
Visual: Split image — left shows the problem (frustration, mess, poor results), right shows the solution (clean, effective, happy outcome).
Text: Problem description → how this product solves it.

Module 3 — FEATURE DEEP-DIVE (Standard Four Images & Text)
Purpose: Demonstrate 4 key features with visual evidence.
Visual: 4 panels, each showing one feature in action — close-ups, annotations, clear demonstrations.
Text: Feature name + 1-2 sentence benefit per panel.

Module 4 — VERSATILITY/USE CASES (Standard Image & Light Text Overlay)
Purpose: Expand perceived value by showing the product works across multiple scenarios/surfaces/use cases.
Visual: Artistic composition showing the product used in 3-4 different contexts (from research use cases).
Text: Light overlay highlighting versatility.

Module 5 — COMPARISON/WHY CHOOSE US (Standard Comparison Chart)
Purpose: Differentiate from competitors on 5-6 key metrics.
Visual: Comparison table with bold checkmarks/X marks, color-coded.
Metrics: Derived from competitor analysis — feature vibrancy, safety, ease of use, durability, value, etc.

Module 6 — LIFESTYLE/SOCIAL PROOF (Standard Three Images & Text)
Purpose: Show real-world impact across customer segments. Build aspirational connection.
Visual: 3 lifestyle images showing different target personas using the product (e.g., educator, artist, parent).
Text: Short testimonial-style caption per image.

Module 7 — TRUST & GUARANTEE (Standard Image Header with Text)
Purpose: Remove final purchase barriers. Build confidence.
Visual: Trust badges (safety certifications, quality assurance, eco-friendly), satisfaction guarantee badge, brand promise imagery.
Text: Guarantee statement + safety credentials + brand commitment.

=== REQUIREMENTS PER MODULE ===
For each module, provide BOTH text content AND visual direction:

TEXT CONTENT:
- Title: Module headline (max 80 chars, benefit-driven)
- Template-appropriate text fields (headline, description, features list, comparison data, etc.)

VISUAL DIRECTION:
- Visual concept: Detailed scene/imagery description — what EXACTLY should the image show?
- Image description: Production-ready description suitable for a designer or AI image generator (100+ words)
- Color direction: Specific colors, gradients, palette for this module
- Key features highlighted: Which product features this module emphasizes (from research data)

=== RESEARCH-DRIVEN CONTENT ===
Use ALL the research data to create specific, evidence-backed content:
- Keyword analysis → use high-relevancy keywords naturally in headlines and descriptions
- Review analysis → strengths become features/benefits, weaknesses become "solved" pain points, use cases inform lifestyle images
- Q&A analysis → customer concerns inform problem/solution module, content gaps inform feature deep-dive
- Competitor analysis → differentiation gaps become comparison chart metrics
- Customer voice phrases → use authentic language in text content
- Messaging framework → primary/support/proof points inform each module's emphasis

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "modules": [
    {
      "position": 1,
      "strategic_role": "Hook & Brand Introduction",
      "template_type": "standard_image_header_text",
      "title": "Module headline (max 80 chars)",
      "text_content": {
        "headline": "Main headline text",
        "subheadline": "Supporting subheadline",
        "description": "2-3 sentence description",
        "key_points": ["point 1", "point 2", "point 3"]
      },
      "visual_concept": "Detailed scene description — what the image shows, the mood, the setting, the arrangement (50-100 words)",
      "image_description": "Production-ready image prompt suitable for a designer or AI generator. Include composition, lighting, colors, product placement, props, background, and emotional tone (100-150 words)",
      "key_features_highlighted": ["feature 1", "feature 2", "feature 3"],
      "color_direction": "Specific colors for this module, e.g. 'Deep teal (#008080) hero background with white text overlay, vibrant product colors pop against dark backdrop'"
    }
  ],
  "storytelling_flow": "Brief 2-3 sentence description of how the 7 modules flow together as a narrative — from hook to purchase confidence"
}`
}

export async function generateAPlusStrategy(
  input: APlusStrategyInput
): Promise<{ result: APlusStrategyResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildAPlusStrategyPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as APlusStrategyResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Video Storyboard Generation ---

export interface VideoStoryboardInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
}

export interface VideoStoryboardResult {
  total_runtime: string
  shots: Array<{
    shot_number: number
    timestamp: string
    runtime: string
    visual: string
    setting_props: string
    camera: string
    text_overlay: string
    audio_notes: string
    thumbnail: string
    usp_demonstrated: string
  }>
  music_direction: string
  brand_integration: string
}

function buildVideoStoryboardPrompt(input: VideoStoryboardInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis,
          competitorAnalysis, marketIntelligence, listingTitle, bulletPoints, listingDescription, creativeBrief } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief,
  })

  return `You are an expert Amazon product video director and storyboard artist. Generate a complete, shot-by-shot video storyboard for an Amazon product listing video.

=== PRODUCT ===
Product: ${brand} ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}
=== CONTEXT ===
Amazon product videos appear on the listing page and auto-play in search results (muted). The video must:
- Communicate value proposition within the first 3 seconds (hook)
- Work WITHOUT audio (most viewers watch muted) — text overlays carry the message
- Be 30-45 seconds total (sweet spot for Amazon engagement)
- Showcase 5-7 key product features/USPs, each mapped to a specific shot
- Build from "attention" → "features" → "proof" → "call to action"
- Every shot should answer a customer concern or demonstrate a selling point from the research data

=== VIDEO STRUCTURE ===
Follow this proven Amazon product video arc:
Shot 1 (0-4s): HOOK — Dramatic product reveal or eye-catching visual. Must stop the scroll instantly. Text overlay with main value proposition.
Shot 2 (4-9s): PRIMARY USP — Demonstrate the #1 selling point. Show the feature in action with text overlay explaining the benefit.
Shot 3 (9-15s): SECONDARY FEATURE — Show next most important feature. Hands interacting with product to show ease of use.
Shot 4 (15-20s): ADDRESS CONCERN — Visually address the top customer concern from Q&A/reviews. Turn a negative into a positive.
Shot 5 (20-26s): VERSATILITY — Show the product working across multiple use cases/surfaces/scenarios. Quick cuts between 2-3 settings.
Shot 6 (26-31s): QUALITY/SAFETY — Close-up on quality, certifications, safety features. Build trust and credibility.
Shot 7 (31-36s): COMPLETE PACKAGE + CTA — Show everything included (unboxing-style), then end with brand logo and call to action.

Adapt the number of shots (5-8) based on the product — some products need fewer, more impactful shots. Total runtime should be 30-45 seconds.

=== SHOT DETAIL REQUIREMENTS ===
For each shot, provide comprehensive production direction:
- Visual: Detailed description of what the camera sees — subjects, actions, product state, visual effects
- Setting/Props: Physical environment and props needed
- Camera: Specific camera angle, movement, and technique (close-up, pan, zoom, static, tracking, dolly)
- Text overlay: Bold text that appears on screen (5-10 words). This carries the message for muted viewers.
- Audio notes: Music mood, sound effects, transitions
- Runtime: Seconds for this shot
- Thumbnail: Description of the best still frame from this shot (for video thumbnail)
- USP demonstrated: Which specific product feature or customer concern this shot addresses

=== RESEARCH-DRIVEN SHOTS ===
Map each shot to specific research findings:
- Shot features should match top keyword demands and feature requests
- Shot addressing concerns should match top Q&A pain points and negative review themes
- Lifestyle shots should match top use cases from review analysis
- Text overlays should use customer voice phrases from positive reviews
- Comparison/quality shots should address competitor differentiation gaps

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "total_runtime": "35-40 seconds",
  "shots": [
    {
      "shot_number": 1,
      "timestamp": "00:00",
      "runtime": "4s",
      "visual": "Detailed description of what the camera sees — subjects, actions, product state, visual effects (50-100 words)",
      "setting_props": "Physical setting and specific props, e.g. 'Clean white studio table with scattered colorful art supplies, neutral gray background'",
      "camera": "Camera angle + movement, e.g. 'Close-up, center-focused, slow zoom in over 3 seconds'",
      "text_overlay": "Bold on-screen text (5-10 words) that works for muted viewing",
      "audio_notes": "Music and sound, e.g. 'Upbeat electronic music begins, rising intensity. Soft whoosh on reveal.'",
      "thumbnail": "Best still frame description from this shot, e.g. 'Product emerging from colorful ink splash, dramatic lighting'",
      "usp_demonstrated": "Which product feature/benefit this shot demonstrates and WHY based on research data"
    }
  ],
  "music_direction": "Overall music style and mood progression across the video, e.g. 'Upbeat, modern electronic. Builds from gentle curiosity (shots 1-2) to confident energy (shots 3-5) to warm resolution (shots 6-7). 120 BPM.'",
  "brand_integration": "How the brand appears throughout, e.g. 'Logo watermark bottom-right throughout. Brand colors (teal, pink) appear in text overlays. Final frame: centered logo with tagline on brand color background.'"
}`
}

export async function generateVideoStoryboard(
  input: VideoStoryboardInput
): Promise<{ result: VideoStoryboardResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildVideoStoryboardPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as VideoStoryboardResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Video Script Generation ---

export interface VideoScriptInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
  storyboard?: VideoStoryboardResult | null
}

export interface VideoScriptResult {
  title: string
  total_duration: string
  tone: string
  target_audience: string
  hook: string
  sections: Array<{
    section_number: number
    timestamp: string
    duration: string
    voiceover_text: string
    on_screen_text: string
    visual_direction: string
    key_selling_point: string
  }>
  closing_cta: string
  music_notes: string
}

function buildVideoScriptPrompt(input: VideoScriptInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis,
          competitorAnalysis, marketIntelligence, listingTitle, bulletPoints, listingDescription, creativeBrief, storyboard } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief,
  })

  let storyboardContext = ''
  if (storyboard) {
    storyboardContext = `\n=== EXISTING STORYBOARD (align script to these shots) ===
Total runtime: ${storyboard.total_runtime}
${storyboard.shots.map((s) =>
  `Shot ${s.shot_number} (${s.timestamp}, ${s.runtime}): ${s.visual}\n  Text overlay: ${s.text_overlay}\n  USP: ${s.usp_demonstrated}`
).join('\n')}
Music direction: ${storyboard.music_direction}
`
  }

  return `You are an expert Amazon product video scriptwriter. Generate a complete, production-ready video script for an Amazon product listing video.

=== PRODUCT ===
Product: ${brand} ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}${storyboardContext}
=== CONTEXT ===
Amazon product videos appear on the listing page and auto-play in search results (muted). The script must:
- Hook viewers in the first 3 seconds with a compelling opening line
- Work WITH and WITHOUT audio — on-screen text carries the message for muted viewers
- Be 30-45 seconds total (sweet spot for Amazon engagement)
- Cover 5-7 key selling points, each backed by research data
- Use customer language from reviews and Q&A
- End with a clear call to action

=== SCRIPT STRUCTURE ===
For each section of the video:
- Voiceover text: The spoken narration (conversational, benefit-focused, uses customer language)
- On-screen text: Bold text overlay visible to muted viewers (5-10 words max per screen)
- Visual direction: What the viewer sees (product angles, demos, lifestyle scenes)
- Key selling point: Which specific USP or customer concern this section addresses

=== TONE GUIDELINES ===
- Speak directly to the customer ("you", "your")
- Lead with benefits, not features
- Use specific numbers and proof points from research
- Address top customer concerns proactively
- Match the brand voice and category expectations

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "title": "Video title (internal reference, e.g. 'Product Name - Feature Showcase')",
  "total_duration": "35-40 seconds",
  "tone": "Brief tone description, e.g. 'Friendly, confident, educational'",
  "target_audience": "Primary audience, e.g. 'Creative professionals and hobbyists looking for premium art supplies'",
  "hook": "Opening hook line (first 3 seconds) — must stop the scroll",
  "sections": [
    {
      "section_number": 1,
      "timestamp": "00:00",
      "duration": "4s",
      "voiceover_text": "Full voiceover narration for this section (2-3 sentences, conversational tone)",
      "on_screen_text": "Bold on-screen text (5-10 words) for muted viewers",
      "visual_direction": "What the camera shows — product angles, demonstrations, lifestyle scenes (30-50 words)",
      "key_selling_point": "Which specific USP or concern this addresses and why, based on research"
    }
  ],
  "closing_cta": "Final call to action text and voiceover",
  "music_notes": "Overall music style, mood progression, and pacing notes"
}`
}

export async function generateVideoScript(
  input: VideoScriptInput
): Promise<{ result: VideoScriptResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildVideoScriptPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as VideoScriptResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Creative Brief Generation ---

export interface CreativeBriefInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
}

function buildCreativeBriefPrompt(input: CreativeBriefInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis,
          competitorAnalysis, marketIntelligence, listingTitle, bulletPoints, listingDescription,
          productPhotoDescriptions } = input

  // Build research context sections
  let researchData = ''

  // Keyword data
  if (keywordAnalysis) {
    const intents = keywordAnalysis.customerIntentPatterns
      ?.map((p) => `${p.category} (${p.priority})${p.painPoints ? ` — Pain: ${p.painPoints}` : ''}`)
      .join('\n  ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'
    researchData += `\n=== KEYWORD DATA ===
Title keywords: ${keywordAnalysis.titleKeywords?.join(', ') || 'N/A'}
Customer intent patterns:
  ${intents}
Feature demand: ${features}
Executive Summary: ${keywordAnalysis.executiveSummary || 'N/A'}
Competitive gaps: ${keywordAnalysis.competitiveIntelligence?.marketGaps?.join('; ') || 'N/A'}
`
  }

  // Review data
  if (reviewAnalysis) {
    const strengths = reviewAnalysis.strengths
      ?.map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const profiles = reviewAnalysis.customerProfiles
      ?.map((p) => `${p.profile}: ${p.description}`)
      .join('\n  ') || 'N/A'
    const voicePhrases = reviewAnalysis.customerVoicePhrases
    const voiceParts: string[] = []
    if (voicePhrases?.positiveEmotional?.length) voiceParts.push(...voicePhrases.positiveEmotional)
    if (voicePhrases?.functional?.length) voiceParts.push(...voicePhrases.functional)
    if (voicePhrases?.useCaseLanguage?.length) voiceParts.push(...voicePhrases.useCaseLanguage)
    const imageOps = reviewAnalysis.imageOptimizationOpportunities
      ?.map((o) => `${o.imageType}: ${o.rationale} (Evidence: ${o.reviewEvidence})`)
      .join('\n  ') || 'N/A'

    researchData += `\n=== REVIEW DATA ===
Product strengths: ${strengths}
Product weaknesses: ${weaknesses}
Top use cases: ${useCases}
Customer profiles:
  ${profiles}
Customer voice phrases: ${voiceParts.map((p) => `"${p}"`).join(', ') || 'N/A'}
Image optimization opportunities from reviews:
  ${imageOps}
`
  }

  // Q&A data
  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.map((c) => `${c.concern} — Response: ${c.suggestedResponse}`)
      .join('\n  ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.map((g) => `${g.gap} (${g.importance})`)
      .join(', ') || 'N/A'
    const highRisk = qnaAnalysis.highRiskQuestions
      ?.map((q) => `${q.question} → ${q.defensiveAction}`)
      .join('\n  ') || 'N/A'
    researchData += `\n=== Q&A DATA ===
Customer concerns:
  ${concerns}
Content gaps: ${gaps}
High-risk questions:
  ${highRisk}
`
  }

  // Competitor data
  if (competitorAnalysis) {
    const gaps = competitorAnalysis.differentiationGaps
      ?.map((g) => `${g.gap}: ${g.opportunity} (${g.priority})`)
      .join('\n  ') || 'N/A'
    const usps = competitorAnalysis.usps
      ?.map((u) => `${u.usp} — Competitor weakness: ${u.competitorWeakness}`)
      .join('\n  ') || 'N/A'
    researchData += `\n=== COMPETITOR DATA ===
Executive Summary: ${competitorAnalysis.executiveSummary}
Differentiation gaps:
  ${gaps}
USPs:
  ${usps}
`
  }

  // Market Intelligence data (previously COMPLETELY UNUSED in image generation!)
  if (marketIntelligence) {
    const topPains = marketIntelligence.topPainPoints
      ?.map((p) => `${p.title} — ${p.description} (Impact: ${p.impactPercentage}%)`)
      .join('\n  ') || 'N/A'
    const avatars = marketIntelligence.detailedAvatars
      ?.map((a) => `${a.name} (${a.role}, ${a.demographics.age}y, ${a.demographics.gender}, ${a.demographics.location}) — Motivations: ${a.keyMotivations}`)
      .join('\n  ') || 'N/A'
    const imageRecs = marketIntelligence.imageRecommendations
      ?.join('\n  ') || 'N/A'
    const voicePhrases = marketIntelligence.customerVoicePhrases
    const miVoice: string[] = []
    if (voicePhrases?.positiveEmotional?.length) miVoice.push(...voicePhrases.positiveEmotional)
    if (voicePhrases?.functional?.length) miVoice.push(...voicePhrases.functional)
    if (voicePhrases?.useCaseLanguage?.length) miVoice.push(...voicePhrases.useCaseLanguage)
    const landscape = marketIntelligence.competitiveLandscape
      ?.map((c) => `${c.brand} — Rating: ${c.avgRating}, Reviews: ${c.reviewCount}, Features: ${c.keyFeatures.join(', ')}`)
      .join('\n  ') || 'N/A'
    const messaging = marketIntelligence.messagingFramework
    const msgStr = messaging
      ? `Primary: "${messaging.primaryMessage}" | Support: ${messaging.supportPoints?.join('; ') || 'N/A'}`
      : 'N/A'
    const segments = marketIntelligence.customerSegments
      ?.map((s) => `${s.name} (${s.ageRange}, ${s.occupation}) — Traits: ${s.traits.join(', ')}`)
      .join('\n  ') || 'N/A'

    researchData += `\n=== MARKET INTELLIGENCE ===
Top pain points:
  ${topPains}
Detailed customer avatars:
  ${avatars}
Image recommendations (from MI):
  ${imageRecs}
Customer voice phrases (MI): ${miVoice.map((p) => `"${p}"`).join(', ') || 'N/A'}
Competitive landscape:
  ${landscape}
Messaging framework: ${msgStr}
Customer segments:
  ${segments}
`
  }

  // Listing content
  if (listingTitle || (bulletPoints && bulletPoints.length > 0) || listingDescription) {
    researchData += `\n=== LISTING CONTENT ===
Title: ${listingTitle || 'N/A'}
Bullets: ${bulletPoints?.join(' | ') || 'N/A'}
Description: ${listingDescription || 'N/A'}
`
  }

  // Product photo descriptions
  let photoSection = ''
  if (productPhotoDescriptions && Object.keys(productPhotoDescriptions).length > 0) {
    const photoDescs = Object.entries(productPhotoDescriptions)
      .map(([url, desc]) => `Photo (${desc.photo_type}): ${desc.description}\n  Features: ${desc.detected_features.join(', ')}\n  Colors: ${desc.dominant_colors.join(', ')}`)
      .join('\n')
    photoSection = `\n=== PRODUCT PHOTOS ANALYZED ===
${photoDescs}
`
  }

  return `You are a creative director for Amazon product photography. You've been given comprehensive research data about "${productName}" by "${brand}" in the "${categoryName}" category.

Your job is to analyze ALL the research data and produce a CREATIVE BRIEF — a strategic document that maps specific research findings to specific image positions and visual directions. This brief will be used as the primary directive for ALL image prompt generation (main image, secondary images, thumbnails, A+ content, video storyboard).

${researchData}${photoSection}

INSTRUCTIONS:
1. Identify the TOP 5 customer pain points from reviews + Q&A data. For each, specify which image position (1-7) should address it visually and HOW.
2. Identify the TOP 5 unique selling propositions. For each, specify which image position should demonstrate it and what visual proof looks like.
3. Create 3 detailed buyer personas from review profiles + MI avatars. For each, describe a specific lifestyle scene for image use.
4. Extract 5 EXACT customer voice phrases (verbatim from reviews) that should be used as text overlays — NOT AI-generated copy.
5. Define brand visual direction: suggest specific hex colors (primary + secondary), mood descriptors, photography style, and typography direction.
6. Identify 3-5 competitor visual GAPS — what competitors DON'T show in their images that we SHOULD.
7. If product photos were analyzed, summarize what the actual product looks like for use in prompt generation.
8. Write a brief image position strategy explaining the overall storytelling arc across all 7 positions.

Respond with ONLY valid JSON (no markdown fences):
{
  "top_pain_points": [
    {
      "pain_point": "exact pain point description",
      "evidence_source": "reviews|qna|both",
      "mention_count": 47,
      "suggested_image_position": 6,
      "visual_proof_direction": "Show marker left uncapped for 24hrs, still writes perfectly — close-up of fresh ink flow"
    }
  ],
  "top_usps": [
    {
      "usp": "USP description",
      "evidence": "where this was identified",
      "competitor_weakness": "what competitors lack here",
      "suggested_image_position": 3,
      "visual_demo_direction": "Close-up of twist-lock cap mechanism with labeled callout"
    }
  ],
  "personas": [
    {
      "name": "The Classroom Teacher",
      "description": "Elementary school teacher who uses markers daily",
      "demographics": "Female, 28-40, suburban, $45-65K income",
      "lifestyle_scene_direction": "Bright classroom with decorated whiteboard, teacher's desk with organized marker set",
      "emotional_trigger": "Pride in creating engaging visual aids for students"
    }
  ],
  "customer_voice_phrases": ["Colors that pop", "Easy to erase", "My students love these"],
  "visual_direction": {
    "primary_colors": ["#008080", "#FF1493"],
    "secondary_colors": ["#FFFFFF", "#333333"],
    "mood": ["vibrant", "playful", "professional"],
    "style": "clean studio with lifestyle accents",
    "typography_direction": "Bold sans-serif for headlines, clean readability",
    "photography_style": "High-key studio lighting with selective color pops"
  },
  "competitor_visual_gaps": [
    {
      "gap": "No competitor shows long-term ink durability",
      "what_competitors_show": "Static product shots, basic color swatches",
      "what_we_should_show": "Before/after: marker uncapped 24hrs still writing vibrantly",
      "priority": "HIGH"
    }
  ],
  "product_description_from_photos": "Cylindrical markers with dual tips (fine + chisel), transparent barrel showing ink level, twist-lock caps in 12 vibrant colors" or null,
  "image_position_strategy": "Position 1 (Hero): Premium studio shot establishing quality. Position 2: Size/scale context. Position 3: Key USP demo. Position 4: Use case lifestyle. Position 5: Feature detail. Position 6: Pain point resolution. Position 7: Social proof/trust."
}`
}

export async function generateCreativeBrief(input: CreativeBriefInput): Promise<{
  result: import('@/types/api').CreativeBrief
  model: string
  tokensUsed: number
}> {
  const client = await getClient()
  const model = await getModel()
  const prompt = buildCreativeBriefPrompt(input)

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const result = JSON.parse(stripMarkdownFences(text)) as import('@/types/api').CreativeBrief
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model, tokensUsed }
}

// --- Product Photo Analysis (Claude Vision) ---

export interface ProductPhotoAnalysisInput {
  photoUrls: string[]
  productName: string
  brand: string
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch image: ${url}`)
  const buffer = await response.arrayBuffer()
  const data = Buffer.from(buffer).toString('base64')
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)
    ? contentType
    : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  return { data, mediaType }
}

export async function analyzeProductPhotos(input: ProductPhotoAnalysisInput): Promise<{
  descriptions: Record<string, import('@/types/api').ProductPhotoDescription>
  model: string
  tokensUsed: number
}> {
  const client = await getClient()
  const model = await getModel()

  // Download images and convert to base64 for Anthropic SDK 0.24.x
  const imageDataArr = await Promise.all(
    input.photoUrls.map((url) => fetchImageAsBase64(url))
  )

  const imageBlocks: Anthropic.ImageBlockParam[] = imageDataArr.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.data,
    },
  }))

  const textBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: `You are analyzing product photos for "${input.productName}" by "${input.brand}".

For EACH photo provided (${input.photoUrls.length} photos total), analyze and describe:
1. What the photo shows (description)
2. Key product features visible (detected_features)
3. Dominant colors with hex codes (dominant_colors)
4. Best photography angles this reveals (suggested_angles)
5. Photo type classification (photo_type): one of "product_front", "product_back", "product_side", "packaging", "label", "lifestyle", "detail_closeup", "color_swatch", "bundle", "accessory"

Respond with ONLY valid JSON (no markdown fences):
{
  "photos": [
    {
      "index": 0,
      "description": "Front view of cylindrical marker with dual-tip design, transparent barrel showing blue ink, white twist-lock cap",
      "detected_features": ["dual-tip", "transparent barrel", "twist-lock cap", "ergonomic grip"],
      "dominant_colors": ["#0066CC", "#FFFFFF", "#333333"],
      "suggested_angles": ["¾ hero angle", "top-down flat lay", "close-up of tip"],
      "photo_type": "product_front"
    }
  ]
}`,
  }

  const content: (Anthropic.ImageBlockParam | Anthropic.TextBlockParam)[] = [...imageBlocks, textBlock]

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content }],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const parsed = JSON.parse(stripMarkdownFences(text)) as {
    photos: Array<{
      index: number
      description: string
      detected_features: string[]
      dominant_colors: string[]
      suggested_angles: string[]
      photo_type: string
    }>
  }

  // Map results back to photo URLs
  const descriptions: Record<string, import('@/types/api').ProductPhotoDescription> = {}
  for (const photo of parsed.photos) {
    const url = input.photoUrls[photo.index]
    if (url) {
      descriptions[url] = {
        description: photo.description,
        detected_features: photo.detected_features,
        dominant_colors: photo.dominant_colors,
        suggested_angles: photo.suggested_angles,
        photo_type: photo.photo_type,
      }
    }
  }

  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { descriptions, model, tokensUsed }
}

// --- Workshop: AI Image Prompt Generation ---

export interface ImageResearchContext {
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
}

/**
 * Builds the full research context block for image prompt builders.
 * Mirrors buildSharedContext() depth — NO .slice() caps on research data.
 * Used by main, secondary, thumbnail, and recommendation builders.
 * If you add fields to buildSharedContext(), add them here too.
 */
function buildImageResearchContext(ctx: ImageResearchContext): string {
  const { keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
          listingTitle, bulletPoints, listingDescription, creativeBrief, productPhotoDescriptions } = ctx

  // === KEYWORD SECTION (mirrors buildSharedContext) ===
  let keywordSection = ''
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
    const surfaces = keywordAnalysis.surfaceDemand
      ?.map((s) => `${s.surfaceType} (${s.totalSearchVolume} SV)`)
      .join(', ') || 'N/A'

    const execSummary = keywordAnalysis.executiveSummary
      ? `Executive Summary: ${keywordAnalysis.executiveSummary}\n` : ''
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

    keywordSection = `\n=== KEYWORD INTELLIGENCE ===
${execSummary}Must-include title keywords: ${titleKw}
Bullet point keywords: ${bulletKw}
Backend search term keywords: ${searchKw}
Customer intent patterns:
  ${intents}
Key feature demand signals: ${features}
Surface/context demand: ${surfaces}${bulletMapStr}${competitiveStr}${rufusStr}\n`
  }

  // === REVIEW SECTION (mirrors buildSharedContext + imageOptimizationOpportunities) ===
  let reviewSection = ''
  if (reviewAnalysis) {
    const execSummary = reviewAnalysis.executiveSummary
      ? `Executive Summary: ${reviewAnalysis.executiveSummary}\n` : ''
    const strengths = reviewAnalysis.strengths
      ?.map((s) => `${s.strength} (${s.mentions} mentions)`)
      .join(', ') || 'N/A'
    const useCases = reviewAnalysis.useCases
      ?.map((u) => `${u.useCase} (${u.priority})`)
      .join(', ') || 'N/A'
    const posLang = reviewAnalysis.positiveLanguage
      ?.map((w) => `${w.word}${w.optimizationValue ? ` [${w.optimizationValue}]` : ''}`)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    const bulletStrat = reviewAnalysis.bulletStrategy
      ?.map((b) => `Bullet ${b.bulletNumber}: Focus on "${b.focus}" — Evidence: ${b.evidence}${b.customerPainPoint ? ` — Addresses: ${b.customerPainPoint}` : ''}`)
      .join('\n  ') || 'N/A'

    const voicePhrases = reviewAnalysis.customerVoicePhrases
    const voiceParts: string[] = []
    if (voicePhrases?.positiveEmotional?.length) voiceParts.push(...voicePhrases.positiveEmotional.slice(0, 4))
    if (voicePhrases?.functional?.length) voiceParts.push(...voicePhrases.functional.slice(0, 3))
    if (voicePhrases?.useCaseLanguage?.length) voiceParts.push(...voicePhrases.useCaseLanguage.slice(0, 3))
    const voiceStr = voiceParts.length > 0
      ? `\nCustomer voice phrases to echo: ${voiceParts.map((p) => `"${p}"`).join(', ')}` : ''

    const profiles = reviewAnalysis.customerProfiles
      ?.map((p) => `${p.profile}: ${p.description}`)
      .join('; ') || ''
    const profileStr = profiles ? `\nKey customer profiles: ${profiles}` : ''

    const messaging = reviewAnalysis.competitivePositioning?.messagingFramework
    const msgStr = messaging
      ? `\nMessaging framework — Primary: "${messaging.primaryMessage}" | Supporting: ${messaging.supportPoints?.join('; ') || 'N/A'} | Proof: ${messaging.proofPoints?.join('; ') || 'N/A'}`
      : ''

    // IMAGE-SPECIFIC: imageOptimizationOpportunities (not in listing buildSharedContext)
    const imageOps = reviewAnalysis.imageOptimizationOpportunities
      ?.map((o) => `${o.imageType}: ${o.rationale} (Evidence: ${o.reviewEvidence})`)
      .join('\n  ') || ''
    const imageOpsStr = imageOps
      ? `\nImage optimization opportunities from reviews:\n  ${imageOps}` : ''

    reviewSection = `\n=== CUSTOMER REVIEW INSIGHTS ===
${execSummary}Product strengths to highlight: ${strengths}
Top use cases to emphasize: ${useCases}
Customer language that resonates: ${posLang}
Weaknesses to avoid showing / preemptively address: ${weaknesses}
Bullet strategy from review analysis:
  ${bulletStrat}${voiceStr}${profileStr}${msgStr}${imageOpsStr}\n`
  }

  // === Q&A SECTION (mirrors buildSharedContext) ===
  let qnaSection = ''
  if (qnaAnalysis) {
    const execSummary = qnaAnalysis.executiveSummary
      ? `Executive Summary: ${qnaAnalysis.executiveSummary}\n` : ''
    const concerns = qnaAnalysis.customerConcerns
      ?.map((c) => `${c.concern} — Suggested: ${c.suggestedResponse}`)
      .join('\n  ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.map((g) => `${g.gap} (${g.importance})${g.priorityScore ? ` [priority: ${g.priorityScore}]` : ''}`)
      .join(', ') || 'N/A'
    const faqs = qnaAnalysis.faqForDescription
      ?.map((f) => `Q: ${f.question} / A: ${f.answer}`)
      .join('\n  ') || 'N/A'
    const specs = qnaAnalysis.productSpecsConfirmed
      ?.map((s) => `${s.spec}: ${s.value}`)
      .join('; ') || ''
    const specStr = specs ? `\nConfirmed product specs: ${specs}` : ''
    const contradictions = qnaAnalysis.contradictions
      ?.map((c) => `"${c.topic}": ${c.resolution}`)
      .join('; ') || ''
    const contradStr = contradictions
      ? `\nContradictions to resolve visually: ${contradictions}` : ''
    const highRisk = qnaAnalysis.highRiskQuestions
      ?.map((q) => `${q.question} → ${q.defensiveAction}`)
      .join('\n  ') || ''
    const riskStr = highRisk
      ? `\nHigh-risk questions to preemptively address:\n  ${highRisk}` : ''
    const defenseParts: string[] = []
    if (qnaAnalysis.competitiveDefense?.brandProtectionOpportunities?.length) {
      defenseParts.push(`Brand protection: ${qnaAnalysis.competitiveDefense.brandProtectionOpportunities.join('; ')}`)
    }
    if (qnaAnalysis.competitiveDefense?.informationGapAdvantages?.length) {
      defenseParts.push(`Info gap advantages: ${qnaAnalysis.competitiveDefense.informationGapAdvantages.join('; ')}`)
    }
    const defenseStr = defenseParts.length > 0
      ? `\nCompetitive defense: ${defenseParts.join(' | ')}` : ''

    qnaSection = `\n=== Q&A / CUSTOMER CONCERNS ===
${execSummary}Top customer concerns to address:
  ${concerns}
Content gaps to fill: ${gaps}
FAQ insights:
  ${faqs}${specStr}${contradStr}${riskStr}${defenseStr}\n`
  }

  // === COMPETITIVE INTELLIGENCE SECTION (MI preferred, fallback to legacy competitor) ===
  const competitorSection = buildCompetitiveSection(competitorAnalysis, marketIntelligence, { sliceCaps: false })

  // === LISTING CONTENT (when available — from listing context) ===
  let listingSection = ''
  if (listingTitle || (bulletPoints && bulletPoints.length > 0) || listingDescription) {
    listingSection = `\n=== LISTING CONTENT ===
Title: ${listingTitle || 'N/A'}
Bullet points:
${bulletPoints?.map((b, i) => `${i + 1}. ${b}`).join('\n') || 'N/A'}
Description: ${listingDescription || 'N/A'}\n`
  }

  // === CREATIVE BRIEF SECTION (prepended when available) ===
  let briefSection = ''
  if (creativeBrief) {
    const painPoints = creativeBrief.top_pain_points
      ?.map((p) => `${p.mention_count ? `(${p.mention_count} mentions)` : ''} "${p.pain_point}" → Image Position ${p.suggested_image_position}\n   Visual Proof: ${p.visual_proof_direction}`)
      .join('\n') || 'N/A'
    const usps = creativeBrief.top_usps
      ?.map((u) => `"${u.usp}" → Image Position ${u.suggested_image_position}\n   Visual Demo: ${u.visual_demo_direction}\n   Competitor weakness: ${u.competitor_weakness}`)
      .join('\n') || 'N/A'
    const personas = creativeBrief.personas
      ?.map((p) => `${p.name} (${p.demographics}): ${p.lifestyle_scene_direction}\n   Emotional trigger: ${p.emotional_trigger}`)
      .join('\n') || 'N/A'
    const phrases = creativeBrief.customer_voice_phrases
      ?.map((p) => `"${p}"`)
      .join(', ') || 'N/A'
    const vd = creativeBrief.visual_direction
    const colors = vd
      ? `Primary: ${vd.primary_colors.join(', ')} | Secondary: ${vd.secondary_colors.join(', ')}`
      : 'N/A'
    const gaps = creativeBrief.competitor_visual_gaps
      ?.map((g) => `[${g.priority}] ${g.gap}\n   Competitors show: ${g.what_competitors_show}\n   We should show: ${g.what_we_should_show}`)
      .join('\n') || 'N/A'

    briefSection = `\n=== CREATIVE BRIEF (USE AS PRIMARY DIRECTION) ===

TOP PAIN POINTS TO ADDRESS VISUALLY:
${painPoints}

TOP USPs TO DEMONSTRATE:
${usps}

TARGET PERSONAS & LIFESTYLE SCENES:
${personas}

CUSTOMER VOICE (use these EXACT phrases as text overlays):
${phrases}

BRAND VISUAL DIRECTION:
Colors: ${colors}
Mood: ${vd?.mood?.join(', ') || 'N/A'}
Style: ${vd?.style || 'N/A'}
Photography: ${vd?.photography_style || 'N/A'}
Typography: ${vd?.typography_direction || 'N/A'}

COMPETITOR VISUAL GAPS (what they DON'T show):
${gaps}

${creativeBrief.product_description_from_photos ? `ACTUAL PRODUCT APPEARANCE (from uploaded photos):\n${creativeBrief.product_description_from_photos}\n` : ''}
IMAGE POSITION STRATEGY:
${creativeBrief.image_position_strategy || 'N/A'}

=== END CREATIVE BRIEF ===
`
  }

  // === PRODUCT PHOTO DESCRIPTIONS (fallback when creative brief lacks product_description_from_photos) ===
  let photoDescSection = ''
  const hasPhotoDescInBrief = creativeBrief?.product_description_from_photos
  if (productPhotoDescriptions && Object.keys(productPhotoDescriptions).length > 0 && !hasPhotoDescInBrief) {
    const photoEntries = Object.values(productPhotoDescriptions)
      .map((desc, i) => {
        const d = desc as import('@/types/api').ProductPhotoDescription
        return `Photo ${i + 1}: ${d.description}
   Features: ${d.detected_features?.join(', ') || 'N/A'}
   Colors: ${d.dominant_colors?.join(', ') || 'N/A'}
   Type: ${d.photo_type || 'N/A'}`
      })
      .join('\n')

    photoDescSection = `\n=== ACTUAL PRODUCT APPEARANCE (from uploaded photos) ===
${photoEntries}

IMPORTANT: Your prompts must describe THIS specific product accurately — its exact colors, materials, shapes, and features as described above. Do NOT write generic product descriptions.
`
  }

  if (!briefSection && !keywordSection && !reviewSection && !qnaSection && !competitorSection && !listingSection && !photoDescSection) {
    return '\nNo research data available. Use general best practices for Amazon product photography.\n'
  }

  return `${briefSection}${photoDescSection}${keywordSection}${reviewSection}${qnaSection}${competitorSection}${listingSection}`
}

export interface WorkshopPromptInput {
  productName: string
  brand: string
  categoryName: string
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  listingTitle?: string | null
  bulletPoints?: string[]
  listingDescription?: string | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
}

export interface WorkshopPromptResult {
  prompts: Array<{
    label: string
    product_depiction: string
    prompt: string
    research_rationale: string
    approach: string
    frame_fill: string
    camera_angle: string
    lighting: string
    emotional_target: string[]
    props: string[]
    post_processing: string
    compliance_notes: string
    color_direction: string
    callout: string
  }>
  callout_suggestions: Array<{
    type: 'keyword' | 'benefit' | 'usp'
    text: string
  }>
}

function buildWorkshopPromptsPrompt(input: WorkshopPromptInput): string {
  const { productName, brand, categoryName, keywordAnalysis, reviewAnalysis, qnaAnalysis,
          competitorAnalysis, marketIntelligence, listingTitle, bulletPoints, listingDescription,
          creativeBrief, productPhotoDescriptions } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief, productPhotoDescriptions,
  })

  return `You are an expert Amazon product photography director who creates hyper-specific, production-ready image prompts. You specialize in translating product research and real product photos into prompts that AI image generators can execute accurately.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}
=== CRITICAL: YOU MUST DESCRIBE THE ACTUAL PRODUCT ===
The research context above contains "ACTUAL PRODUCT APPEARANCE (from uploaded photos)" — this is a detailed description of what the product PHYSICALLY looks like based on real photos the user uploaded.

EVERY prompt you write MUST describe this specific product in detail. Do NOT write generic prompts like "product on white background." Instead, describe the EXACT:
- Physical form (shape, size, count of items, how they're packaged/bundled)
- Colors and materials (exact colors of the product, packaging, labels, caps, tips, etc.)
- Textures and finishes (matte, glossy, metallic, soft-touch, transparent, etc.)
- Distinguishing features (dual tips, specific mechanisms, unique design elements)
- Brand elements (logo placement, label design, packaging style)

The user will also pass their actual product photos as visual references to the AI image generator alongside your prompt. Your prompt must COMPLEMENT those reference images by describing in words what the generator should reproduce and how to arrange/light/angle it.

=== TASK ===
Generate exactly 12 different main image prompts. Each must be a comprehensive, ultra-detailed prompt suitable for AI image generation (GPT Image, Gemini). These are for the MAIN IMAGE on Amazon — the first image customers see in search results. This is the most important image — it determines click-through rate.

=== AMAZON MAIN IMAGE REQUIREMENTS ===
- Pure white background (#FFFFFF)
- Product must fill 85% or more of the image frame
- No text, graphics, watermarks, or badges on the image itself
- No additional objects that may confuse what the product is
- 2000x2000px minimum, 300 DPI for print-quality zoom
- Must be clear and recognizable at mobile thumbnail size (100x100px)

=== VARIATION DIMENSIONS ===
Each prompt MUST be meaningfully different — not just rephrased. Vary across ALL of these:
1. Camera angle — specify exact angle: ¾ hero view, straight-on front, 45-degree elevated, top-down flat lay, eye-level, slight tilt (5-10°), low angle looking up
2. Product presentation — single product hero, product with packaging/box, product with accessories laid out, product partially opened/uncapped to show features, product in use-ready pose, color range fanned out
3. Composition & frame fill — specify percentage: 80-85% centered, 85-90% slightly off-center for dynamic feel, rule-of-thirds placement, close-up detail (90-95% fill), full product with breathing room (75-80%)
4. Lighting — be specific: soft diffused studio (2-point), dramatic side light with natural shadow, high-key bright even lighting, rim/backlight for premium glow, overhead butterfly lighting
5. Visual storytelling mood — clean minimal/modern, premium/luxury/aspirational, practical/functional/reliable, colorful/vibrant/energetic, professional/authoritative
6. Product arrangement — how the items are physically arranged: stacked, fanned, cascading, grouped by color, pyramid, flat lay grid, single hero with accessories, partially unboxed

=== RESEARCH-DRIVEN DIRECTION ===
Use ALL the research data to make each prompt specific and strategic:
- Feature demand + surface demand → emphasize those features and contexts visually
- Use cases → suggest compositions that hint at those use cases
- Strengths → make them visually obvious (e.g., if "vibrant colors" is top strength, ensure composition showcases the full color spectrum)
- Customer concerns + high-risk questions → address them visually (e.g., if "durability" is a concern, show robust construction; if "size" is a concern, include scale reference)
- Positive language + messaging framework → inform the mood/feeling of the image
- Competitor differentiation gaps → visually demonstrate our USPs that competitors miss
- Image optimization opportunities from reviews → directly follow review-driven image suggestions
- Listing content (if available) → ensure visual consistency with copy claims

=== SCROLL-STOPPER ELEMENTS ===
For each prompt, think about what makes a customer STOP scrolling in Amazon search results:
- A visually striking element (color contrast, unusual angle, unexpected arrangement)
- Immediate recognition of product quality or completeness
- Visual cue that answers the customer's primary concern at a glance

=== CALLOUT SUGGESTIONS ===
Also generate 3 callout text suggestions (text badges/overlays added in post-production, NOT in the AI prompt):
1. A keyword-focused callout (most-searched term)
2. A benefit-focused callout (what customers love most)
3. A USP callout (what makes this product unique vs competitors)

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "prompts": [
    {
      "label": "Short 3-6 word description of this variation",
      "product_depiction": "Describe EXACTLY what the product looks like in this image — colors, materials, shapes, count, packaging, visible features, brand elements. This is your interpretation of the real product for this specific angle/arrangement. 50-100 words.",
      "prompt": "Full detailed image generation prompt (300-500 words). START by describing the product in exact physical detail (what it is, what it looks like, colors, materials, textures, count of items). THEN describe the arrangement/composition (how items are positioned, what's in front/back, what's open/closed). THEN describe the camera angle, lighting, and mood. THEN describe any specific visual storytelling (what feature is emphasized, what concern is addressed). Be so specific that a photographer who has never seen this product could set up this exact shot.",
      "research_rationale": "Which specific research insight drove this variation. E.g., 'Reviews show 47% of customers mention vibrant colors as top reason for purchase — this arrangement maximizes visible color range' or 'Q&A shows #1 concern is tip durability — this close-up showcases the reinforced tip construction'.",
      "approach": "one of: studio-clean, studio-premium, lifestyle, feature-closeup, bundle-flatlay, scale-reference, in-use, emotional, concern-address, brand-story, dramatic, minimal",
      "frame_fill": "Percentage of frame product fills, e.g. '85-90%'",
      "camera_angle": "Exact camera angle, e.g. '¾ hero view, slightly elevated at 30 degrees'",
      "lighting": "Detailed lighting setup, e.g. 'Soft diffused 2-point studio lighting with natural shadow falling to bottom-right, rim light from behind for premium edge glow'",
      "emotional_target": ["3-4 mood keywords, e.g. 'professional', 'premium', 'vibrant', 'trustworthy'"],
      "props": ["specific props if any, e.g. 'retail packaging box partially visible behind', 'tip cap removed to show chisel tip'"],
      "post_processing": "Retouching notes, e.g. 'Micro-retouching for dust removal, enhance color saturation by 10%, premium matte finish'",
      "compliance_notes": "Amazon-specific compliance note for this variation",
      "color_direction": "Primary colors to emphasize based on the actual product colors, e.g. 'Full rainbow spectrum visible — ensure deep teal, vibrant pink, and sunshine yellow are prominently placed in front row'",
      "callout": "Suggested text badge for this specific image, e.g. 'Non-Toxic & Easy Erase!'"
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
  listingDescription?: string | null
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
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
    layout_type: string
    icon_descriptions: string[]
    typography: string
    color_palette: string
    target_audience: string
    mood: string
    camera_focus: string
    compliance_notes: string
    aesthetic_reference: string
  }>
}

function buildSecondaryPromptsPrompt(input: SecondaryPromptInput): string {
  const { productName, brand, categoryName, listingTitle, bulletPoints, listingDescription,
          keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
          creativeBrief, productPhotoDescriptions } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief, productPhotoDescriptions,
  })

  return `You are an expert Amazon listing image strategist and visual storyteller. Generate 9 highly detailed, production-ready secondary image concepts for an Amazon product listing.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}
=== TASK ===
Generate exactly 9 secondary image concepts for listing positions 2-10. Each concept tells a DIFFERENT part of the product story, building a compelling visual narrative that converts browsers into buyers.

=== IMAGE POSITION STRATEGY ===
Use this proven storytelling arc — adapt based on the product and research data:
Position 2: Lifestyle/In-Use — Show the product being used by a specific target persona in a real, aspirational setting. Make the viewer imagine themselves using it.
Position 3: Key Features Infographic — Highlight 4-6 key features with specific icon descriptions, callout arrows, and benefit text. Use split-screen or annotated layout.
Position 4: How It Works / How To Use — Step-by-step usage guide (3-4 steps). Show hands interacting with product. Clear, instructional.
Position 5: Size/Dimensions/Contents — Show what's included, dimensions with rulers/scale reference, packaging contents laid out. Build value perception.
Position 6: Materials/Quality/Safety — Close-up on quality, materials, certifications (non-toxic, eco-friendly, FDA approved). Address customer safety concerns from Q&A.
Position 7: Comparison/Why Choose Us — Visual comparison table or split-screen showing your product vs generic alternatives. Highlight 4-5 differentiators from competitor analysis.
Position 8: Benefits Infographic — Customer benefits (not features) with specific icons and supporting emotional copy. Address top pain points from reviews.
Position 9: Use Cases/Versatility — Show 3-4 different usage scenarios side by side. Demonstrate versatility across customer segments identified in research.
Position 10: Brand Story/Trust/Guarantee — Brand values, satisfaction guarantee, trust badges, customer testimonial highlight. Build purchase confidence.

=== DETAIL REQUIREMENTS ===
For each concept, provide comprehensive creative direction:
- Title: Clear image type description
- Headline: Bold text overlay (5-10 words) — the first thing the eye reads
- Sub-headline: Supporting tagline (8-15 words) — explains or reinforces headline
- Visual reference: Detailed layout and composition description
- Hero image: Main visual element description with specific scene narrative
- Supporting visuals: SPECIFIC icon descriptions (e.g., "clock icon with circular arrows showing longevity", "shield with checkmark for safety certification")
- Background: Specific colors, gradients, and style
- USP: What this image communicates strategically
- Layout type: The exact visual layout (split-screen, grid, single-hero, before-after, annotated, step-by-step, comparison-table, infographic)
- Icon descriptions: List of specific icons with visual description for each
- Typography: Font style, weight, size guidance, and color for headline/sub-headline text
- Color palette: Specific colors/gradients for this concept (e.g., "deep teal (#008080) to white gradient background, vibrant pink (#FF1493) accent badges")
- Target audience: WHO this specific image speaks to (e.g., "teachers and educators", "parents with young children", "professional event planners")
- Mood: Emotional atmosphere (e.g., "warm + inviting, quiet afternoon simplicity", "professional + authoritative + trustworthy")
- Camera focus: What the camera focuses on (e.g., "focus on hands engaged in detailed strokes, product visible with logo")
- Compliance notes: Per-image Amazon compliance considerations
- Aesthetic reference: Style inspiration (e.g., "Apple's clean brightness + Nike's energetic feel", "IKEA catalog warmth")

=== RESEARCH-DRIVEN DIRECTION ===
Use ALL the research data strategically:
- Feature demand + surface demand → which features to highlight in infographics
- Strengths + use cases → lifestyle and benefit images
- Weaknesses + concerns + high-risk questions → address proactively in comparison/trust images
- Competitor differentiation gaps → comparison chart and "why choose us" images
- Image optimization opportunities from reviews → directly follow review-driven image suggestions
- Messaging framework → inform headlines and sub-headlines
- Customer voice phrases → use authentic language in text overlays
- Listing content (if available) → ensure visual story aligns with copy claims

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "concepts": [
    {
      "position": 1,
      "title": "Image type title",
      "headline": "Bold headline text for overlay (5-10 words)",
      "sub_headline": "Supporting tagline text (8-15 words)",
      "visual_reference": "Detailed layout and composition description including spatial arrangement",
      "hero_image": "Main visual element with specific scene narrative (who, what, where, doing what)",
      "supporting_visuals": "Detailed descriptions of each icon, badge, and callout element",
      "background": "Specific background with colors, gradients, and style description",
      "unique_selling_point": "What this image strategically communicates to the customer",
      "prompt": "Full detailed image generation prompt (100-200 words). Describe scene, subjects, composition, lighting, colors, product placement, mood, and atmosphere. Be specific enough for a photographer or AI to execute exactly.",
      "layout_type": "one of: split-screen, grid, single-hero, before-after, annotated, step-by-step, comparison-table, infographic, lifestyle-scene",
      "icon_descriptions": ["Specific icon descriptions, e.g. 'Clock with circular arrows symbolizing long-lasting', 'Droplet with checkmark for water-resistant'"],
      "typography": "Font style and color guidance, e.g. 'Bold sans-serif (Open Sans or Montserrat), white text on dark overlay, headline 24pt, sub-headline 14pt'",
      "color_palette": "Specific colors for this concept, e.g. 'Deep teal (#008080) background gradient, white text, vibrant pink (#FF1493) accent badges'",
      "target_audience": "Who this image speaks to, e.g. 'Teachers and educators looking for classroom supplies'",
      "mood": "Emotional atmosphere, e.g. 'Warm + inviting, inspirational, playful yet educational'",
      "camera_focus": "What the camera focuses on, e.g. 'Focus on hands creating vibrant artwork, product logo subtly visible'",
      "compliance_notes": "Amazon compliance notes for this image type, e.g. 'Realistic scene, avoid unsubstantiated claims, keep text readable at mobile size'",
      "aesthetic_reference": "Style inspiration, e.g. 'Apple product page clean minimalism with Crayola's vibrant energy'"
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
  listingDescription?: string | null
  keywordAnalysis?: KeywordAnalysisResult | null
  reviewAnalysis?: ReviewAnalysisResult | null
  qnaAnalysis?: QnAAnalysisResult | null
  competitorAnalysis?: import('@/types/api').CompetitorAnalysisResult | null
  marketIntelligence?: import('@/types/market-intelligence').MarketIntelligenceResult | null
  creativeBrief?: import('@/types/api').CreativeBrief | null
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
}

export interface ThumbnailConceptResult {
  concepts: Array<{
    position: number
    title: string
    approach: string
    description: string
    text_overlay: string
    prompt: string
    camera_angle: string
    lighting: string
    mood: string
    color_direction: string
    compliance_notes: string
  }>
}

function buildThumbnailPromptsPrompt(input: ThumbnailPromptInput): string {
  const { productName, brand, categoryName, listingTitle, bulletPoints, listingDescription,
          keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
          creativeBrief, productPhotoDescriptions } = input

  const researchContext = buildImageResearchContext({
    keywordAnalysis, reviewAnalysis, qnaAnalysis, competitorAnalysis, marketIntelligence,
    listingTitle, bulletPoints, listingDescription, creativeBrief, productPhotoDescriptions,
  })

  return `You are an expert Amazon product video thumbnail designer and visual strategist. Generate 5 highly detailed video thumbnail concepts for an Amazon product listing video.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${researchContext}
=== TASK ===
Generate exactly 5 video thumbnail concepts. These are static images used as the thumbnail/cover frame for product videos on Amazon. They must be eye-catching, clickable, and communicate a clear value proposition in under 1 second of viewing. The thumbnail is the "scroll stopper" that determines if a customer clicks to watch the video.

=== APPROACH OPTIONS ===
Each concept MUST use a DIFFERENT approach:
1. Hero Shot — Product front-and-center with bold benefit text. High contrast, clean or gradient background. Product fills 60-70% of frame.
2. Before/After — Split-screen showing transformation or problem-to-solution. Left = pain point, Right = solution with product. Clear visual contrast.
3. Lifestyle Action — Product in use, mid-action, conveying energy and real-world context. Specific person/scenario from research data.
4. Feature Callout — Close-up on 2-3 key features with annotation arrows, circles, or zoom-in bubbles. Technical but visually engaging.
5. Unboxing/What's Included — Everything laid out in flat-lay style, showing value and completeness. Birds-eye view, organized arrangement.

=== THUMBNAIL BEST PRACTICES ===
- Visually DISTINCT from the main listing image (different angle, background, energy)
- Text overlays are expected — suggest bold, short text (5-12 words) in high-contrast colors
- Bright, high-contrast colors for clickability in search results and mobile
- Show the product clearly but with MORE context/energy than the main image
- Consider mobile viewing: text must be legible at small size (large font, high contrast)
- 16:9 landscape orientation is standard for video thumbnails
- Use a "play button" mentality — the image should suggest motion/action

=== RESEARCH-DRIVEN DIRECTION ===
Use ALL research data to pick the most compelling angles:
- Feature demand + surface demand → which features to spotlight
- Customer concerns + high-risk questions → what to address visually
- Use cases → which scenario to show
- Strengths + messaging framework → what emotional tone to convey
- Competitor differentiation gaps → visually demonstrate our USPs
- Image optimization opportunities → follow review-driven image suggestions
- Listing content (if available) → ensure thumbnail aligns with listing claims

=== OUTPUT FORMAT ===
Return valid JSON only, no markdown fences:
{
  "concepts": [
    {
      "position": 1,
      "title": "Short descriptive title (3-6 words)",
      "approach": "one of: hero_shot, before_after, lifestyle_action, feature_callout, unboxing",
      "description": "What this thumbnail communicates and why this angle was chosen based on research (2-3 sentences)",
      "text_overlay": "Suggested bold text overlay for the thumbnail (5-12 words)",
      "prompt": "Full image generation prompt (100-200 words). Describe scene, subjects, composition, lighting, colors, product placement, mood, atmosphere. Be specific about spatial arrangement, props, and visual narrative. Do NOT include text in the prompt — text overlays are added separately.",
      "camera_angle": "Specific camera angle, e.g. '¾ elevated view looking down at 30 degrees'",
      "lighting": "Detailed lighting description, e.g. 'Bright studio key light from upper left with warm fill light, soft shadow to bottom-right'",
      "mood": "Emotional atmosphere, e.g. 'Energetic, creative, inspiring, approachable'",
      "color_direction": "Primary colors and contrast strategy, e.g. 'Vibrant product colors against deep teal gradient background, white text with drop shadow'",
      "compliance_notes": "Amazon video thumbnail compliance notes, e.g. 'No misleading imagery, product must be recognizable, text readable at mobile size'"
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
  productPhotoDescriptions?: Record<string, import('@/types/api').ProductPhotoDescription> | null
}

export interface SwatchConceptResult {
  concepts: Array<{
    position: number
    variant_name: string
    prompt: string
  }>
}

function buildSwatchPromptsPrompt(input: SwatchPromptInput): string {
  const { productName, brand, categoryName, variants, productPhotoDescriptions } = input

  const variantList = variants
    .map((v, i) => {
      const parts = [`${i + 1}. "${v.name}"`]
      if (v.color_hex) parts.push(`Hex: ${v.color_hex}`)
      if (v.material) parts.push(`Material: ${v.material}`)
      if (v.description) parts.push(`Description: ${v.description}`)
      return parts.join(' | ')
    })
    .join('\n')

  // Build product appearance section from photo descriptions if available
  let photoSection = ''
  if (productPhotoDescriptions && Object.keys(productPhotoDescriptions).length > 0) {
    const photoEntries = Object.values(productPhotoDescriptions)
      .map((desc, i) => {
        const d = desc as import('@/types/api').ProductPhotoDescription
        return `Photo ${i + 1}: ${d.description}\n   Features: ${d.detected_features?.join(', ') || 'N/A'}\n   Colors: ${d.dominant_colors?.join(', ') || 'N/A'}`
      })
      .join('\n')
    photoSection = `\n=== ACTUAL PRODUCT APPEARANCE (from uploaded photos) ===\n${photoEntries}\n\nIMPORTANT: Describe THIS specific product accurately in each swatch — its exact shape, form factor, and distinguishing features. Only vary the color/material per variant.\n`
  }

  return `You are an expert Amazon product photography director specializing in swatch and variant images. Generate image prompts for product variant swatches.

=== PRODUCT ===
Product: ${productName}
Brand: ${brand}
Category: ${categoryName}
${photoSection}
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
