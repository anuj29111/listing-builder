import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const { data: job, error } = await adminClient
      .from('lb_seller_pull_jobs')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Mark stale background jobs as failed
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const backgroundStates = ['pulling', 'scraping', 'discovering_variations']

    if (backgroundStates.includes(job.status) && job.updated_at < thirtyMinAgo) {
      await adminClient
        .from('lb_seller_pull_jobs')
        .update({ status: 'failed', error: 'Timed out', updated_at: new Date().toISOString() })
        .eq('id', job.id)
      job.status = 'failed'
      job.error = 'Timed out'
    }

    return NextResponse.json(job)
  } catch (err) {
    console.error('Get seller pull job error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
