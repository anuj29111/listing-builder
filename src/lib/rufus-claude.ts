/**
 * Claude prompt builders + callers for the Rufus Full Amy Loop.
 *
 * Two responsibilities:
 *   1. generatePass2Questions — given Pass 1 answers, produce 15 product-specific follow-ups
 *   2. generateSynthesis — given full Rufus Q&A set, produce both:
 *        a. listing_recommendations.md (markdown for humans)
 *        b. structured JSON (top_3_critical, tier_2_fixes, image_briefs, competitors, risks, moat)
 *
 * Both calls go through the shared `createMessage` helper from `claude.ts`,
 * so they automatically pick up:
 *   - Model from lb_admin_settings.claude_model (incl. "auto-sonnet" auto-resolve)
 *   - Extended thinking budget from lb_admin_settings.thinking_enabled / thinking_budget
 *   - Web search (research mode) when requested + enabled in admin settings
 *
 * Both functions return rich telemetry (tokens, cost, model_used, message_id) so
 * the orchestrator can persist a full audit trail to the new lb_rufus_pass2_questions
 * and lb_rufus_synthesis tables.
 */
import { getClient, getModel, createMessage, getThinkingConfig } from '@/lib/claude'
import type Anthropic from '@anthropic-ai/sdk'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

// Sonnet 4.6 pricing (USD per million tokens). Used for cost telemetry only.
// If a different model is resolved, cost is approximate; we still record the model_used.
const SONNET_INPUT_PER_MTOK = 3.0
const SONNET_OUTPUT_PER_MTOK = 15.0
const WEB_SEARCH_USD_PER_CALL = 0.02

function stripFences(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n')
    if (firstNewline !== -1) cleaned = cleaned.slice(firstNewline + 1)
  }
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  return cleaned.trim()
}

function extractText(message: { content: Array<{ type: string; text?: string }> }): string {
  // Concatenate all text blocks (skip thinking + tool_use + tool_result blocks)
  return message.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim()
}

