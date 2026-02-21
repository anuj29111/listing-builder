import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateVideoStoryboard,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { GenerateVideoStoryboardRequest, CompetitorAnalysisResult, CreativeBrief } from '@/types/api'

// Allow up to 5 minutes for Claude video storyboard generation
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = (await request.json()) as GenerateVideoStoryboardRequest

    const { product_name, brand, category_id, country_id, listing_id, workshop_id } = body

    if (!product_name || !brand || !category_id || !country_id) {
      return NextResponse.json(
        { error: 'product_name, brand, category_id, and country_id are required' },
        { status: 400 }
      )
    }

    // Fetch category, country, research, and optionally listing data in parallel
    const [catResult, countryResult, analysesResult] = await Promise.all([
      supabase.from('lb_categories').select('id, name, brand').eq('id', category_id).single(),
      supabase.from('lb_countries').select('id, name, code').eq('id', country_id).single(),
      supabase
        .from('lb_research_analysis')
        .select('analysis_type, analysis_result, source, market_intelligence_id')
        .eq('category_id', category_id)
        .eq('country_id', country_id)
        .eq('status', 'completed'),
    ])

    // If listing provided, fetch its sections for context
    let listingResult: { data: { title: string | null } | null } | null = null
    let listingSections: { data: Array<{ section_type: string; variations: unknown; selected_variation: number }> | null } | null = null
    if (listing_id) {
      const [lr, sr] = await Promise.all([
        supabase.from('lb_listings').select('title').eq('id', listing_id).single(),
        supabase.from('lb_listing_sections').select('section_type, variations, selected_variation').eq('listing_id', listing_id),
      ])
      listingResult = lr
      listingSections = sr
    }

    if (!catResult.data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (!countryResult.data) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const category = catResult.data
    const analyses = analysesResult.data || []

    // Pick best analysis per type: prefer merged > csv > file > linked
    const sourcePriority = ['merged', 'csv', 'file', 'linked']
    const pickBest = (type: string) => {
      const matches = analyses.filter((a) => a.analysis_type === type)
      if (matches.length === 0) return undefined
      return matches.sort((a, b) => {
        const ai = sourcePriority.indexOf(a.source || 'csv')
        const bi = sourcePriority.indexOf(b.source || 'csv')
        return ai - bi
      })[0]
    }

    const keywordRow = pickBest('keyword_analysis')
    const reviewRow = pickBest('review_analysis')
    const qnaRow = pickBest('qna_analysis')
    const competitorRow = pickBest('competitor_analysis')

    // Auto-resolve linked Market Intelligence
    const miRow = analyses.find((a) => a.analysis_type === 'market_intelligence' && a.source === 'linked')
    let marketIntelligence = null
    if (miRow?.market_intelligence_id) {
      const { data: miRecord } = await supabase
        .from('lb_market_intelligence')
        .select('analysis_result, status')
        .eq('id', miRow.market_intelligence_id)
        .eq('status', 'completed')
        .single()
      if (miRecord?.analysis_result) {
        marketIntelligence = miRecord.analysis_result
      }
    }

    // Extract bullet points + description from listing sections if available
    const bulletPoints: string[] = []
    let listingDescription: string | null = null
    if (listingSections?.data) {
      for (const section of listingSections.data) {
        if (section.section_type.startsWith('bullet_')) {
          const variations = section.variations as string[]
          if (variations?.[section.selected_variation]) {
            bulletPoints.push(variations[section.selected_variation])
          }
        }
        if (section.section_type === 'description') {
          const variations = section.variations as string[]
          listingDescription = variations?.[section.selected_variation] || null
        }
      }
    }

    // Fetch creative brief from existing workshop if available
    let creativeBrief: CreativeBrief | null = null
    if (workshop_id) {
      const { data: existingWorkshop } = await supabase
        .from('lb_image_workshops')
        .select('creative_brief')
        .eq('id', workshop_id)
        .single()
      creativeBrief = (existingWorkshop?.creative_brief as unknown as CreativeBrief) || null
    }

    const { result, model, tokensUsed } = await generateVideoStoryboard({
      productName: product_name,
      brand,
      categoryName: category.name,
      listingTitle: listingResult?.data?.title || null,
      bulletPoints,
      listingDescription,
      keywordAnalysis: keywordRow
        ? (keywordRow.analysis_result as unknown as KeywordAnalysisResult)
        : null,
      reviewAnalysis: reviewRow
        ? (reviewRow.analysis_result as unknown as ReviewAnalysisResult)
        : null,
      qnaAnalysis: qnaRow
        ? (qnaRow.analysis_result as unknown as QnAAnalysisResult)
        : null,
      competitorAnalysis: competitorRow
        ? (competitorRow.analysis_result as unknown as CompetitorAnalysisResult)
        : null,
      marketIntelligence,
      creativeBrief,
    })

    return NextResponse.json({
      data: {
        storyboard: result,
        model,
        tokensUsed,
      },
    }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Video storyboard error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
