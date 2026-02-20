import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateVideoThumbnailPrompts,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { GenerateThumbnailPromptsRequest, CompetitorAnalysisResult, CreativeBrief } from '@/types/api'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateThumbnailPromptsRequest

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
        .select('analysis_type, analysis_result, source')
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

    // Pick best analysis per type: prefer merged > csv > file
    const sourcePriority = ['merged', 'csv', 'file']
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

    const { result } = await generateVideoThumbnailPrompts({
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
      creativeBrief,
    })

    // Create workshop record with prompts persisted
    const workshopName = `${brand} ${product_name} — Video Thumbnails — ${new Date().toLocaleDateString()}`
    const allIndices = result.concepts.map((_: unknown, i: number) => i)
    const { data: workshop, error: insertError } = await adminClient
      .from('lb_image_workshops')
      .insert({
        listing_id: listing_id || null,
        name: workshopName,
        product_name,
        brand,
        category_id,
        country_id,
        step: 1,
        element_tags: {},
        callout_texts: [],
        competitor_urls: [],
        generated_prompts: result.concepts,
        selected_prompt_indices: allIndices,
        image_type: 'video_thumbnail',
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (insertError || !workshop) {
      throw new Error(insertError?.message || 'Failed to create workshop')
    }

    return NextResponse.json({
      data: {
        workshop,
        concepts: result.concepts,
      },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Thumbnail prompts error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
