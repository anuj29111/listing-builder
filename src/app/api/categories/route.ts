import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET() {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_categories')
      .select('*')
      .order('brand')
      .order('name')

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

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()

    const body = await request.json()
    const { name, slug, description, brand } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }
    if (
      !brand ||
      !['Chalkola', 'Spedalon', 'Funcils', 'Other'].includes(brand)
    ) {
      return NextResponse.json(
        { error: 'Valid brand is required' },
        { status: 400 }
      )
    }

    const cleanSlug = slug
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const { data, error } = await supabase
      .from('lb_categories')
      .insert({
        name: name.trim(),
        slug: cleanSlug,
        description: description?.trim() || null,
        brand,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with this slug already exists' },
          { status: 409 }
        )
      }
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
