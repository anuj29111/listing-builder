import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateVideoStoryboard,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { CompetitorAnalysisResult, CreativeBrief } from '@/types/api'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()
    const { listing_id } = body as { listing_id: string }

    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
    }

    // Fetch listing with product type
    const { data: listing, error: listingError } = await supabase
      .from('lb_listings')
      .select('*, product_type:lb_product_types(id, name, asin, category_id)')
      .eq('id', listing_id)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const categoryId = listing.product_type?.category_id ||
      (listing.generation_context as Record<string, string>)?.categoryId
    const countryId = listing.country_id
    const productName = (listing.generation_context as Record<string, string>)?.productName ||
      listing.product_type?.name || 'Product'
    const brand = (listing.generation_context as Record<string, string>)?.brand || ''

    // Fetch category, research, listing sections, and existing video project in parallel
    const [catResult, analysesResult, sectionsResult, existingProject] = await Promise.all([
      categoryId
        ? supabase.from('lb_categories').select('id, name, brand').eq('id', categoryId).single()
        : Promise.resolve({ data: null }),
      categoryId
        ? supabase
            .from('lb_research_analysis')
            .select('analysis_type, analysis_result, source, market_intelligence_id')
            .eq('category_id', categoryId)
            .eq('country_id', countryId)
            .eq('status', 'completed')
        : Promise.resolve({ data: [] }),
      supabase
        .from('lb_listing_sections')
        .select('section_type, variations, selected_variation')
        .eq('listing_id', listing_id),
      supabase
        .from('lb_video_projects')
        .select('*')
        .eq('listing_id', listing_id)
        .maybeSingle(),
    ])

    const categoryName = catResult.data?.name || ''
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

    // Extract bullet points + description from listing sections
    const bulletPoints: string[] = []
    let listingDescription: string | null = null
    if (sectionsResult.data) {
      for (const section of sectionsResult.data) {
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
    const { data: workshops } = await supabase
      .from('lb_image_workshops')
      .select('creative_brief')
      .eq('listing_id', listing_id)
      .not('creative_brief', 'is', null)
      .limit(1)
    if (workshops?.[0]?.creative_brief) {
      creativeBrief = workshops[0].creative_brief as unknown as CreativeBrief
    }

    const { result, model, tokensUsed } = await generateVideoStoryboard({
      productName,
      brand,
      categoryName,
      keywordAnalysis: keywordRow?.analysis_result as unknown as KeywordAnalysisResult | undefined,
      reviewAnalysis: reviewRow?.analysis_result as unknown as ReviewAnalysisResult | undefined,
      qnaAnalysis: qnaRow?.analysis_result as unknown as QnAAnalysisResult | undefined,
      competitorAnalysis: competitorRow?.analysis_result as unknown as CompetitorAnalysisResult | undefined,
      marketIntelligence,
      listingTitle: listing.title,
      bulletPoints,
      listingDescription,
      creativeBrief,
    })

    // Upsert video project
    const upsertData = {
      listing_id,
      storyboard: result as unknown as Record<string, unknown>,
      storyboard_model: model,
      storyboard_tokens_used: tokensUsed,
      created_by: user.authUser.id,
    }

    let videoProject
    if (existingProject.data) {
      const { data, error } = await supabase
        .from('lb_video_projects')
        .update({
          storyboard: upsertData.storyboard,
          storyboard_model: upsertData.storyboard_model,
          storyboard_tokens_used: upsertData.storyboard_tokens_used,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProject.data.id)
        .select()
        .single()
      if (error) throw error
      videoProject = data
    } else {
      const { data, error } = await supabase
        .from('lb_video_projects')
        .insert(upsertData)
        .select()
        .single()
      if (error) throw error
      videoProject = data
    }

    return NextResponse.json({
      data: { video_project: videoProject, model, tokens_used: tokensUsed },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Video storyboard generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
