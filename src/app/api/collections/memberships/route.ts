import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET /api/collections/memberships?entity_type=asin_lookup&entity_ids=id1,id2,...
// Returns: { data: { [entityId]: [{ collection_id, name, color }] } }
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const entityType = searchParams.get('entity_type')
    const entityIdsStr = searchParams.get('entity_ids')

    if (!entityType || !entityIdsStr) {
      return NextResponse.json(
        { error: 'entity_type and entity_ids are required' },
        { status: 400 }
      )
    }

    const entityIds = entityIdsStr.split(',').filter(Boolean)
    if (entityIds.length === 0) {
      return NextResponse.json({ data: {} })
    }

    // Fetch collection items with collection details
    const { data: items, error } = await supabase
      .from('lb_collection_items')
      .select('entity_id, collection_id, lb_collections(id, name, color)')
      .eq('entity_type', entityType)
      .in('entity_id', entityIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build memberships map: entityId → [{ collection_id, name, color }]
    const memberships: Record<string, Array<{ collection_id: string; name: string; color: string }>> = {}
    for (const item of items || []) {
      if (!memberships[item.entity_id]) memberships[item.entity_id] = []
      // Supabase join returns array — normalize
      const col = Array.isArray(item.lb_collections)
        ? item.lb_collections[0]
        : item.lb_collections
      if (col) {
        memberships[item.entity_id].push({
          collection_id: item.collection_id,
          name: (col as { id: string; name: string; color: string }).name,
          color: (col as { id: string; name: string; color: string }).color,
        })
      }
    }

    return NextResponse.json({ data: memberships })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
