import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

const ALLOWED_TABLES: Record<string, string> = {
  asin_lookup: 'lb_asin_lookups',
  keyword_search: 'lb_keyword_searches',
  asin_review: 'lb_asin_reviews',
  market_intelligence: 'lb_market_intelligence',
}

// PATCH: Bulk update tags and/or notes for multiple items
export async function PATCH(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { ids, entityType, tags, notes, mode = 'merge' } = body as {
      ids: string[]
      entityType: string
      tags?: string[]
      notes?: string
      mode?: 'merge' | 'replace'
    }

    if (!ids?.length) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Max 100 items per request' }, { status: 400 })
    }

    const tableName = ALLOWED_TABLES[entityType]
    if (!tableName) {
      return NextResponse.json(
        { error: `Invalid entityType: ${entityType}. Must be one of: ${Object.keys(ALLOWED_TABLES).join(', ')}` },
        { status: 400 }
      )
    }

    if (tags === undefined && notes === undefined) {
      return NextResponse.json({ error: 'Must provide tags and/or notes' }, { status: 400 })
    }

    // For tags merge mode, we need to fetch existing tags first and merge
    if (tags !== undefined && mode === 'merge') {
      // Fetch existing items to get their current tags
      const { data: existing, error: fetchErr } = await supabase
        .from(tableName)
        .select('id, tags')
        .in('id', ids)

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 })
      }

      // Update each item with merged tags
      const results = []
      for (const item of existing || []) {
        const existingTags = (item.tags as string[]) || []
        const merged = Array.from(new Set([...existingTags, ...tags]))
        const updates: Record<string, unknown> = { tags: merged }
        if (notes !== undefined) updates.notes = notes || null

        const { data, error } = await supabase
          .from(tableName)
          .update(updates)
          .eq('id', item.id)
          .select('id, tags, notes')
          .single()

        if (!error && data) results.push(data)
      }

      return NextResponse.json({ data: results, updated: results.length })
    }

    // For replace mode or notes-only, do a single batch update
    const updates: Record<string, unknown> = {}
    if (tags !== undefined) updates.tags = tags
    if (notes !== undefined) updates.notes = notes || null

    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .in('id', ids)
      .select('id, tags, notes')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, updated: data?.length || 0 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
