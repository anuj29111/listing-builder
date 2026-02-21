import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { backgroundCollect } from '@/lib/market-intelligence'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const admin = createAdminClient()

    // 1. Validate record exists and is pending
    const { data: record, error: fetchErr } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }
    if (record.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot collect: status is "${record.status}", expected "pending"` },
        { status: 400 }
      )
    }

    // 2. Set status to collecting
    const keywordsList: string[] = record.keywords && record.keywords.length > 0
      ? record.keywords
      : [record.keyword]

    await admin.from('lb_market_intelligence').update({
      status: 'collecting',
      progress: { step: 'keyword_search', current: 0, total: keywordsList.length, message: 'Starting keyword searches...' },
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // 3. Fire and forget: run keyword search + ASIN lookup in background
    backgroundCollect(params.id, record as unknown as Record<string, unknown>, lbUser.id)
      .catch((err) => console.error(`[MI ${params.id}] backgroundCollect error:`, err))

    return NextResponse.json({
      status: 'collecting',
      keywords: keywordsList.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    try {
      const admin = createAdminClient()
      await admin.from('lb_market_intelligence').update({
        status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)
    } catch { /* swallow */ }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
