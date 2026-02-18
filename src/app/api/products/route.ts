import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get('search')?.trim()
    const category = searchParams.get('category')
    const brand = searchParams.get('brand')

    let query = supabase
      .from('lb_products')
      .select('*', { count: 'exact' })
      .order('category')
      .order('parent_name', { ascending: true, nullsFirst: false })
      .order('product_name')

    if (category) query = query.eq('category', category)
    if (brand) query = query.eq('brand', brand)
    if (search) {
      query = query.or(`asin.ilike.%${search}%,product_name.ilike.%${search}%,parent_name.ilike.%${search}%`)
    }

    const { data, error, count } = await query.limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, total: count })
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
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { asin, product_name, parent_name, parent_asin, category, brand } = body

    if (!asin?.trim() || !product_name?.trim() || !category?.trim()) {
      return NextResponse.json(
        { error: 'asin, product_name, and category are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('lb_products')
      .upsert(
        {
          asin: asin.trim(),
          product_name: product_name.trim(),
          parent_name: parent_name?.trim() || null,
          parent_asin: parent_asin?.trim() || null,
          category: category.trim(),
          brand: brand?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'asin' }
      )
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
