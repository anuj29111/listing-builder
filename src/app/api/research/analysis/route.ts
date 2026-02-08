import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const categoryId = searchParams.get('category_id')
    const countryId = searchParams.get('country_id')
    const analysisType = searchParams.get('analysis_type')

    if (!categoryId || !countryId) {
      return NextResponse.json(
        { error: 'category_id and country_id are required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('lb_research_analysis')
      .select('*')
      .eq('category_id', categoryId)
      .eq('country_id', countryId)

    if (analysisType) {
      query = query.eq('analysis_type', analysisType)
    }

    const { data, error } = await query.order('updated_at', { ascending: false })

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
