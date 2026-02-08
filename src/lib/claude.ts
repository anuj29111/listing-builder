import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8192

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  return new Anthropic({ apiKey })
}

// --- Analysis Result Types ---

export interface KeywordTier {
  keyword: string
  searchVolume: number
  relevancy: number
  strategicValue: number
}

export interface KeywordAnalysisResult {
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
}

export interface ReviewAnalysisResult {
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
  }>
  negativeLanguage: Array<{
    word: string
    frequency: number
  }>
  bulletStrategy: Array<{
    bulletNumber: number
    focus: string
    evidence: string
    priority: string
  }>
}

export interface QnAAnalysisResult {
  summary: {
    totalQuestions: number
    topConcerns: string[]
  }
  themes: Array<{
    theme: string
    questionCount: number
    priority: string
    sampleQuestions: string[]
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
  }>
  faqForDescription: Array<{
    question: string
    answer: string
  }>
}

export type AnalysisResult =
  | KeywordAnalysisResult
  | ReviewAnalysisResult
  | QnAAnalysisResult

// --- Prompts ---

function buildKeywordAnalysisPrompt(csvContent: string, categoryName: string, countryName: string): string {
  return `You are an expert Amazon listing optimization analyst. Analyze the following keyword research CSV data for the product category "${categoryName}" in the "${countryName}" marketplace.

The CSV has these columns: Search Terms, Type, SV (search volume), Relev. (relevancy score 0-1), and ASIN rank columns.
- "SV" = monthly search volume
- "Relev." = relevancy score (higher = more relevant to the product). Values like "Residue" mean low/unclear relevancy.

Analyze and return a JSON object with this exact structure:
{
  "summary": {
    "totalKeywords": <number of keyword rows>,
    "totalSearchVolume": <sum of all SV>,
    "dataQuality": "<brief assessment>"
  },
  "highRelevancy": [top 15 keywords with relevancy >= 0.6, each: {"keyword": "", "searchVolume": 0, "relevancy": 0.0, "strategicValue": 0}],
  "mediumRelevancy": [top 10 keywords with relevancy 0.4-0.6, same shape],
  "customerIntentPatterns": [5-8 intent categories like "Surface-Specific", "Feature-Focused", etc. Each: {"category": "", "keywordCount": 0, "totalSearchVolume": 0, "priority": "HIGH/MEDIUM/LOW"}],
  "surfaceDemand": [surface types like Chalkboard, Window, Glass. Each: {"surfaceType": "", "keywordCount": 0, "totalSearchVolume": 0}],
  "featureDemand": [features like Erasable, Fine Tip, Liquid. Each: {"feature": "", "keywordCount": 0, "totalSearchVolume": 0, "priority": "CRITICAL/HIGH/MEDIUM/LOW"}],
  "titleKeywords": [top 5-8 must-include keywords for listing title],
  "bulletKeywords": [top 10-15 keywords for bullet points],
  "searchTermKeywords": [top 15-20 keywords for backend search terms]
}

For strategicValue, calculate: searchVolume * relevancy.
Treat "Residue" relevancy as 0.3 for calculation purposes.
Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${csvContent}`
}

function buildReviewAnalysisPrompt(csvContent: string, categoryName: string, countryName: string): string {
  return `You are an expert Amazon listing optimization analyst. Analyze the following product review CSV data for the product category "${categoryName}" in the "${countryName}" marketplace.

The CSV has columns: Date, Author, Verified, Helpful, Title, Body, Rating, Images, Videos, URL, Variation, Style.

Analyze ALL reviews and return a JSON object with this exact structure:
{
  "summary": {
    "totalReviews": <count>,
    "averageRating": <float>,
    "positivePercent": <% of 4-5 star>,
    "negativePercent": <% of 1-2 star>
  },
  "ratingDistribution": [for each 1-5 star: {"stars": 5, "count": 0, "percentage": 0.0}],
  "useCases": [top 15 use cases by frequency: {"useCase": "", "frequency": 0, "priority": "CRITICAL/HIGH/MEDIUM/LOW"}],
  "strengths": [top 10 product strengths from positive reviews: {"strength": "", "mentions": 0, "impact": "PRIMARY DIFFERENTIATOR/CRITICAL FEATURE/etc."}],
  "weaknesses": [top 8 product weaknesses from negative reviews: {"weakness": "", "mentions": 0, "impact": "CRITICAL ISSUE/RELIABILITY FAILURE/etc."}],
  "positiveLanguage": [top 10 positive descriptors customers use: {"word": "", "frequency": 0}],
  "negativeLanguage": [top 10 negative descriptors: {"word": "", "frequency": 0}],
  "bulletStrategy": [5 bullets mapped to review insights: {"bulletNumber": 1, "focus": "", "evidence": "<brief review evidence>", "priority": "HIGH/MEDIUM"}]
}

Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${csvContent}`
}

function buildQnAAnalysisPrompt(csvContent: string, categoryName: string, countryName: string, isRufus: boolean): string {
  const source = isRufus ? 'Amazon Rufus AI' : 'Amazon customer'
  return `You are an expert Amazon listing optimization analyst. Analyze the following ${source} Q&A data for the product category "${categoryName}" in the "${countryName}" marketplace.

The data is formatted as Q&A pairs (Q1:, A1:, Q2:, A2:, etc.).

Analyze all questions and answers, then return a JSON object with this exact structure:
{
  "summary": {
    "totalQuestions": <count>,
    "topConcerns": ["concern 1", "concern 2", "concern 3"]
  },
  "themes": [5-8 question themes: {"theme": "", "questionCount": 0, "priority": "HIGH/MEDIUM/LOW", "sampleQuestions": ["q1", "q2"]}],
  "customerConcerns": [top 10 concerns: {"concern": "", "frequency": 0, "addressInListing": true/false, "suggestedResponse": ""}],
  "contentGaps": [3-5 gaps the listing should address: {"gap": "", "importance": "HIGH/MEDIUM/LOW", "recommendation": ""}],
  "faqForDescription": [top 5 Q&As to weave into listing description: {"question": "", "answer": ""}]
}

Only return valid JSON, no markdown fences or explanation.

CSV DATA:
${csvContent}`
}

// --- Analysis Functions ---

export async function analyzeKeywords(
  csvContent: string,
  categoryName: string,
  countryName: string
): Promise<{ result: KeywordAnalysisResult; model: string; tokensUsed: number }> {
  const client = getClient()
  const prompt = buildKeywordAnalysisPrompt(csvContent, categoryName, countryName)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(text) as KeywordAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model: MODEL, tokensUsed }
}

export async function analyzeReviews(
  csvContent: string,
  categoryName: string,
  countryName: string
): Promise<{ result: ReviewAnalysisResult; model: string; tokensUsed: number }> {
  const client = getClient()
  const prompt = buildReviewAnalysisPrompt(csvContent, categoryName, countryName)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(text) as ReviewAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model: MODEL, tokensUsed }
}

export async function analyzeQnA(
  csvContent: string,
  categoryName: string,
  countryName: string,
  isRufus: boolean
): Promise<{ result: QnAAnalysisResult; model: string; tokensUsed: number }> {
  const client = getClient()
  const prompt = buildQnAAnalysisPrompt(csvContent, categoryName, countryName, isRufus)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const result = JSON.parse(text) as QnAAnalysisResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model: MODEL, tokensUsed }
}
