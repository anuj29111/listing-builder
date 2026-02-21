import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { backgroundAnalyze } from '@/lib/market-intelligence'

// POST: Confirm product selection → kick off background analysis (reviews + Q&A + 4-phase Claude)
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

    if (!Array.isArray(selected_asins) || selected_asins.length === 0) {
      return NextResponse.json(
        { error: 'selected_asins must be a non-empty array' },
        { status: 400 }
      )
    }

    // Validate record exists and is in awaiting_selection status
    const { data: record, error: fetchErr } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    if (record.status !== 'awaiting_selection') {
      return NextResponse.json(
        { error: `Cannot select: status is "${record.status}", expected "awaiting_selection"` },
        { status: 400 }
      )
    }

    // Update with selected ASINs and transition to 'analyzing'
    await admin.from('lb_market_intelligence').update({
      selected_asins,
      status: 'analyzing',
      progress: { step: 'review_fetch', current: 0, total: selected_asins.length, message: 'Starting review collection...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // Fire and forget: run reviews + Q&A + analysis in background
    backgroundAnalyze(params.id, record as unknown as Record<string, unknown>, selected_asins, lbUser.id)
      .catch((err) => console.error(`[MI ${params.id}] Background analyze error:`, err))

    return NextResponse.json({
      status: 'analyzing',
      selected_count: selected_asins.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
