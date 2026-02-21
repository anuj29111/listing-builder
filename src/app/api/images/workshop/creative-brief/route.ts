import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateCreativeBrief,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type {
  GenerateCreativeBriefRequest,
  CompetitorAnalysisResult,
  ProductPhotoDescription,
} from '@/types/api'
import type { MarketIntelligenceResult } from '@/types/market-intelligence'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateCreativeBriefRequest

    const { product_name, brand, category_id, country_id, listing_id, workshop_id, market_intelligence_id } = body

    if (!product_name || !brand || !category_id || !country_id || !workshop_id) {
      return NextResponse.json(
        { error: 'product_name, brand, category_id, country_id, and workshop_id are required' },
        { status: 400 }
      )
    }

    // Fetch category, research analyses, and workshop data in parallel
    const [catResult, analysesResult, workshopResult] = await Promise.all([
      supabase.from('lb_categories').select('id, name, brand').eq('id', category_id).single(),
      supabase
        .from('lb_research_analysis')
        .select('analysis_type, analysis_result, source, market_intelligence_id')
        .eq('category_id', category_id)
        .eq('country_id', country_id)
        .eq('status', 'completed'),
      supabase.from('lb_image_workshops').select('product_photos, product_photo_descriptions').eq('id', workshop_id).single(),
    ])

    if (!catResult.data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
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

    // Fetch listing content if available
    let listingTitle: string | null = null
    const bulletPoints: string[] = []
    let listingDescription: string | null = null
    if (listing_id) {
      const [lr, sr] = await Promise.all([
        supabase.from('lb_listings').select('title').eq('id', listing_id).single(),
        supabase.from('lb_listing_sections').select('section_type, variations, selected_variation').eq('listing_id', listing_id),
      ])
      listingTitle = lr?.data?.title || null
      if (sr?.data) {
        for (const section of sr.data) {
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
    }

    // Auto-resolve linked Market Intelligence from research bridge record
    const miRow = analyses.find((a) => a.analysis_type === 'market_intelligence' && a.source === 'linked')
    const resolvedMiId = market_intelligence_id || miRow?.market_intelligence_id
    let marketIntelligence: MarketIntelligenceResult | null = null
    if (resolvedMiId) {
      const { data: miRecord } = await supabase
        .from('lb_market_intelligence')
        .select('analysis_result, status')
        .eq('id', resolvedMiId)
        .eq('status', 'completed')
        .single()
      if (miRecord?.analysis_result) {
        marketIntelligence = miRecord.analysis_result as unknown as MarketIntelligenceResult
      }
    }

    // Extract product photo descriptions from workshop
    const productPhotoDescriptions = (workshopResult?.data?.product_photo_descriptions as Record<string, ProductPhotoDescription> | null) || null

    const { result, model, tokensUsed } = await generateCreativeBrief({
      productName: product_name,
      brand,
      categoryName: category.name,
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
      listingTitle,
      bulletPoints,
      listingDescription,
      productPhotoDescriptions,
    })

    // Save creative brief to workshop
    const { error: updateError } = await adminClient
      .from('lb_image_workshops')
      .update({
        creative_brief: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workshop_id)

    if (updateError) {
      console.error('Failed to save creative brief to workshop:', updateError)
    }

    return NextResponse.json({
      data: {
        brief: result,
        model,
        tokensUsed,
      },
    }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Creative brief error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
