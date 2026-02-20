import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET: Return all unique tags across all 4 tables for autocomplete
export async function GET() {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data, error } = await supabase.rpc('get_all_research_tags')

    if (error) {
      // Fallback: query each table individually if RPC doesn't exist
      const allTags = new Set<string>()

      const tables = ['lb_asin_lookups', 'lb_keyword_searches', 'lb_asin_reviews', 'lb_market_intelligence'] as const
      for (const table of tables) {
        const { data: rows } = await supabase
          .from(table)
          .select('tags')
          .not('tags', 'eq', '{}')

        if (rows) {
          for (const row of rows) {
            const tags = row.tags as string[]
            if (tags) tags.forEach((t: string) => allTags.add(t))
          }
        }
      }

      return NextResponse.json({ data: Array.from(allTags).sort() })
    }

    return NextResponse.json({ data: (data || []).map((r: { tag: string }) => r.tag) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
