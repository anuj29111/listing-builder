import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateListing,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { CompetitorAnalysisResult } from '@/types/api'
import { SECTION_TYPES } from '@/lib/constants'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')

    let query = supabase
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(name, asin, category_id), country:lb_countries(name, code, flag_emoji, language), creator:lb_users!created_by(full_name)'
      )

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

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

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { category_id, country_id, product_name, asin, brand, attributes, product_type_name, optimization_mode, existing_listing_text } = body

    // Validate required fields
    if (!category_id || !country_id || !product_name || !brand) {
      return NextResponse.json(
        { error: 'category_id, country_id, product_name, and brand are required' },
        { status: 400 }
      )
    }

    if (typeof product_name !== 'string' || product_name.trim().length < 3) {
      return NextResponse.json(
        { error: 'Product name must be at least 3 characters' },
        { status: 400 }
      )
    }

    // Fetch category, country, and analyses in parallel
    const [catResult, countryResult, analysesResult] = await Promise.all([
      supabase.from('lb_categories').select('id, name, brand').eq('id', category_id).single(),
      supabase.from('lb_countries').select('*').eq('id', country_id).single(),
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

    // Parse attributes from the body (key-value pairs)
    const parsedAttributes: Record<string, string> = {}
    if (attributes && typeof attributes === 'object') {
      for (const [key, value] of Object.entries(attributes)) {
        if (key && value && typeof value === 'string') {
          parsedAttributes[key] = value
        }
      }
    }

    // Handle product type creation if name provided
    let productType = null
    if (product_type_name && typeof product_type_name === 'string' && product_type_name.trim()) {
      const { data: ptData, error: ptError } = await adminClient
        .from('lb_product_types')
        .insert({
          category_id,
          name: product_type_name.trim(),
          asin: asin || null,
          attributes: parsedAttributes,
          created_by: lbUser.id,
        })
        .select()
        .single()

      if (ptError) {
        console.error('Failed to create product type:', ptError)
      } else {
        productType = ptData
      }
    }

    // Generate listing via Claude
    const { result, model, tokensUsed } = await generateListing({
      productName: product_name.trim(),
      brand,
      asin: asin || undefined,
      attributes: parsedAttributes,
      categoryName: category.name,
      countryName: country.name,
      language: country.language,
      charLimits: {
        title: country.title_limit,
        bullet: country.bullet_limit,
        bulletCount: country.bullet_count,
        description: country.description_limit,
        searchTerms: country.search_terms_limit,
      },
      keywordAnalysis,
      reviewAnalysis,
      qnaAnalysis,
      competitorAnalysis,
      optimizationMode: optimization_mode || 'new',
      existingListingText: existing_listing_text || null,
    })

    // Flatten bullet object into 9-element array: [seo_concise, seo_medium, seo_longer, benefit_concise, ...]
    const flattenBullet = (bullet: typeof result.bullets[0]): string[] => {
      if (!bullet) return []
      // Handle both new structured format and legacy array format
      if (Array.isArray(bullet)) return bullet as unknown as string[]
      return [
        bullet.seo?.concise || '', bullet.seo?.medium || '', bullet.seo?.longer || '',
        bullet.benefit?.concise || '', bullet.benefit?.medium || '', bullet.benefit?.longer || '',
        bullet.balanced?.concise || '', bullet.balanced?.medium || '', bullet.balanced?.longer || '',
      ]
    }

    // Insert listing row (first variation as defaults)
    const { data: listing, error: listingError } = await adminClient
      .from('lb_listings')
      .insert({
        product_type_id: productType?.id || null,
        country_id,
        title: result.title[0] || '',
        bullet_points: result.bullets.map((b) => flattenBullet(b)[0] || ''),
        description: result.description[0] || '',
        search_terms: result.searchTerms[0] || '',
        subject_matter: (result.subjectMatter || []).map((s) => s[0] || ''),
        backend_keywords: result.searchTerms[0] || '',
        planning_matrix: result.planningMatrix || null,
        backend_attributes: result.backendAttributes || null,
        optimization_mode: optimization_mode || 'new',
        existing_listing_text: existing_listing_text || null,
        status: 'draft',
        generation_context: {
          categoryId: category_id,
          countryId: country_id,
          productName: product_name.trim(),
          brand,
          asin: asin || null,
          attributes: parsedAttributes,
          analysisTypes: analyses.map((a) => a.analysis_type),
        },
        model_used: model,
        tokens_used: tokensUsed,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (listingError || !listing) {
      return NextResponse.json(
        { error: listingError?.message || 'Failed to save listing' },
        { status: 500 }
      )
    }

    // Insert listing sections (title, 5 bullets, description, search_terms, subject_matter)
    // Note: backend_attributes are stored as JSONB on the listing record itself, not as a section
    const sectionRows = SECTION_TYPES.map((sectionType) => {
      let variations: string[] = []

      if (sectionType === 'title') {
        variations = result.title
      } else if (sectionType.startsWith('bullet_')) {
        const bulletIndex = parseInt(sectionType.split('_')[1]) - 1
        variations = flattenBullet(result.bullets[bulletIndex])
      } else if (sectionType === 'description') {
        variations = result.description
      } else if (sectionType === 'search_terms') {
        variations = result.searchTerms
      } else if (sectionType === 'subject_matter') {
        const sm = result.subjectMatter || []
        variations = [0, 1, 2].map((varIdx) =>
          sm.map((field) => field[varIdx] || '').join('; ')
        )
      }

      return {
        listing_id: listing.id,
        section_type: sectionType,
        variations,
        selected_variation: 0,
        is_approved: false,
      }
    })

    const { data: sections, error: sectionsError } = await adminClient
      .from('lb_listing_sections')
      .insert(sectionRows)
      .select()

    if (sectionsError) {
      // Clean up listing if sections fail
      await adminClient.from('lb_listings').delete().eq('id', listing.id)
      return NextResponse.json(
        { error: 'Failed to save listing sections: ' + sectionsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: {
          listing,
          sections: sections || [],
          product_type: productType,
        },
      },
      { status: 201 }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Listing generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
