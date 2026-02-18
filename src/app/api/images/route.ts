import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const listingId = searchParams.get('listing_id')
    const status = searchParams.get('status')
    const provider = searchParams.get('provider')

    let query = supabase
      .from('lb_image_generations')
      .select('*')

    if (listingId) {
      query = query.eq('listing_id', listingId)
    }
    if (status && ['preview', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status)
    }
    if (provider && ['openai', 'gemini'].includes(provider)) {
      query = query.eq('provider', provider)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

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
