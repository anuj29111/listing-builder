import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { searchKeyword } from '@/lib/oxylabs'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { keyword, country_id, pages } = body as {
      keyword: string
      country_id: string
      pages?: number
    }

    if (!keyword?.trim() || !country_id) {
      return NextResponse.json(
        { error: 'keyword and country_id are required' },
        { status: 400 }
      )
    }

    const trimmedKeyword = keyword.trim()
    if (trimmedKeyword.length > 200) {
      return NextResponse.json(
        { error: 'Keyword must be 200 characters or less' },
        { status: 400 }
      )
    }

    // Fetch country to get amazon_domain
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')
    const pagesToFetch = Math.min(pages || 1, 5) // Max 5 pages

    const result = await searchKeyword(trimmedKeyword, oxylabsDomain, pagesToFetch)

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Search failed' },
        { status: 502 }
      )
    }

    const data = result.data
    const searchResults = data.results || {}

    // Upsert into lb_keyword_searches
    const { data: saved, error: saveErr } = await supabase
      .from('lb_keyword_searches')
      .upsert(
        {
          keyword: trimmedKeyword.toLowerCase(),
          country_id,
          marketplace_domain: country.amazon_domain,
          total_results_count: data.total_results_count ?? null,
          pages_fetched: pagesToFetch,
          organic_results: searchResults.organic || [],
          sponsored_results: searchResults.paid || [],
          amazons_choices: searchResults.amazons_choices || [],
          suggested_results: searchResults.suggested || [],
          raw_response: data,
          searched_by: lbUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'keyword,country_id' }
      )
      .select('id')
      .single()

    if (saveErr) {
      console.error('Failed to save keyword search:', saveErr)
    }

    return NextResponse.json({
      id: saved?.id,
      keyword: trimmedKeyword,
      marketplace: country.amazon_domain,
      total_results_count: data.total_results_count,
      organic: searchResults.organic || [],
      sponsored: searchResults.paid || [],
      amazons_choices: searchResults.amazons_choices || [],
      suggested: searchResults.suggested || [],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get('search')?.trim()
    const country_id = searchParams.get('country_id')

    let query = supabase
      .from('lb_keyword_searches')
      .select(
        'id, keyword, country_id, marketplace_domain, total_results_count, pages_fetched, tags, notes, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50)

    if (search) {
      query = query.ilike('keyword', `%${search}%`)
    }
    if (country_id) {
      query = query.eq('country_id', country_id)
    }

    const tag = searchParams.get('tag')
    if (tag) {
      query = query.contains('tags', [tag])
    }

    const { data, error } = await query

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
