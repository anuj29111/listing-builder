import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET: List completed MI records for a given country (for dropdown)
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const countryId = searchParams.get('country_id')
    if (!countryId) {
      return NextResponse.json({ error: 'country_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lb_market_intelligence')
      .select('id, keyword, keywords, country_id, status, selected_asins, top_asins, created_at, updated_at')
      .eq('country_id', countryId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Link an MI record to a research category+country
export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { category_id, country_id, market_intelligence_id } = body
    if (!category_id || !country_id || !market_intelligence_id) {
      return NextResponse.json(
        { error: 'category_id, country_id, and market_intelligence_id are required' },
        { status: 400 }
      )
    }

    // Verify MI record exists and is completed
    const { data: miRecord, error: miError } = await supabase
      .from('lb_market_intelligence')
      .select('id, status')
      .eq('id', market_intelligence_id)
      .single()

    if (miError || !miRecord) {
      return NextResponse.json({ error: 'Market Intelligence record not found' }, { status: 404 })
    }

    if (miRecord.status !== 'completed') {
      return NextResponse.json(
        { error: 'Market Intelligence record is not completed yet' },
        { status: 400 }
      )
    }

    // Upsert bridge record in lb_research_analysis
    const { data, error } = await supabase
      .from('lb_research_analysis')
      .upsert(
        {
          category_id,
          country_id,
          analysis_type: 'market_intelligence',
          source: 'linked',
          source_file_ids: [],
          analysis_result: {},
          market_intelligence_id,
          status: 'completed',
          analyzed_by: lbUser.id,
        },
        { onConflict: 'category_id,country_id,analysis_type,source' }
      )
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

// DELETE: Unlink MI from a research category+country
export async function DELETE(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const categoryId = searchParams.get('category_id')
    const countryId = searchParams.get('country_id')

    if (!categoryId || !countryId) {
      return NextResponse.json(
        { error: 'category_id and country_id are required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('lb_research_analysis')
      .delete()
      .eq('category_id', categoryId)
      .eq('country_id', countryId)
      .eq('analysis_type', 'market_intelligence')
      .eq('source', 'linked')

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
