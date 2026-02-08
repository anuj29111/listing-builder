import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_categories')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      )
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) updates.name = body.name.trim()
    if (body.slug !== undefined) {
      updates.slug = body.slug
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    }
    if (body.description !== undefined)
      updates.description = body.description?.trim() || null
    if (body.brand !== undefined) {
      if (
        !['Chalkola', 'Spedalon', 'Funcils', 'Other'].includes(body.brand)
      ) {
        return NextResponse.json({ error: 'Invalid brand' }, { status: 400 })
      }
      updates.brand = body.brand
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('lb_categories')
      .update(updates)
      .eq('id', params.id)
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

    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { error } = await supabase
      .from('lb_categories')
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
