import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_admin_settings')
      .select('*')
      .order('key')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    if (message === 'Admin access required') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { lbUser } = await requireAdmin()
    const supabase = createClient()

    const body = await request.json()
    const { key, value, description } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }
    if (value === undefined || value === null) {
      return NextResponse.json(
        { error: 'value is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('lb_admin_settings')
      .upsert(
        {
          key: key.trim(),
          value: String(value),
          description: description?.trim() || null,
          updated_by: lbUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
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
    if (message === 'Admin access required') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
