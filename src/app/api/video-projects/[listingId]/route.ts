import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { listingId: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_video_projects')
      .select('*')
      .eq('listing_id', params.listingId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { listingId: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()
    const { status, notes, assigned_to } = body as {
      status?: string
      notes?: string
      assigned_to?: string | null
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status !== undefined) {
      const validStatuses = ['draft', 'in_review', 'approved', 'in_production', 'completed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updates.status = status
    }
    if (notes !== undefined) updates.notes = notes
    if (assigned_to !== undefined) updates.assigned_to = assigned_to

    const { data, error } = await supabase
      .from('lb_video_projects')
      .update(updates)
      .eq('listing_id', params.listingId)
      .select()
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Video project not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
