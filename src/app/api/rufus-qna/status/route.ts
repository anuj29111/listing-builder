import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

interface QAPair {
  source?: string
  [key: string]: unknown
}

/**
 * GET /api/rufus-qna/status?asins=B0ABC,B0DEF&country_id=<uuid>
 *
 * Bulk lookup Q&A status for a list of ASINs.
 * Returns per-ASIN counts for Rufus vs Oxylabs Q&A.
 */
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { searchParams } = new URL(request.url)
    const asinsParam = searchParams.get('asins')
    const countryId = searchParams.get('country_id')

    if (!asinsParam || !countryId) {
      return NextResponse.json({ error: 'asins and country_id are required' }, { status: 400 })
    }

    const asinList = asinsParam.split(',').map((a) => a.trim().toUpperCase()).filter(Boolean)
    if (asinList.length === 0) {
      return NextResponse.json({ statuses: {} })
    }

    // Cap at 50 ASINs per request
    const limitedAsins = asinList.slice(0, 50)

    const { data, error } = await supabase
      .from('lb_asin_questions')
      .select('asin, total_questions, questions, updated_at')
      .in('asin', limitedAsins)
      .eq('country_id', countryId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build status map
    const statuses: Record<string, {
      hasData: boolean
      total: number
      rufusCount: number
      oxylabsCount: number
      updatedAt: string | null
    }> = {}

    for (const row of data || []) {
      const questions = (row.questions || []) as QAPair[]
      const rufusCount = questions.filter((q) => q.source === 'rufus').length
      const oxylabsCount = questions.filter((q) => q.source !== 'rufus').length

      statuses[row.asin] = {
        hasData: true,
        total: row.total_questions || questions.length,
        rufusCount,
        oxylabsCount,
        updatedAt: row.updated_at,
      }
    }

    return NextResponse.json({ statuses })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
