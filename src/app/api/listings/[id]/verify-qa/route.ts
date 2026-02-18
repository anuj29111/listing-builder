import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyQnACoverage, type QnAAnalysisResult } from '@/lib/claude'
import { SECTION_TYPE_LABELS } from '@/lib/constants'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const listingId = params.id

    // Fetch listing sections
    const { data: sections, error: secError } = await supabase
      .from('lb_listing_sections')
      .select('section_type, variations, selected_variation, final_text')
      .eq('listing_id', listingId)

    if (secError || !sections || sections.length === 0) {
      return NextResponse.json(
        { error: 'Listing sections not found' },
        { status: 404 }
      )
    }

    // Fetch listing to get category/country IDs
    const { data: listing, error: listError } = await supabase
      .from('lb_listings')
      .select('generation_context, product_type_id')
      .eq('id', listingId)
      .single()

    if (listError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const ctx = listing.generation_context as Record<string, string> | null
    const categoryId = ctx?.categoryId
    const countryId = ctx?.countryId

    if (!categoryId || !countryId) {
      return NextResponse.json(
        { error: 'Listing missing category/country context' },
        { status: 400 }
      )
    }

    // Fetch Q&A analysis
    const { data: qnaRows } = await supabase
      .from('lb_research_analysis')
      .select('analysis_result, source')
      .eq('category_id', categoryId)
      .eq('country_id', countryId)
      .eq('analysis_type', 'qna_analysis')
      .eq('status', 'completed')

    if (!qnaRows || qnaRows.length === 0) {
      return NextResponse.json(
        { error: 'No Q&A analysis found for this category/country. Upload Q&A files and run analysis first.' },
        { status: 400 }
      )
    }

    // Pick best source: merged > csv > file
    const sourcePriority = ['merged', 'csv', 'file']
    const bestQna = qnaRows.sort((a, b) => {
      const ai = sourcePriority.indexOf(a.source || 'csv')
      const bi = sourcePriority.indexOf(b.source || 'csv')
      return ai - bi
    })[0]

    const qnaAnalysis = bestQna.analysis_result as unknown as QnAAnalysisResult

    // Build listing text map from sections (prefer final_text)
    const listingText: Record<string, string> = {}
    for (const sec of sections) {
      const label = SECTION_TYPE_LABELS[sec.section_type] || sec.section_type
      const text = sec.final_text?.trim()
        || ((sec.variations as string[])?.[sec.selected_variation] || '')
      if (text) {
        listingText[label] = text
      }
    }

    // Call Claude verification
    const { result, model, tokensUsed } = await verifyQnACoverage(listingText, qnaAnalysis)

    return NextResponse.json({
      data: result,
      model,
      tokensUsed,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Q&A verification error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
