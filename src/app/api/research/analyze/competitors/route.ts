import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeCompetitors } from '@/lib/claude'

const MAX_COMPETITORS = 5
const MAX_TEXT_LENGTH = 5000

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()

    const body = await request.json()
    const { category_id, country_id, competitors } = body as {
      category_id: string
      country_id: string
      competitors: Array<{ title: string; bullets: string[]; description: string }>
    }

    if (!category_id || !country_id) {
      return NextResponse.json(
        { error: 'category_id and country_id are required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(competitors) || competitors.length === 0) {
      return NextResponse.json(
        { error: 'At least one competitor listing is required' },
        { status: 400 }
      )
    }

    if (competitors.length > MAX_COMPETITORS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_COMPETITORS} competitor listings allowed` },
        { status: 400 }
      )
    }

    // Validate and truncate competitor texts
    const validatedCompetitors = competitors.map((c, i) => {
      if (!c.title || typeof c.title !== 'string') {
        throw new Error(`Competitor ${i + 1}: title is required`)
      }
      return {
        title: c.title.slice(0, MAX_TEXT_LENGTH),
        bullets: (c.bullets || []).slice(0, 10).map((b) => String(b).slice(0, MAX_TEXT_LENGTH)),
        description: (c.description || '').slice(0, MAX_TEXT_LENGTH),
      }
    })

    // Fetch category + country
    const [catResult, countryResult] = await Promise.all([
      supabase.from('lb_categories').select('id, name').eq('id', category_id).single(),
      supabase.from('lb_countries').select('id, name').eq('id', country_id).single(),
    ])

    if (!catResult.data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (!countryResult.data) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    // Delete existing competitor analysis for this category/country
    await adminClient
      .from('lb_research_analysis')
      .delete()
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('analysis_type', 'competitor_analysis')

    // Create processing record
    const { data: analysisRow, error: insertError } = await adminClient
      .from('lb_research_analysis')
      .insert({
        category_id,
        country_id,
        analysis_type: 'competitor_analysis',
        source: 'csv', // competitors use 'csv' source (text input, not file)
        source_file_ids: [],
        status: 'processing',
        analyzed_by: lbUser.id,
      })
      .select()
      .single()

    if (insertError || !analysisRow) {
      return NextResponse.json(
        { error: `Failed to create analysis record: ${insertError?.message}` },
        { status: 500 }
      )
    }

    try {
      const { result, model, tokensUsed } = await analyzeCompetitors(
        validatedCompetitors,
        catResult.data.name,
        countryResult.data.name
      )

      const { data: updated, error: updateError } = await adminClient
        .from('lb_research_analysis')
        .update({
          analysis_result: result as unknown as Record<string, unknown>,
          model_used: model,
          tokens_used: tokensUsed,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', analysisRow.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ data: updated })
    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : 'Competitor analysis failed'
      await adminClient
        .from('lb_research_analysis')
        .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
        .eq('id', analysisRow.id)
      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
