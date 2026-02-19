import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/images/queue/:id
 * Update a queue item (retry, skip).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const { id } = await params
    const body = await request.json()

    const { action } = body as { action: 'retry' | 'skip' }

    if (!action || !['retry', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "retry" or "skip"' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if (action === 'retry') {
      updates.status = 'pending'
      updates.error = null
      updates.submitted_at = null
    } else if (action === 'skip') {
      updates.status = 'skipped'
    }

    const { data, error } = await adminClient
      .from('hf_prompt_queue')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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

/**
 * DELETE /api/images/queue/:id
 * Remove a queue item.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const { id } = await params

    const { error } = await adminClient
      .from('hf_prompt_queue')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
