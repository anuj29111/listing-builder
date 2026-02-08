import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET() {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const [categoriesResult, countriesResult, filesResult] = await Promise.all([
      supabase
        .from('lb_categories')
        .select('id, name, slug, brand')
        .order('brand')
        .order('name'),
      supabase
        .from('lb_countries')
        .select('id, name, code, flag_emoji')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('lb_research_files')
        .select('category_id, country_id, file_type'),
    ])

    if (categoriesResult.error || countriesResult.error || filesResult.error) {
      const err =
        categoriesResult.error || countriesResult.error || filesResult.error
      return NextResponse.json({ error: err!.message }, { status: 500 })
    }

    // Build coverage map: "categoryId:countryId" => ["keywords", "reviews", ...]
    const coverage: Record<string, string[]> = {}
    for (const file of filesResult.data || []) {
      const key = `${file.category_id}:${file.country_id}`
      if (!coverage[key]) coverage[key] = []
      if (!coverage[key].includes(file.file_type)) {
        coverage[key].push(file.file_type)
      }
    }

    return NextResponse.json({
      data: {
        categories: categoriesResult.data || [],
        countries: countriesResult.data || [],
        coverage,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
