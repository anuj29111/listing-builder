import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const asin = searchParams.get('asin')?.trim().toUpperCase()
    const countryId = searchParams.get('country_id')

    if (!asin || !countryId) {
      return NextResponse.json(
        { error: 'asin and country_id are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('lb_asin_questions')
      .select('id, questions, total_questions, updated_at')
      .eq('asin', asin)
      .eq('country_id', countryId)
      .single()

    if (error || !data) {
      return NextResponse.json({ questions: [] })
    }

    return NextResponse.json({
      questions: data.questions || [],
      total: data.total_questions || 0,
      updated_at: data.updated_at,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
