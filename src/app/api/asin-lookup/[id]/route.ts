import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase
      .from('lb_asin_lookups')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Lookup not found' },
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
