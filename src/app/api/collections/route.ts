import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET: List all collections with item counts
export async function GET() {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: collections, error } = await supabase
      .from('lb_collections')
      .select('id, name, description, color, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch item counts per collection
    const { data: counts } = await supabase
      .from('lb_collection_items')
      .select('collection_id, entity_type')

    const countMap: Record<string, Record<string, number>> = {}
    for (const item of counts || []) {
      if (!countMap[item.collection_id]) {
        countMap[item.collection_id] = {}
      }
      countMap[item.collection_id][item.entity_type] =
        (countMap[item.collection_id][item.entity_type] || 0) + 1
    }

    const result = (collections || []).map((c) => ({
      ...c,
      item_counts: countMap[c.id] || {},
      total_items: Object.values(countMap[c.id] || {}).reduce((a: number, b: number) => a + b, 0),
    }))

    return NextResponse.json({ data: result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Create a new collection
export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { name, description, color } = body as {
      name: string
      description?: string
      color?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lb_collections')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#6366f1',
        created_by: lbUser.id,
      })
      .select('*')
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
