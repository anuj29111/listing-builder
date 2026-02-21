import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// POST: Create a new market intelligence record
export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { keyword, keywords, country_id, max_competitors, reviews_per_product } = body as {
      keyword?: string
      keywords?: string[]
      country_id: string
      max_competitors?: number
      reviews_per_product?: number
    }

    // Support both single keyword and keywords array
    let keywordsList: string[] = []
    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      keywordsList = keywords.map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
    } else if (keyword?.trim()) {
      keywordsList = [keyword.trim().toLowerCase()]
    }

    if (keywordsList.length === 0 || !country_id) {
      return NextResponse.json(
        { error: 'At least one keyword and country_id are required' },
        { status: 400 }
      )
    }

    const competitors = Math.min(Math.max(max_competitors || 10, 5), 20)
    const reviewsPerProduct = Math.min(Math.max(reviews_per_product || 200, 100), 500)

    // Get country for marketplace_domain
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const { data: record, error: insertErr } = await supabase
      .from('lb_market_intelligence')
      .insert({
        keyword: keywordsList[0], // primary/display keyword
        keywords: keywordsList,
        country_id,
        marketplace_domain: country.amazon_domain,
        max_competitors: competitors,
        reviews_per_product: reviewsPerProduct,
        status: 'pending',
        created_by: lbUser.id,
      })
      .select('id, keyword, status')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json(record)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: List recent market intelligence records (lightweight)
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const countryId = searchParams.get('country_id')

    let query = supabase
      .from('lb_market_intelligence')
      .select(
        'id, keyword, keywords, country_id, marketplace_domain, max_competitors, top_asins, status, progress, error_message, model_used, tokens_used, oxylabs_calls_used, created_by, tags, notes, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(20)

    if (search) {
      query = query.ilike('keyword', `%${search}%`)
    }
    if (countryId) {
      query = query.eq('country_id', countryId)
    }

    const tag = searchParams.get('tag')
    if (tag) {
      query = query.contains('tags', [tag])
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
