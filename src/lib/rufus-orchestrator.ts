/**
 * Rufus Full Amy Loop orchestrator.
 *
 * Coordinates the multi-phase loop:
 *   Pass 1 (5 framing Qs) → Pass 2 (15 generated follow-ups) → Synthesis (recommendations.md)
 *
 * Called from the queue completion endpoint after each phase finishes.
 * Uses internal HTTP self-calls so phase generation can be overridden via the
 * dedicated /generate-pass2 and /generate-synthesis endpoints (or invoked
 * directly here for fast-path orchestration).
 */
import { createAdminClient } from '@/lib/supabase/server'
import { generatePass2Questions, generateSynthesis } from '@/lib/rufus-claude'

/**
 * Amy Wees' 5 framing questions for Pass 1.
 * These prime Rufus's chat memory for the product so subsequent
 * Pass 2 questions get richer, more specific answers.
 */
export const AMY_PASS1_QUESTIONS: string[] = [
  'What is this product for?',
  'What do people like about this product?',
  "What don't people like about this product?",
  'What are people buying instead and why?',
  'Why do people choose this product over alternatives?',
]

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

interface AsinQuestionsRow {
  questions: QAPair[]
}

/**
 * Fetch Pass 1 answers (the first 5 source='rufus' Q&A) for an ASIN.
 * Returns null if not enough Pass 1 answers exist yet.
 */
async function getPass1Answers(
  asin: string,
  countryId: string
): Promise<QAPair[] | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_asin_questions')
    .select('questions')
    .eq('asin', asin)
    .eq('country_id', countryId)
    .single<AsinQuestionsRow>()

  if (!data?.questions || !Array.isArray(data.questions)) return null

  const rufusOnly = data.questions.filter((q) => q.source === 'rufus')
  if (rufusOnly.length < AMY_PASS1_QUESTIONS.length) return null

  // Pass 1 = the answers to the 5 Amy framing questions, in order.
  // Match by exact question text (lowercased, trimmed).
  const pass1: QAPair[] = []
  for (const amyQ of AMY_PASS1_QUESTIONS) {
    const norm = amyQ.toLowerCase().trim()
    const match = rufusOnly.find((q) => q.question.toLowerCase().trim() === norm)
    if (match) pass1.push(match)
  }

  return pass1.length === AMY_PASS1_QUESTIONS.length ? pass1 : null
}

/**
 * Look up country_id from a marketplace domain (e.g., "amazon.com").
 */
async function resolveCountryId(marketplace: string): Promise<string | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_countries')
    .select('id')
    .eq('amazon_domain', marketplace)
    .single<{ id: string }>()
  return data?.id ?? null
}

/**
 * Called when a Pass 1 item completes successfully.
 * Generates Pass 2 questions via Claude and creates a child queue item.
 */
export async function handlePass1Completion(itemId: string): Promise<{
  next_item_id?: string
  skipped?: string
  error?: string
}> {
  const adminClient = createAdminClient()

  const { data: item } = await adminClient
    .from('lb_rufus_job_items')
    .select('id, job_id, asin, marketplace, loop_phase, status')
    .eq('id', itemId)
    .single<{
      id: string
      job_id: string
      asin: string
      marketplace: string | null
      loop_phase: string | null
      status: string
    }>()

  if (!item) return { error: 'item not found' }
  if (item.loop_phase !== 'pass1') return { skipped: 'not a pass1 item' }
  if (item.status !== 'completed') return { skipped: 'pass1 not completed' }

  // Resolve marketplace + country
  const marketplace = item.marketplace || 'amazon.com'
  const countryId = await resolveCountryId(marketplace)
  if (!countryId) return { error: `unknown marketplace: ${marketplace}` }

  // Read Pass 1 answers from lb_asin_questions
  const pass1 = await getPass1Answers(item.asin, countryId)
  if (!pass1) return { error: 'Pass 1 answers incomplete in lb_asin_questions' }

  // Generate Pass 2 questions via Claude
  let questions: string[] = []
  try {
    questions = await generatePass2Questions(item.asin, marketplace, pass1)
  } catch (e) {
    return { error: `Pass 2 generation failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (!questions || questions.length === 0) {
    return { error: 'Pass 2 generator returned no questions' }
  }

  // Create child queue item: phase='pass2'
  const { data: newItem, error: insertErr } = await adminClient
    .from('lb_rufus_job_items')
    .insert({
      job_id: item.job_id,
      asin: item.asin,
      status: 'pending',
      marketplace,
      loop_phase: 'pass2',
      custom_questions: questions,
      parent_item_id: item.id,
      max_questions: questions.length,
    })
    .select('id')
    .single<{ id: string }>()

  if (insertErr || !newItem) {
    return { error: `Failed to create Pass 2 item: ${insertErr?.message}` }
  }

  // Bump job total_asins (we added a new child item)
  const { data: job } = await adminClient
    .from('lb_rufus_jobs')
    .select('total_asins')
    .eq('id', item.job_id)
    .single<{ total_asins: number }>()

  if (job) {
    await adminClient
      .from('lb_rufus_jobs')
      .update({ total_asins: job.total_asins + 1 })
      .eq('id', item.job_id)
  }

  return { next_item_id: newItem.id }
}

/**
 * Called when a Pass 2 item completes successfully.
 * Generates the synthesis via Claude and saves it to the parent (Pass 1) item's synthesis_md.
 */
export async function handlePass2Completion(itemId: string): Promise<{
  synthesis_saved?: boolean
  skipped?: string
  error?: string
}> {
  const adminClient = createAdminClient()

  const { data: item } = await adminClient
    .from('lb_rufus_job_items')
    .select('id, job_id, asin, marketplace, loop_phase, status, parent_item_id')
    .eq('id', itemId)
    .single<{
      id: string
      job_id: string
      asin: string
      marketplace: string | null
      loop_phase: string | null
      status: string
      parent_item_id: string | null
    }>()

  if (!item) return { error: 'item not found' }
  if (item.loop_phase !== 'pass2') return { skipped: 'not a pass2 item' }
  if (item.status !== 'completed') return { skipped: 'pass2 not completed' }

  const marketplace = item.marketplace || 'amazon.com'
  const countryId = await resolveCountryId(marketplace)
  if (!countryId) return { error: `unknown marketplace: ${marketplace}` }

  // Read all Rufus Q&A for this ASIN (Pass 1 + Pass 2 should both be present by now)
  const { data: row } = await adminClient
    .from('lb_asin_questions')
    .select('questions')
    .eq('asin', item.asin)
    .eq('country_id', countryId)
    .single<AsinQuestionsRow>()

  const allRufus = (row?.questions || []).filter((q) => q.source === 'rufus')
  if (allRufus.length < 5) return { error: 'Not enough Rufus Q&A to synthesize' }

  // Generate synthesis via Claude
  let synthesis = ''
  try {
    synthesis = await generateSynthesis(item.asin, marketplace, allRufus)
  } catch (e) {
    return { error: `Synthesis failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Save synthesis to BOTH the parent (pass1) item AND this pass2 item
  // so UI can find it whether it polls the head or the tail of the chain.
  const targets = [item.id, ...(item.parent_item_id ? [item.parent_item_id] : [])]
  for (const id of targets) {
    await adminClient
      .from('lb_rufus_job_items')
      .update({ synthesis_md: synthesis })
      .eq('id', id)
  }

  return { synthesis_saved: true }
}