function countWebSearchUses(message: { content: Array<{ type: string }> }): number {
  return message.content.filter((c) => c.type === 'server_tool_use' || c.type === 'web_search_tool_result').length / 2
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  webSearchUses: number
): number {
  const inputCost = (inputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK
  const outputCost = (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK
  const webCost = webSearchUses * WEB_SEARCH_USD_PER_CALL
  return Math.round((inputCost + outputCost + webCost) * 10000) / 10000
}

export interface Pass2Result {
  questions: string[]
  model_used: string
  claude_message_id: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  thinking_used: boolean
  prompt_text: string
}

export interface SynthesisStructured {
  top_3_critical?: Array<{
    title: string
    description: string
    expected_lift?: string
    target_field?: string // e.g. "title" | "main_image" | "bullet_1" | etc
  }>
  tier_2_fixes?: Array<{
    title: string
    description: string
    target_field?: string
  }>
  image_briefs?: Array<{
    filename_hint?: string
    description: string
    use_case?: string
    placement?: string // e.g. "gallery_2"
  }>
  competitors?: Array<{
    name: string
    their_edge: string
    our_edge: string
    price_or_position?: string
  }>
  hidden_risks?: Array<{
    risk: string
    mitigation: string
  }>
  moat_statement?: string
  buyer_avatars?: string[]
  use_cases?: string[]
}

export interface SynthesisResult {
  synthesis_md: string
  structured: SynthesisStructured | null
  model_used: string
  claude_message_id: string
  input_tokens: number
  output_tokens: number
  web_searches_used: number
  cost_usd: number
  thinking_used: boolean
  prompt_text: string
}

/**
 * Generate 15 product-specific follow-up questions for Pass 2.
 * Returns full telemetry for audit trail.
 */
export async function generatePass2Questions(
  asin: string,
  marketplace: string,
  pass1: QAPair[]
): Promise<Pass2Result> {
  const client = await getClient()
  const model = await getModel()
  const thinking = await getThinkingConfig()

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

  const response = await createMessage(
    client,
    {
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    },
    { webSearch: false }
  )

  const text = extractText(response)
  if (!text) throw new Error('Claude returned no text content')

  const cleaned = stripFences(text)
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

  const usage = (response as Anthropic.Message).usage
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0

  return {
    questions,
    model_used: response.model,
    claude_message_id: response.id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCost(inputTokens, outputTokens, 0),
    thinking_used: thinking.enabled,
    prompt_text: prompt,
  }
}

/**
 * Generate the synthesis ("listing_recommendations.md") + structured JSON from a full Rufus Q&A set.
 *
 * Output format: the model returns markdown for humans, then a fenced ```json block
 * with structured fields the listing wizard / review UI can render as cards.
 *
 * Web search ON so the model can verify competitor claims when useful.
 * Extended thinking ON for deeper reasoning.
 */
export async function generateSynthesis(
  asin: string,
  marketplace: string,
  qaPairs: QAPair[]
): Promise<SynthesisResult> {
  const client = await getClient()
  const model = await getModel()
  const thinking = await getThinkingConfig()

  const qaBlock = qaPairs
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n')

  const prompt = `You are reviewing Rufus AI Q&A pairs captured from Amazon for ASIN ${asin} (marketplace: ${marketplace}).

Below are ${qaPairs.length} question/answer pairs Rufus generated:

${qaBlock}

Produce TWO outputs separated by a sentinel line.

=== OUTPUT 1: HUMAN MARKDOWN ===

Write a \`listing_recommendations.md\` document. Use this exact structure:

## 🔴 Top 3 critical changes
The 3 highest-impact listing changes (title, image, bullet copy) ranked by conversion lift potential.

## 🟡 Tier-2 fixes
4-6 secondary changes for image gallery, bullet refinements, FAQ.

## 🆕 Use-case images
Specific gallery image briefs based on use cases Rufus named. Each brief should be 1-2 sentences and immediately handoff-ready to a designer.

## 🆚 Competitor positioning
Markdown table comparing this product to competitors Rufus named. Columns: Competitor | Their edge | Our edge.

## ⚠️ Hidden risks Rufus flagged
Issues to address proactively in copy/images.

## 💪 Moat statement
End with the single strongest moat statement Rufus surfaced for this product (1-2 sentences, ready to drop into a hero bullet).

Use markdown tables, bullets, and bold formatting. Keep it tight — every sentence must be actionable. Do not add a preamble or postamble; start directly with the first \`##\` heading.

=== END MARKDOWN ===

Now output the sentinel line exactly:

===STRUCTURED_JSON_BELOW===

=== OUTPUT 2: STRUCTURED JSON ===

Output a single JSON object with this exact shape (no markdown fences, just raw JSON):

{
  "top_3_critical": [
    {
      "title": "Short headline (≤80 chars)",
      "description": "2-3 sentence actionable description.",
      "expected_lift": "Optional rough estimate, e.g. '5-10% CVR'",
      "target_field": "title | main_image | bullet_1 | bullet_2 | description | a_plus | gallery_2 | etc"
    }
  ],
  "tier_2_fixes": [
    { "title": "...", "description": "...", "target_field": "..." }
  ],
  "image_briefs": [
    {
      "filename_hint": "lifestyle_classroom_use",
      "description": "Hand-held marker drawing a heart on a chalkboard, 4 children watching",
      "use_case": "classroom / kids art project",
      "placement": "gallery_2"
    }
  ],
  "competitors": [
    {
      "name": "Chalky Crown",
      "their_edge": "8g ink volume disclosed, lower price",
      "our_edge": "30 colors vs 12, fine 1mm tip option",
      "price_or_position": "$12.99 / 12 colors"
    }
  ],
  "hidden_risks": [
    { "risk": "Stains on porous surfaces", "mitigation": "Add porous-vs-non-porous chart in image gallery" }
  ],
  "moat_statement": "Single strongest 1-2 sentence moat ready to use in a hero bullet.",
  "buyer_avatars": ["teacher / classroom", "wedding decorator", "small-cafe owner"],
  "use_cases": ["chalkboard signs", "window menus", "kids art"]
}

Rules:
- Every field is required EXCEPT optional fields (expected_lift, filename_hint, use_case, placement, price_or_position, buyer_avatars, use_cases).
- top_3_critical must have exactly 3 items. tier_2_fixes 4-6 items.
- image_briefs: 3-5 items.
- competitors: list everyone Rufus named (could be 1-5).
- hidden_risks: 2-5 items.
- The structured JSON content must align with the markdown — same insights, just structured.
- Do NOT include trailing commas or comments in the JSON.

If web search is available and you spot a specific competitor brand name in the Q&A, you MAY use a small number of searches to verify their pricing, key features, or recent reviews — but only when it materially sharpens a recommendation. Don't burn searches on generic queries.`

  const response = await createMessage(
    client,
    {
      model,
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    },
    { webSearch: true }
  )

  const text = extractText(response)
  if (!text) throw new Error('Claude returned no text content for synthesis')

  // Split on sentinel
  const sentinel = '===STRUCTURED_JSON_BELOW==='
  let synthesis_md = text
  let structured: SynthesisStructured | null = null

  const sentinelIdx = text.indexOf(sentinel)
  if (sentinelIdx !== -1) {
    synthesis_md = text.slice(0, sentinelIdx).trim()
    // Strip any "=== END MARKDOWN ===" artifact tail from the markdown
    synthesis_md = synthesis_md.replace(/=== END MARKDOWN ===\s*$/i, '').trim()

    let jsonRaw = text.slice(sentinelIdx + sentinel.length).trim()
    // Strip "=== OUTPUT 2: STRUCTURED JSON ===" header if model echoed it
    jsonRaw = jsonRaw.replace(/^=== OUTPUT 2:[^=]*===\s*/i, '').trim()
    jsonRaw = stripFences(jsonRaw)
    // Trim to first {...} balanced object if there's trailing text
    const firstBrace = jsonRaw.indexOf('{')
    if (firstBrace !== -1) jsonRaw = jsonRaw.slice(firstBrace)
    const lastBrace = jsonRaw.lastIndexOf('}')
    if (lastBrace !== -1) jsonRaw = jsonRaw.slice(0, lastBrace + 1)

    try {
      structured = JSON.parse(jsonRaw) as SynthesisStructured
    } catch (err) {
      // Don't fail synthesis if structured parsing fails — markdown still useful.
      console.warn(
        `[synthesis] structured JSON parse failed for ${asin}:`,
        err instanceof Error ? err.message : err,
        '\nfirst 200 chars:',
        jsonRaw.slice(0, 200)
      )
      structured = null
    }
  }

  // Strip OUTPUT 1 marker if model echoed it
  synthesis_md = synthesis_md.replace(/^=== OUTPUT 1:[^=]*===\s*/i, '').trim()

  const usage = (response as Anthropic.Message).usage
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const webSearches = countWebSearchUses(response)

  return {
    synthesis_md,
    structured,
    model_used: response.model,
    claude_message_id: response.id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    web_searches_used: webSearches,
    cost_usd: estimateCost(inputTokens, outputTokens, webSearches),
    thinking_used: thinking.enabled,
    prompt_text: prompt,
  }
}
