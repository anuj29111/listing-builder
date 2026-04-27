/**
 * Rufus Full Amy Loop orchestrator.
 *
 * Coordinates the multi-phase loop:
 *   Pass 1 (5 framing Qs) → Pass 2 (15 generated follow-ups) → Synthesis (recommendations.md)
 *
 * Called from the queue completion endpoint after each phase finishes.
 * Persists every data point to the 4 new v2 tables:
 *   - lb_rufus_loop_runs        (orchestration tracking, FK chains)
 *   - lb_rufus_pass2_questions  (RAW: 15 questions Claude generated, audit trail)
 *   - lb_rufus_synthesis        (RAW: synthesis md + structured JSON, versioned)
 *
 * Also keeps existing fields (lb_rufus_job_items.synthesis_md, custom_questions)
 * populated for backwards compatibility with the UI poll loop.
 */
import { createAdminClient } from '@/lib/supabase/server'
import {
  generatePass2Questions,
  generateSynthesis,
  type SynthesisStructured,
} from '@/lib/rufus-claude'

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

const AMY_PASS1_NORMALIZED = AMY_PASS1_QUESTIONS.map((q) =>
  q.toLowerCase().trim()
)

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
 * Find the 5 Pass-1 framing answers in the ASIN's Q&A array.
 *  1) Try exact-text match against Amy's 5 framing questions (preferred — clean signal).
 *  2) Fallback: take the first 5 Rufus entries by capture order. Covers the case where
 *     the Chrome extension typed varied phrasings, ran in auto-chips mode by accident,
 *     or any other situation where the exact 5 strings aren't present verbatim.
 *  Returns null only if there aren't even 5 Rufus entries.
 */
function extractPass1FromQA(qa: QAPair[]): QAPair[] | null {
  const rufusOnly = qa.filter((q) => q.source === 'rufus')
  if (rufusOnly.length < AMY_PASS1_QUESTIONS.length) return null

  // (1) exact match
  const exact: QAPair[] = []
  for (const norm of AMY_PASS1_NORMALIZED) {
    const match = rufusOnly.find((q) => q.question.toLowerCase().trim() === norm)
    if (match) exact.push(match)
  }
  if (exact.length === AMY_PASS1_QUESTIONS.length) return exact

  // (2) fallback — first 5 by capture order
  return rufusOnly.slice(0, AMY_PASS1_QUESTIONS.length)
}

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
  return extractPass1FromQA(data.questions)
}

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
 * Find the loop_run associated with a job_item.
 * Loop run is bound to (job_id, asin) — there's exactly one per Amy loop attempt.
 */
async function findLoopRunForItem(
  jobId: string,
  asin: string
): Promise<{ id: string } | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_rufus_loop_runs')
    .select('id')
    .eq('job_id', jobId)
    .eq('asin', asin)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()
  return data ?? null
}

/**
 * Compute the next synthesis version for (asin, country_id).
 */
async function nextSynthesisVersion(
  asin: string,
  countryId: string
): Promise<number> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_rufus_synthesis')
    .select('version')
    .eq('asin', asin)
    .eq('country_id', countryId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>()
  return (data?.version ?? 0) + 1
}

/**
 * Public helper: persist a fresh synthesis row + return the inserted record.
 * Used both by the orchestrator (Pass 2 completion) and by the standalone
 * /api/rufus-qna/generate-synthesis route (manual trigger / regen / backfill).
 */
