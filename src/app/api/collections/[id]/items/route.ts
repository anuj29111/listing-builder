import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

const VALID_ENTITY_TYPES = ['asin_lookup', 'keyword_search', 'asin_review', 'market_intelligence']

// POST: Add items to a collection
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { items } = body as {
      items: Array<{ entity_type: string; entity_id: string }>
    }

    if (!items?.length) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    // Validate entity types
    for (const item of items) {
      if (!VALID_ENTITY_TYPES.includes(item.entity_type)) {
        return NextResponse.json(
          { error: `Invalid entity_type: ${item.entity_type}` },
          { status: 400 }
        )
      }
    }

    const rows = items.map((item) => ({
      collection_id: params.id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      added_by: lbUser.id,
    }))

    const { data, error } = await supabase
      .from('lb_collection_items')
      .upsert(rows, { onConflict: 'collection_id,entity_type,entity_id' })
      .select('*')

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

// DELETE: Remove items from a collection
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { items } = body as {
      items: Array<{ entity_type: string; entity_id: string }>
    }

    if (!items?.length) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    // Delete each item
    for (const item of items) {
      await supabase
        .from('lb_collection_items')
        .delete()
        .eq('collection_id', params.id)
        .eq('entity_type', item.entity_type)
        .eq('entity_id', item.entity_id)
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
