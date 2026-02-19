import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

/**
 * GET /api/images/queue
 * Fetch queue items with optional filters.
 * Query params: status, model, listing_id, limit, offset
 */
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const model = searchParams.get('model')
    const listingId = searchParams.get('listing_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = adminClient
      .from('hf_prompt_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (model) query = query.eq('model', model)
    if (listingId) query = query.eq('listing_id', listingId)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [], total: count || 0 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/images/queue
 * Manually add a prompt to the Higgsfield queue.
 */
export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { prompt, model, settings, listing_id } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return NextResponse.json({ error: 'Prompt must be at least 5 characters' }, { status: 400 })
    }

    const validModels = ['nano-banana-pro', 'chatgpt', 'seedream', 'soul']
    if (model && !validModels.includes(model)) {
      return NextResponse.json({ error: `Invalid model. Must be one of: ${validModels.join(', ')}` }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('hf_prompt_queue')
      .insert({
        prompt: prompt.trim(),
        model: model || 'nano-banana-pro',
        settings: settings || {},
        status: 'pending',
        source: 'listing-builder',
        listing_id: listing_id || null,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
