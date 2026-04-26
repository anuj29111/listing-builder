import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions, validateExtensionKey } from '@/lib/rufus-cors'
import { handlePass1Completion, handlePass2Completion } from '@/lib/rufus-orchestrator'

const STALE_THRESHOLD_MINUTES = 30

export async function OPTIONS() {
  return corsOptions()
}

/**
 * GET /api/rufus-qna/queue
 *
 * Called by the Chrome extension to get the next pending ASIN to process.
 * Auto-resets stale items (stuck in 'processing' for >30 min).
 * Returns the next pending item AND its loop_phase + custom_questions if present,
 * so the extension can run Manual mode for Pass 1 / Pass 2 of the Amy loop.
 */
export async function GET(request: Request) {
  try {
    const adminClient = createAdminClient()
    const isValid = await validateExtensionKey(request, adminClient)
    if (!isValid) return corsJson({ error: 'Invalid or missing API key' }, 401)

    // Step 1: Auto-reset stale items (extension crashed mid-ASIN)
    const staleThreshold = new Date(
      Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000
    ).toISOString()
    await adminClient
      .from('lb_rufus_job_items')
      .update({ status: 'pending', started_at: null })
      .eq('status', 'processing')
      .lt('started_at', staleThreshold)

    // Step 2: Find active jobs
    const { data: activeJobs } = await adminClient
      .from('lb_rufus_jobs')
      .select('id, status, marketplace_domain, loop_mode')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true })
      .limit(5)

    if (!activeJobs || activeJobs.length === 0) {
      return corsJson({ item: null })
    }

    const activeJobIds = activeJobs.map((j) => j.id)

    const { data: nextItem, error: fetchErr } = await adminClient
      .from('lb_rufus_job_items')
      .select(
        'id, job_id, asin, marketplace, loop_phase, custom_questions, max_questions, parent_item_id'
      )
      .in('job_id', activeJobIds)
      .eq('status', 'pending')
      .order('job_id', { ascending: true })
      .limit(1)
      .single()

    if (fetchErr || !nextItem) {
      return corsJson({ item: null })
    }

    // Step 3: Mark item as processing
    await adminClient
      .from('lb_rufus_job_items')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', nextItem.id)

    // Step 4: If this job was 'queued', transition it to 'processing'
    const job = activeJobs.find((j) => j.id === nextItem.job_id)
    if (job && job.status === 'queued') {
      await adminClient
        .from('lb_rufus_jobs')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', nextItem.job_id)
    }

    const marketplace =
      nextItem.marketplace || job?.marketplace_domain || 'amazon.com'

    // Normalize custom_questions to a clean string array (or null)
    let customQuestions: string[] | null = null
    if (Array.isArray(nextItem.custom_questions)) {
      customQuestions = (nextItem.custom_questions as unknown[])
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
      if (customQuestions.length === 0) customQuestions = null
    }

    return corsJson({
      item: {
        item_id: nextItem.id,
        job_id: nextItem.job_id,
        asin: nextItem.asin,
        marketplace,
        max_questions: nextItem.max_questions ?? 50,
        loop_phase: nextItem.loop_phase ?? null,
        custom_questions: customQuestions,
        parent_item_id: nextItem.parent_item_id ?? null,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Queue GET error:', e)
    return corsJson({ error: message }, 500)
  }
}

/**
 * POST /api/rufus-qna/queue
 *
 * Called by the Chrome extension to mark an item as completed or failed.
 * Updates job counters and checks if the job is done (70% threshold).
 *
 * If the completed item was Pass 1 of an Amy loop → triggers Pass 2 generation.
 * If the completed item was Pass 2 of an Amy loop → triggers synthesis generation.
 * Orchestrator runs synchronously so the next phase queue item is created
 * before this response returns.
 */
export async function POST(request: Request) {
  try {
    const adminClient = createAdminClient()
    const isValid = await validateExtensionKey(request, adminClient)
    if (!isValid) return corsJson({ error: 'Invalid or missing API key' }, 401)

    const body = await request.json()
    const { item_id, status, questions_found, error_message } = body

    if (!item_id || !status) {
      return corsJson({ error: 'item_id and status are required' }, 400)
    }

    if (!['completed', 'failed', 'skipped'].includes(status)) {
      return corsJson(
        { error: 'status must be completed, failed, or skipped' },
        400
      )
    }

    // Step 1: Get the item to find its job_id and loop_phase
    const { data: item, error: itemErr } = await adminClient
      .from('lb_rufus_job_items')
      .select('id, job_id, status, loop_phase')
      .eq('id', item_id)
      .single<{
        id: string
        job_id: string
        status: string
        loop_phase: string | null
      }>()

    if (itemErr || !item) {
      return corsJson({ error: 'Item not found' }, 404)
    }

    // Step 2: Update the item
    await adminClient
      .from('lb_rufus_job_items')
      .update({
        status,
        questions_found: questions_found || 0,
        error_message: error_message || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item_id)

    // Step 3: Update job counters
    const { data: job } = await adminClient
      .from('lb_rufus_jobs')
      .select('id, total_asins, completed_asins, failed_asins, loop_mode')
      .eq('id', item.job_id)
      .single<{
        id: string
        total_asins: number
        completed_asins: number
        failed_asins: number
        loop_mode: string | null
      }>()

    let orchestratorResult: object | null = null

    if (job) {
      const newCompleted =
        status === 'completed' ? job.completed_asins + 1 : job.completed_asins
      const newFailed =
        status !== 'completed' ? job.failed_asins + 1 : job.failed_asins

      const updates: Record<string, unknown> = {
        completed_asins: newCompleted,
        failed_asins: newFailed,
        updated_at: new Date().toISOString(),
      }

      // Step 4: Orchestrator hook for Amy loop
      // Only fire on successful completion of pass1 / pass2 within a full_amy_loop job
      if (status === 'completed' && job.loop_mode === 'full_amy_loop') {
        try {
          if (item.loop_phase === 'pass1') {
            orchestratorResult = await handlePass1Completion(item_id)
          } else if (item.loop_phase === 'pass2') {
            orchestratorResult = await handlePass2Completion(item_id)
          }
        } catch (e) {
          console.error('Orchestrator error:', e)
          orchestratorResult = {
            error: e instanceof Error ? e.message : String(e),
          }
        }
      }

      // Step 5: Re-read job (orchestrator may have bumped total_asins by adding pass2)
      const { data: refreshedJob } = await adminClient
        .from('lb_rufus_jobs')
        .select('total_asins')
        .eq('id', item.job_id)
        .single<{ total_asins: number }>()
      const totalAsins = refreshedJob?.total_asins ?? job.total_asins
      const totalProcessed = newCompleted + newFailed

      // Step 6: Mark job done if all items processed
      // For full_amy_loop, only mark complete when pass2 has finished
      // (pass1 completion creates pass2 item — not "done" yet)
      if (totalProcessed >= totalAsins) {
        const successRate = totalAsins > 0 ? newCompleted / totalAsins : 0
        updates.status = successRate >= 0.7 ? 'completed' : 'completed_partial'
      }

      await adminClient.from('lb_rufus_jobs').update(updates).eq('id', item.job_id)
    }

    return corsJson({
      success: true,
      orchestrator: orchestratorResult,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Queue POST error:', e)
    return corsJson({ error: message }, 500)
  }
}
