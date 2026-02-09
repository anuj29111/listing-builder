import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import type { CreateAPlusModuleRequest } from '@/types/api'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get('listing_id')

    let query = supabase.from('lb_aplus_modules').select('*')

    if (listingId) {
      query = query.eq('listing_id', listingId)
    }

    const { data, error } = await query.order('created_at', { ascending: true })

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

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as CreateAPlusModuleRequest

    const validTypes = ['hero_banner', 'comparison_chart', 'feature_grid', 'technical_specs', 'usage_scenarios', 'brand_story']

    if (!body.template_type || !validTypes.includes(body.template_type)) {
      return NextResponse.json({ error: 'Invalid template_type' }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('lb_aplus_modules')
      .insert({
        listing_id: body.listing_id || null,
        template_type: body.template_type,
        title: body.title || null,
        content: {},
        images: [],
        status: 'draft',
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to create module' }, { status: 500 })
    }

    return NextResponse.json({ data: { module: data } }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
