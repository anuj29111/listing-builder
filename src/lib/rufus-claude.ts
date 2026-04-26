/**
 * Claude prompt builders + callers for the Rufus Full Amy Loop.
 *
 * Two responsibilities:
 *   1. generatePass2Questions — given Pass 1 answers, produce 15 product-specific follow-ups
 *   2. generateSynthesis — given full Rufus Q&A set, produce a recommendations.md
 */
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_CLAUDE_MODEL } from '@/lib/constants'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

async function getApiKey(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'anthropic_api_key')
      .single<{ value: string }>()
    if (data?.value) return data.value
  } catch {
    // fall through
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) return apiKey
  throw new Error('ANTHROPIC_API_KEY not found')
}

async function getModel(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'claude_model')
      .single<{ value: string }>()
    if (data?.value) return data.value
  } catch {
    // fall through
  }
  return DEFAULT_CLAUDE_MODEL
}

function stripFences(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n')
    if (firstNewline !== -1) cleaned = cleaned.slice(firstNewline + 1)
  }
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  return cleaned.trim()
}

/**
 * Generate 15 product-specific follow-up questions for Pass 2.
 * Returns an array of question strings.
 */
export async function generatePass2Questions(
  asin: string,
  marketplace: string,
  pass1: QAPair[]
): Promise<string[]> {
  const apiKey = await getApiKey()
  const model = await getModel()
  const client = new Anthropic({ apiKey })

  const pass1Block = pass1
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n')

  const prompt = `You are designing 15 Rufus follow-up questions for an Amazon product listing audit.

Product ASIN: ${asin}
Marketplace: ${marketplace}

Pass 1 answers from Rufus (5 framing questions):

${pass1Block}

Generate exactly 15 product-specific follow-up questions. Cover these buckets:
- Bucket 1 (3 Qs): Drill into the #1 buyer concern from Q3 ("don't like")
- Bucket 2 (2 Qs): Probe the strongest differentiator from Q5 ("why choose")
- Bucket 3 (2 Qs): Identify avatar use cases beyond what Q1 mentioned
- Bucket 4 (2 Qs): Direct comparison with each competitor named in Q4
- Bucket 5 (2 Qs): First-time buyer concerns + activation/usage instructions
- Bucket 6 (2 Qs): Surface compatibility / safety / kid-friendly aspects
- Bucket 7 (2 Qs): Persuasive review themes + unique selling reframes

Each question MUST:
- Be specific to this product (not generic)
- Use varied phrasings (avoid repeating exact wording from Pass 1)
- Be answerable by Rufus (Amazon's customer-facing AI assistant)
- End with a question mark

Respond with ONLY a JSON object in this exact shape (no prose, no markdown):
{ "questions": ["Q6 text?", "Q7 text?", ..., "Q20 text?"] }`

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const cleaned = stripFences(textBlock.text)
  let parsed: { questions?: unknown }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed.questions)) {
    throw new Error('Claude response missing questions array')
  }

  const questions = (parsed.questions as unknown[])
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim())

  if (questions.length === 0) {
    throw new Error('Claude returned empty questions array')
  }

  return questions
}

/**
 * Generate the synthesis markdown ("listing_recommendations.md") from a full
 * Rufus Q&A set. Returns the markdown content as a string.
 */
export async function generateSynthesis(
  asin: string,
  marketplace: string,
  qaPairs: QAPair[]
): Promise<string> {
  const apiKey = await getApiKey()
  const model = await getModel()
  const client = new Anthropic({ apiKey })

  const qaBlock = qaPairs
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n')

  const prompt = `You are reviewing Rufus AI Q&A pairs captured from Amazon for ASIN ${asin} (marketplace: ${marketplace}).

Below are ${qaPairs.length} question/answer pairs Rufus generated:

${qaBlock}

Write a \`listing_recommendations.md\` document for this ASIN. Use this exact structure:

## 🔴 Top 3 critical changes
The 3 highest-impact listing changes (title, image, bullet copy) ranked by conversion lift potential.

## 🟡 Tier-2 fixes
4-6 secondary changes for image gallery, bullet refinements, FAQ.

## 🆕 Use-case images
Specific gallery image briefs based on use cases Rufus named. Each brief should be 1-2 sentences and immediately handoff-ready to a designer.

## 🆚 Competitor positioning
Markdown table comparing this product to competitors Rufus named. Columns: Competitor | Their edge | Chalkola's edge.

## ⚠️ Hidden risks Rufus flagged
Issues to address proactively in copy/images.

## 💪 Moat statement
End with the single strongest moat statement Rufus surfaced for this product (1-2 sentences, ready to drop into a hero bullet).

Use markdown tables, bullets, and bold formatting. Keep it tight — every sentence must be actionable. Do not add a preamble or postamble; start directly with the first \`##\` heading.`

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for synthesis')
  }

  return textBlock.text.trim()
}
