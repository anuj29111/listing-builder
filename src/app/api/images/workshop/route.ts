import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateImagePrompts,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { GenerateWorkshopPromptsRequest, CompetitorAnalysisResult } from '@/types/api'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateWorkshopPromptsRequest

    const { product_name, brand, category_id, country_id, listing_id, name, image_type } = body

    if (!product_name || !brand || !category_id || !country_id) {
      return NextResponse.json(
        { error: 'product_name, brand, category_id, and country_id are required' },
        { status: 400 }
      )
    }

    // Fetch category, country, and research analyses in parallel
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

    if (!catResult.data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (!countryResult.data) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const category = catResult.data
    const country = countryResult.data
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

    const keywordAnalysis = keywordRow
      ? (keywordRow.analysis_result as unknown as KeywordAnalysisResult)
      : null
    const reviewAnalysis = reviewRow
      ? (reviewRow.analysis_result as unknown as ReviewAnalysisResult)
      : null
    const qnaAnalysis = qnaRow
      ? (qnaRow.analysis_result as unknown as QnAAnalysisResult)
      : null
    const competitorAnalysis = competitorRow
      ? (competitorRow.analysis_result as unknown as CompetitorAnalysisResult)
      : null

    // Fetch listing content when listing_id is provided (for full context)
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

    // Generate AI image prompts using full research + listing data
    const { result } = await generateImagePrompts({
      productName: product_name,
      brand,
      categoryName: category.name,
      keywordAnalysis,
      reviewAnalysis,
      qnaAnalysis,
      competitorAnalysis,
      listingTitle,
      bulletPoints,
      listingDescription,
    })

    // Create workshop record — save prompts to DB for persistence
    const workshopName = name || `${brand} ${product_name} — ${new Date().toLocaleDateString()}`
    const allIndices = result.prompts.map((_: unknown, i: number) => i)
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
        callout_texts: result.callout_suggestions || [],
        competitor_urls: [],
        generated_prompts: result.prompts,
        selected_prompt_indices: allIndices,
        image_type: image_type || 'main',
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
        prompts: result.prompts,
        callout_suggestions: result.callout_suggestions,
      },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Workshop creation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get('listing_id')
    const categoryId = searchParams.get('category_id')
    const countryId = searchParams.get('country_id')

    // If specific filters provided, return workshops + images for context
    if (listingId || (categoryId && countryId)) {
      let workshopQuery = supabase
        .from('lb_image_workshops')
        .select('*')
        .order('created_at', { ascending: false })

      if (listingId) {
        workshopQuery = workshopQuery.eq('listing_id', listingId)
      } else {
        workshopQuery = workshopQuery.eq('category_id', categoryId!).eq('country_id', countryId!)
      }

      const { data: workshops } = await workshopQuery
      const ws = workshops || []
      const workshopIds = ws.map((w) => w.id)

      let imgs: unknown[] = []
      if (workshopIds.length > 0) {
        const { data: imageData } = await supabase
          .from('lb_image_generations')
          .select('*')
          .in('workshop_id', workshopIds)
          .order('created_at', { ascending: true })
        imgs = imageData || []
      }

      return NextResponse.json({ data: { workshops: ws, images: imgs } })
    }

    // Default: return recent workshops list (for drafts display)
    const { data, error } = await supabase
      .from('lb_image_workshops')
      .select('id, name, product_name, brand, image_type, category_id, country_id, listing_id, step, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20)

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
