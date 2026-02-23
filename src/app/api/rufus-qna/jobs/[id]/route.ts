import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

/**
 * GET /api/rufus-qna/jobs/[id]
 *
 * Get job details with all items and their statuses.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: job, error: jobErr } = await supabase
      .from('lb_rufus_jobs')
      .select(`
        id,
        country_id,
        marketplace_domain,
        source,
        market_intelligence_id,
        status,
        total_asins,
        completed_asins,
        failed_asins,
        created_by,
        created_at,
        updated_at
      `)
      .eq('id', params.id)
      .single()

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const { data: items, error: itemsErr } = await supabase
      .from('lb_rufus_job_items')
      .select('id, asin, status, questions_found, error_message, started_at, completed_at')
      .eq('job_id', params.id)
      .order('id', { ascending: true })

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    return NextResponse.json({ job, items: items || [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/rufus-qna/jobs/[id]
 *
 * Cancel a job. Sets job status to 'cancelled' and skips all pending items.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    // Verify job exists
    const { data: job, error: jobErr } = await adminClient
      .from('lb_rufus_jobs')
      .select('id, status')
      .eq('id', params.id)
      .single()

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (['completed', 'completed_partial', 'cancelled'].includes(job.status)) {
      return NextResponse.json({ error: 'Job is already finished' }, { status: 400 })
    }

    // Skip all pending items
    await adminClient
      .from('lb_rufus_job_items')
      .update({ status: 'skipped', completed_at: new Date().toISOString() })
      .eq('job_id', params.id)
      .eq('status', 'pending')

    // Set job to cancelled
    await adminClient
      .from('lb_rufus_jobs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
