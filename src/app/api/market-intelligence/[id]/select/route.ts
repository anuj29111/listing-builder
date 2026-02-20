import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// POST: Confirm product selection, transition to 'collected' status for analysis
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
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
      .select('id, status')
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

    // Update with selected ASINs and transition to 'collected'
    await admin.from('lb_market_intelligence').update({
      selected_asins,
      status: 'collected',
      progress: { step: 'collected', current: 0, total: 0, message: 'Products confirmed. Starting analysis...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    return NextResponse.json({
      status: 'collected',
      selected_count: selected_asins.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
