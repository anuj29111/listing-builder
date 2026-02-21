import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

const BACKGROUND_STATES = ['pending', 'collecting', 'analyzing']
const STALE_TIMEOUT_MS = 90 * 60 * 1000 // 90 minutes — covers Apify review fetching (2-5 min/product × 10+)

// GET: Fetch full record (for polling + report viewing)
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_market_intelligence')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Stale detection: auto-fail jobs stuck in background states for 30+ min
    if (
      BACKGROUND_STATES.includes(data.status) &&
      data.updated_at &&
      new Date(data.updated_at).getTime() < Date.now() - STALE_TIMEOUT_MS
    ) {
      const admin = createAdminClient()
      await admin.from('lb_market_intelligence').update({
        status: 'failed',
        error_message: 'Timed out after 90 minutes',
        updated_at: new Date().toISOString(),
      }).eq('id', params.id)

      data.status = 'failed'
      data.error_message = 'Timed out after 30 minutes'
    }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH: Update tags and/or notes
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.notes !== undefined) updates.notes = body.notes || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lb_market_intelligence')
      .update(updates)
      .eq('id', params.id)
      .select('id, tags, notes')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE: Remove a record
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { error } = await supabase
      .from('lb_market_intelligence')
      .delete()
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
