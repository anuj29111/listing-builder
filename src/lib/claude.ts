import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8192

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
}

export interface ListingGenerationResult {
  title: string[]
  bullets: string[][]
  description: string[]
  searchTerms: string[]
  subjectMatter: string[][]
}

// --- Listing Generation Prompt ---

function buildListingGenerationPrompt(input: ListingGenerationInput): string {
  const {
    productName, brand, asin, attributes, categoryName, countryName, language,
    charLimits, keywordAnalysis, reviewAnalysis, qnaAnalysis,
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
      ?.map((p) => `${p.category} (${p.priority})`)
      .join(', ') || 'N/A'
    const features = keywordAnalysis.featureDemand
      ?.map((f) => `${f.feature} (${f.priority})`)
      .join(', ') || 'N/A'
    keywordSection = `Must-include title keywords (by search volume priority): ${titleKw}
Bullet point keywords to weave in: ${bulletKw}
Backend search term keywords: ${searchKw}
Customer intent patterns: ${intents}
Key feature demand signals: ${features}`
  }

  let reviewSection = 'No review data available. Focus on general product benefits.'
  if (reviewAnalysis) {
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
      .map((w) => w.word)
      .join(', ') || 'N/A'
    const weaknesses = reviewAnalysis.weaknesses
      ?.slice(0, 4)
      .map((w) => `${w.weakness} (${w.mentions} mentions)`)
      .join(', ') || 'N/A'
    const bulletStrat = reviewAnalysis.bulletStrategy
      ?.map((b) => `Bullet ${b.bulletNumber}: Focus on "${b.focus}" — Evidence: ${b.evidence}`)
      .join('\n  ') || 'N/A'
    reviewSection = `Product strengths to highlight: ${strengths}
Top use cases to emphasize: ${useCases}
Customer language that resonates: ${posLang}
Weaknesses to preemptively address: ${weaknesses}
Bullet strategy from review analysis:
  ${bulletStrat}`
  }

  let qnaSection = 'No Q&A data available.'
  if (qnaAnalysis) {
    const concerns = qnaAnalysis.customerConcerns
      ?.slice(0, 6)
      .map((c) => `${c.concern} — Suggested: ${c.suggestedResponse}`)
      .join('\n  ') || 'N/A'
    const gaps = qnaAnalysis.contentGaps
      ?.map((g) => `${g.gap} (${g.importance})`)
      .join(', ') || 'N/A'
    const faqs = qnaAnalysis.faqForDescription
      ?.slice(0, 4)
      .map((f) => `Q: ${f.question} / A: ${f.answer}`)
      .join('\n  ') || 'N/A'
    qnaSection = `Top customer concerns to address in listing:
  ${concerns}
Content gaps to fill: ${gaps}
FAQ to weave into description:
  ${faqs}`
  }

  return `You are an expert Amazon listing copywriter. Generate an optimized product listing for the following product.

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
${qnaSection}

=== OUTPUT FORMAT ===
Return a JSON object with this EXACT structure:
{
  "title": ["variation 1", "variation 2", "variation 3"],
  "bullets": [
    ["bullet 1 var 1", "bullet 1 var 2", "bullet 1 var 3"],
    ["bullet 2 var 1", "bullet 2 var 2", "bullet 2 var 3"],
    ["bullet 3 var 1", "bullet 3 var 2", "bullet 3 var 3"],
    ["bullet 4 var 1", "bullet 4 var 2", "bullet 4 var 3"],
    ["bullet 5 var 1", "bullet 5 var 2", "bullet 5 var 3"]
  ],
  "description": ["variation 1", "variation 2", "variation 3"],
  "searchTerms": ["variation 1", "variation 2", "variation 3"],
  "subjectMatter": [
    ["field 1 var 1", "field 1 var 2", "field 1 var 3"],
    ["field 2 var 1", "field 2 var 2", "field 2 var 3"],
    ["field 3 var 1", "field 3 var 2", "field 3 var 3"]
  ]
}

=== RULES ===
1. Each variation must be DISTINCT in style/approach, not just rephrased
2. Variation 1: Keyword-dense, SEO-optimized — pack in as many relevant keywords as possible while remaining readable
3. Variation 2: Benefit-focused, emotional appeal — speak to the customer's needs and desires
4. Variation 3: Balanced — keywords + benefits combined naturally
5. Title MUST start with the brand name "${brand}"
6. Bullets should start with a CAPITALIZED benefit phrase followed by a dash or colon, then details
7. Search terms: no brand name, no ASINs, no commas (space-separated), include common misspellings and synonyms
8. Subject matter: short descriptive phrases for Amazon's subject matter fields (3 fields, each under 50 characters)
9. STRICT character limits — count characters carefully and stay under the limits above
10. ALL content in ${language}
11. Only return valid JSON, no markdown fences or explanation`
}

// --- Listing Generation Function ---

export async function generateListing(
  input: ListingGenerationInput
): Promise<{ result: ListingGenerationResult; model: string; tokensUsed: number }> {
  const client = await getClient()
  const prompt = buildListingGenerationPrompt(input)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 12288,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // Try to parse, handling potential markdown fences
  let jsonText = text.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }

  const result = JSON.parse(jsonText) as ListingGenerationResult
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return { result, model: MODEL, tokensUsed }
}

// --- Analysis Functions ---

export async function analyzeKeywords(
  csvContent: string,
  categoryName: string,
  countryName: string
): Promise<{ result: KeywordAnalysisResult; model: string; tokensUsed: number }> {
  const client = await getClient()
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
  const client = await getClient()
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
  const client = await getClient()
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