export async function persistSynthesis(args: {
  asin: string
  countryId: string
  marketplaceDomain: string
  qaPairs: QAPair[]
  loopRunId?: string | null
  source: 'amy_loop' | 'manual_regen' | 'backfill' | 'bulk'
  generatedBy?: string | null
}): Promise<{
  id: string
  version: number
  synthesis_md: string
  structured: SynthesisStructured | null
  cost_usd: number
}> {
  const adminClient = createAdminClient()
  const synth = await generateSynthesis(
    args.asin,
    args.marketplaceDomain,
    args.qaPairs
  )

  const pass1Count = args.qaPairs.filter((q) =>
    AMY_PASS1_NORMALIZED.includes(q.question.toLowerCase().trim())
  ).length
  const pass2Count = args.qaPairs.length - pass1Count

  const version = await nextSynthesisVersion(args.asin, args.countryId)

  const { data: row, error } = await adminClient
    .from('lb_rufus_synthesis')
    .insert({
      asin: args.asin,
      country_id: args.countryId,
      marketplace_domain: args.marketplaceDomain,
      loop_run_id: args.loopRunId ?? null,
      version,
      synthesis_md: synth.synthesis_md,
      structured_json: synth.structured ?? null,
      input_qa_total: args.qaPairs.length,
      input_pass1_count: pass1Count,
      input_pass2_count: pass2Count,
      model_used: synth.model_used,
      claude_message_id: synth.claude_message_id,
      cost_usd: synth.cost_usd,
      input_tokens: synth.input_tokens,
      output_tokens: synth.output_tokens,
      web_searches_used: synth.web_searches_used,
      thinking_used: synth.thinking_used,
      prompt_text: synth.prompt_text,
      source: args.source,
      generated_by: args.generatedBy ?? null,
    })
    .select('id, version')
    .single<{ id: string; version: number }>()

  if (error || !row) {
    throw new Error(`Failed to persist synthesis: ${error?.message}`)
  }

  // Update review status: bump current_synthesis_id; create row if missing
  await adminClient
    .from('lb_asin_review_status')
    .upsert(
      {
        asin: args.asin,
        country_id: args.countryId,
        marketplace_domain: args.marketplaceDomain,
        current_synthesis_id: row.id,
      },
      { onConflict: 'asin,country_id' }
    )

  return {
    id: row.id,
    version: row.version,
    synthesis_md: synth.synthesis_md,
    structured: synth.structured,
    cost_usd: synth.cost_usd,
  }
}

/**
 * Public helper: persist a fresh Pass 2 question set + return the inserted record.
 * Used by orchestrator (Pass 1 completion) and standalone /generate-pass2.
 */
