import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET: Fetch collection with all items
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: collection, error } = await supabase
      .from('lb_collections')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Fetch all items in this collection
    const { data: items } = await supabase
      .from('lb_collection_items')
      .select('id, collection_id, entity_type, entity_id, added_by, created_at')
      .eq('collection_id', params.id)
      .order('created_at', { ascending: false })

    // Group entity IDs by type for batch fetching
    const grouped: Record<string, string[]> = {}
    for (const item of items || []) {
      if (!grouped[item.entity_type]) grouped[item.entity_type] = []
      grouped[item.entity_type].push(item.entity_id)
    }

    // Fetch summaries for each entity type
    const entityData: Record<string, Record<string, unknown>[]> = {}

    if (grouped.asin_lookup?.length) {
      const { data } = await supabase
        .from('lb_asin_lookups')
        .select('id, asin, title, brand, price, currency, rating, reviews_count, images, country_id, marketplace_domain, sales_rank, sales_volume, amazon_choice, tags, notes, updated_at')
        .in('id', grouped.asin_lookup)
      entityData.asin_lookup = data || []
    }

    if (grouped.keyword_search?.length) {
      const { data } = await supabase
        .from('lb_keyword_searches')
        .select('id, keyword, country_id, marketplace_domain, total_results_count, pages_fetched, tags, notes, updated_at')
        .in('id', grouped.keyword_search)
      entityData.keyword_search = data || []
    }

    if (grouped.asin_review?.length) {
      const { data } = await supabase
        .from('lb_asin_reviews')
        .select('id, asin, country_id, marketplace_domain, total_reviews, overall_rating, sort_by, tags, notes, updated_at')
        .in('id', grouped.asin_review)
      entityData.asin_review = data || []
    }

    if (grouped.market_intelligence?.length) {
      const { data } = await supabase
        .from('lb_market_intelligence')
        .select('id, keyword, country_id, marketplace_domain, status, top_asins, tokens_used, tags, notes, created_at')
        .in('id', grouped.market_intelligence)
      entityData.market_intelligence = data || []
    }

    return NextResponse.json({
      data: {
        ...collection,
        items: items || [],
        entities: entityData,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH: Update collection
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.description !== undefined) updates.description = body.description?.trim() || null
    if (body.color !== undefined) updates.color = body.color

    const { data, error } = await supabase
      .from('lb_collections')
      .update(updates)
      .eq('id', params.id)
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

// DELETE: Delete collection (cascades to items)
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { error } = await supabase
      .from('lb_collections')
      .delete()
      .eq('id', params.id)

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
