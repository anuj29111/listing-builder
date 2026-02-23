import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const STALE_THRESHOLD_MINUTES = 30

/**
 * Validate the Rufus extension API key from the Authorization header.
 */
async function validateApiKey(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const providedKey = authHeader.slice(7).trim()
  if (!providedKey) return false

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_admin_settings')
    .select('value')
    .eq('key', 'rufus_extension_api_key')
    .single()

  if (!data?.value) return false
  return data.value === providedKey
}

/**
 * GET /api/rufus-qna/queue
 *
 * Called by the Chrome extension to get the next pending ASIN to process.
 * Auto-resets stale items (stuck in 'processing' for >30 min).
 * Returns the next pending item and marks it as 'processing'.
 */
export async function GET(request: Request) {
  try {
    const isValid = await validateApiKey(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Step 1: Auto-reset stale items (extension crashed mid-ASIN)
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString()
    await adminClient
      .from('lb_rufus_job_items')
      .update({ status: 'pending', started_at: null })
      .eq('status', 'processing')
      .lt('started_at', staleThreshold)

    // Step 2: Find active jobs, then get first pending item
    const { data: activeJobs } = await adminClient
      .from('lb_rufus_jobs')
      .select('id, status, marketplace_domain')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true })
      .limit(5)

    if (!activeJobs || activeJobs.length === 0) {
      return NextResponse.json({ item: null })
    }

    const activeJobIds = activeJobs.map((j) => j.id)

    const { data: nextItem, error: fetchErr } = await adminClient
      .from('lb_rufus_job_items')
      .select('id, job_id, asin')
      .in('job_id', activeJobIds)
      .eq('status', 'pending')
      .order('job_id', { ascending: true })
      .limit(1)
      .single()

    if (fetchErr || !nextItem) {
      return NextResponse.json({ item: null })
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

    return NextResponse.json({
      item: {
        item_id: nextItem.id,
        job_id: nextItem.job_id,
        asin: nextItem.asin,
        marketplace: job?.marketplace_domain || 'amazon.com',
        max_questions: 50,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Queue GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/rufus-qna/queue
 *
 * Called by the Chrome extension to mark an item as completed or failed.
 * Updates job counters and checks if the job is done (70% threshold).
 */
export async function POST(request: Request) {
  try {
    const isValid = await validateApiKey(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
    }

    const body = await request.json()
    const { item_id, status, questions_found, error_message } = body

    if (!item_id || !status) {
      return NextResponse.json({ error: 'item_id and status are required' }, { status: 400 })
    }

    if (!['completed', 'failed', 'skipped'].includes(status)) {
      return NextResponse.json({ error: 'status must be completed, failed, or skipped' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Step 1: Get the item to find its job_id
    const { data: item, error: itemErr } = await adminClient
      .from('lb_rufus_job_items')
      .select('id, job_id, status')
      .eq('id', item_id)
      .single()

    if (itemErr || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
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
    const counterField = status === 'completed' ? 'completed_asins' : 'failed_asins'

    // Fetch current job to update counters
    const { data: job } = await adminClient
      .from('lb_rufus_jobs')
      .select('id, total_asins, completed_asins, failed_asins')
      .eq('id', item.job_id)
      .single()

    if (job) {
      const newCompleted = status === 'completed' ? job.completed_asins + 1 : job.completed_asins
      const newFailed = status !== 'completed' ? job.failed_asins + 1 : job.failed_asins
      const totalProcessed = newCompleted + newFailed

      const updates: Record<string, unknown> = {
        completed_asins: newCompleted,
        failed_asins: newFailed,
        updated_at: new Date().toISOString(),
      }

      // Check if all items are done
      if (totalProcessed >= job.total_asins) {
        const successRate = job.total_asins > 0 ? newCompleted / job.total_asins : 0
        updates.status = successRate >= 0.70 ? 'completed' : 'completed_partial'
      }

      await adminClient
        .from('lb_rufus_jobs')
        .update(updates)
        .eq('id', item.job_id)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Queue POST error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
