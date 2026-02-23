import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { backgroundAnalyze } from '@/lib/market-intelligence'

// POST: Confirm product selection → kick off background analysis (reviews + Q&A + 4-phase Claude)
// Also handles resume from 'failed' status — skips already-completed phases
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const admin = createAdminClient()
    const body = await request.json()

    const { selected_asins } = body as { selected_asins: string[] }

    // Validate record exists
    const { data: record, error: fetchErr } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Allow both fresh selection and resume from failed
    const isResume = record.status === 'failed'
    if (record.status !== 'awaiting_selection' && !isResume) {
      return NextResponse.json(
        { error: `Cannot select: status is "${record.status}", expected "awaiting_selection" or "failed"` },
        { status: 400 }
      )
    }

    // For resume: use existing selected_asins if body doesn't provide new ones
    const effectiveAsins = selected_asins?.length > 0
      ? selected_asins
      : (record.selected_asins || []) as string[]

    if (effectiveAsins.length === 0) {
      return NextResponse.json(
        { error: 'No selected ASINs available for analysis' },
        { status: 400 }
      )
    }

    // Determine resume progress
    const completedPhases = ((record.progress as Record<string, unknown>)?.completed_phases || []) as string[]
    const hasReviewsData = record.reviews_data && Object.keys(record.reviews_data as Record<string, unknown>).length > 0

    const resumeStep = isResume && hasReviewsData && completedPhases.length > 0
      ? `phase_${completedPhases.length + 1}`
      : 'review_fetch'
    const resumeMessage = isResume && completedPhases.length > 0
      ? `Resuming from phase ${completedPhases.length + 1} of 4...`
      : isResume && hasReviewsData
        ? 'Resuming analysis (reviews already fetched)...'
        : 'Starting review collection...'

    // Update status to analyzing
    await admin.from('lb_market_intelligence').update({
      selected_asins: effectiveAsins,
      status: 'analyzing',
      error_message: null, // Clear previous error
      progress: {
        step: resumeStep,
        current: completedPhases.length,
        total: isResume && hasReviewsData ? 4 : effectiveAsins.length,
        message: resumeMessage,
        completed_phases: completedPhases,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // Re-fetch record to get latest state for background job
    const { data: freshRecord } = await admin
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    // Fire and forget: run reviews + Q&A + analysis in background
    backgroundAnalyze(params.id, (freshRecord || record) as unknown as Record<string, unknown>, effectiveAsins, lbUser.id)
      .catch((err) => console.error(`[MI ${params.id}] Background analyze error:`, err))

    return NextResponse.json({
      status: 'analyzing',
      selected_count: effectiveAsins.length,
      resuming: isResume,
      completed_phases: completedPhases,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