export async function persistPass2Questions(args: {
  asin: string
  countryId: string
  marketplaceDomain: string
  pass1: QAPair[]
  loopRunId?: string | null
  source: 'amy_loop' | 'manual' | 'backfill' | 'regen'
  generatedBy?: string | null
}): Promise<{
  id: string
  questions: string[]
  cost_usd: number
}> {
  const adminClient = createAdminClient()
  const result = await generatePass2Questions(
    args.asin,
    args.marketplaceDomain,
    args.pass1
  )

  const { data: row, error } = await adminClient
    .from('lb_rufus_pass2_questions')
    .insert({
      asin: args.asin,
      country_id: args.countryId,
      marketplace_domain: args.marketplaceDomain,
      loop_run_id: args.loopRunId ?? null,
      questions: result.questions,
      questions_count: result.questions.length,
      pass1_qa_count: args.pass1.length,
      pass1_qa_snapshot: args.pass1,
      model_used: result.model_used,
      claude_message_id: result.claude_message_id,
      cost_usd: result.cost_usd,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      thinking_used: result.thinking_used,
      prompt_text: result.prompt_text,
      source: args.source,
      generated_by: args.generatedBy ?? null,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    throw new Error(`Failed to persist Pass 2 questions: ${error?.message}`)
  }

  return {
    id: row.id,
    questions: result.questions,
    cost_usd: result.cost_usd,
  }
}

/**
 * Called when a Pass 1 item completes successfully.
 *  1. Mark loop_run.pass1_completed_at + status='pass2_generating'
 *  2. Read Pass 1 answers from lb_asin_questions
 *  3. Generate Pass 2 questions via Claude → persist to lb_rufus_pass2_questions
 *  4. Insert child queue item (loop_phase='pass2') referencing those questions
 *  5. Update loop_run.pass2_question_set_id + status='pass2_running'
 */
export async function handlePass1Completion(itemId: string): Promise<{
  next_item_id?: string
  loop_run_id?: string
  pass2_question_set_id?: string
  cost_usd?: number
  skipped?: string
  error?: string
}> {
  const adminClient = createAdminClient()

  const { data: item } = await adminClient
    .from('lb_rufus_job_items')
    .select('id, job_id, asin, marketplace, loop_phase, status, started_at, completed_at')
    .eq('id', itemId)
    .single<{
      id: string
      job_id: string
      asin: string
      marketplace: string | null
      loop_phase: string | null
      status: string
      started_at: string | null
      completed_at: string | null
    }>()

  if (!item) return { error: 'item not found' }
  if (item.loop_phase !== 'pass1') return { skipped: 'not a pass1 item' }
  if (item.status !== 'completed') return { skipped: 'pass1 not completed' }

  const marketplace = item.marketplace || 'amazon.com'
  const countryId = await resolveCountryId(marketplace)
  if (!countryId) return { error: `unknown marketplace: ${marketplace}` }

  // Find the loop_run for this job/asin
  const loopRun = await findLoopRunForItem(item.job_id, item.asin)
  if (!loopRun) {
    return { error: `loop_run not found for job=${item.job_id} asin=${item.asin}` }
  }

  // Mark loop_run progress
  await adminClient
    .from('lb_rufus_loop_runs')
    .update({
      status: 'pass2_generating',
      pass1_started_at: item.started_at,
      pass1_completed_at: item.completed_at ?? new Date().toISOString(),
    })
    .eq('id', loopRun.id)

  // Read Pass 1 answers
  const pass1 = await getPass1Answers(item.asin, countryId)
  if (!pass1) {
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({
        status: 'failed',
        error_phase: 'pass1_extract',
        error_message: 'Pass 1 answers incomplete in lb_asin_questions',
      })
      .eq('id', loopRun.id)
    return { error: 'Pass 1 answers incomplete in lb_asin_questions' }
  }

  // Update loop_run with pass1 count
  await adminClient
    .from('lb_rufus_loop_runs')
    .update({ pass1_qa_count: pass1.length })
    .eq('id', loopRun.id)

  // Generate + persist Pass 2 questions
  let pass2Result: { id: string; questions: string[]; cost_usd: number }
  try {
    pass2Result = await persistPass2Questions({
      asin: item.asin,
      countryId,
      marketplaceDomain: marketplace,
      pass1,
      loopRunId: loopRun.id,
      source: 'amy_loop',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({
        status: 'failed',
        error_phase: 'pass2_generate',
        error_message: msg,
      })
      .eq('id', loopRun.id)
    return { error: `Pass 2 generation failed: ${msg}` }
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
      custom_questions: pass2Result.questions,
      parent_item_id: item.id,
      max_questions: pass2Result.questions.length,
    })
    .select('id')
    .single<{ id: string }>()

  if (insertErr || !newItem) {
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({
        status: 'failed',
        error_phase: 'pass2_enqueue',
        error_message: `Failed to create Pass 2 item: ${insertErr?.message}`,
      })
      .eq('id', loopRun.id)
    return { error: `Failed to create Pass 2 item: ${insertErr?.message}` }
  }

  // Wire loop_run → pass2 item + question_set
  await adminClient
    .from('lb_rufus_loop_runs')
    .update({
      pass2_item_id: newItem.id,
      pass2_question_set_id: pass2Result.id,
      pass2_questions_generated_at: new Date().toISOString(),
      status: 'pass2_running',
      total_claude_cost_usd: pass2Result.cost_usd,
    })
    .eq('id', loopRun.id)

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

  return {
    next_item_id: newItem.id,
    loop_run_id: loopRun.id,
    pass2_question_set_id: pass2Result.id,
    cost_usd: pass2Result.cost_usd,
  }
}

/**
 * Called when a Pass 2 item completes successfully.
 *  1. Mark loop_run.pass2_completed_at + status='synthesizing'
 *  2. Read all source='rufus' Q&A from lb_asin_questions
 *  3. Generate synthesis via Claude → persist to lb_rufus_synthesis (versioned)
 *  4. Update loop_run.synthesis_id + status='complete' + accumulate cost
 *  5. ALSO write synthesis_md to both pass1+pass2 job_items for UI back-compat
 */
export async function handlePass2Completion(itemId: string): Promise<{
  synthesis_saved?: boolean
  synthesis_id?: string
  synthesis_version?: number
  loop_run_id?: string
  cost_usd?: number
  skipped?: string
  error?: string
}> {
  const adminClient = createAdminClient()

  const { data: item } = await adminClient
    .from('lb_rufus_job_items')
    .select(
      'id, job_id, asin, marketplace, loop_phase, status, parent_item_id, started_at, completed_at, questions_found'
    )
    .eq('id', itemId)
    .single<{
      id: string
      job_id: string
      asin: string
      marketplace: string | null
      loop_phase: string | null
      status: string
      parent_item_id: string | null
      started_at: string | null
      completed_at: string | null
      questions_found: number | null
    }>()

  if (!item) return { error: 'item not found' }
  if (item.loop_phase !== 'pass2') return { skipped: 'not a pass2 item' }
  if (item.status !== 'completed') return { skipped: 'pass2 not completed' }

  const marketplace = item.marketplace || 'amazon.com'
  const countryId = await resolveCountryId(marketplace)
  if (!countryId) return { error: `unknown marketplace: ${marketplace}` }

  const loopRun = await findLoopRunForItem(item.job_id, item.asin)
  if (!loopRun) {
    return { error: `loop_run not found for job=${item.job_id} asin=${item.asin}` }
  }

  await adminClient
    .from('lb_rufus_loop_runs')
    .update({
      status: 'synthesizing',
      pass2_started_at: item.started_at,
      pass2_completed_at: item.completed_at ?? new Date().toISOString(),
      pass2_qa_count: item.questions_found ?? 0,
      synthesis_started_at: new Date().toISOString(),
    })
    .eq('id', loopRun.id)

  // Read all rufus Q&A
  const { data: row } = await adminClient
    .from('lb_asin_questions')
    .select('questions')
    .eq('asin', item.asin)
    .eq('country_id', countryId)
    .single<AsinQuestionsRow>()

  const allRufus = (row?.questions || []).filter((q) => q.source === 'rufus')
  if (allRufus.length < 5) {
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({
        status: 'failed',
        error_phase: 'synthesis_extract',
        error_message: `Not enough Rufus Q&A to synthesize (have ${allRufus.length})`,
      })
      .eq('id', loopRun.id)
    return { error: 'Not enough Rufus Q&A to synthesize' }
  }

  // Generate + persist synthesis
  let synth: {
    id: string
    version: number
    synthesis_md: string
    structured: SynthesisStructured | null
    cost_usd: number
  }
  try {
    synth = await persistSynthesis({
      asin: item.asin,
      countryId,
      marketplaceDomain: marketplace,
      qaPairs: allRufus,
      loopRunId: loopRun.id,
      source: 'amy_loop',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({
        status: 'failed',
        error_phase: 'synthesis_generate',
        error_message: msg,
      })
      .eq('id', loopRun.id)
    return { error: `Synthesis failed: ${msg}` }
  }

  // Backwards-compat: write synthesis_md to BOTH pass1 and pass2 job items
  const targets = [item.id, ...(item.parent_item_id ? [item.parent_item_id] : [])]
  for (const id of targets) {
    await adminClient
      .from('lb_rufus_job_items')
      .update({ synthesis_md: synth.synthesis_md })
      .eq('id', id)
  }

  // Wire loop_run final state + accumulate cost
  const { data: priorRun } = await adminClient
    .from('lb_rufus_loop_runs')
    .select('total_claude_cost_usd')
    .eq('id', loopRun.id)
    .single<{ total_claude_cost_usd: number }>()
  const totalCost =
    Number(priorRun?.total_claude_cost_usd ?? 0) + Number(synth.cost_usd)

  await adminClient
    .from('lb_rufus_loop_runs')
    .update({
      synthesis_id: synth.id,
      synthesis_completed_at: new Date().toISOString(),
      status: 'complete',
      total_claude_cost_usd: totalCost,
    })
    .eq('id', loopRun.id)

  return {
    synthesis_saved: true,
    synthesis_id: synth.id,
    synthesis_version: synth.version,
    loop_run_id: loopRun.id,
    cost_usd: totalCost,
  }
}

/**
 * Mark a loop_run failed with reason. Idempotent.
 */
export async function failLoopRun(
  loopRunId: string,
  errorPhase: string,
  errorMessage: string
): Promise<void> {
  const adminClient = createAdminClient()
  await adminClient
    .from('lb_rufus_loop_runs')
    .update({
      status: 'failed',
      error_phase: errorPhase,
      error_message: errorMessage,
    })
    .eq('id', loopRunId)
}
