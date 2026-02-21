import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateTitlePhase,
  generateBulletsPhase,
  generateDescriptionPhase,
  generateBackendPhase,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
  type ListingGenerationInput,
} from '@/lib/claude'
import type { CompetitorAnalysisResult } from '@/types/api'
import type { KeywordCoverage } from '@/types/database'

// Normalize bullet into string array of variations
function normalizeBullet(bullet: string[] | Record<string, unknown>): string[] {
  if (!bullet) return []
  if (Array.isArray(bullet)) return bullet as string[]
  // Legacy 3×3 object format fallback
  const b = bullet as { seo?: { concise?: string; medium?: string; longer?: string }; benefit?: { concise?: string; medium?: string; longer?: string }; balanced?: { concise?: string; medium?: string; longer?: string } }
  return [
    b.seo?.concise || '', b.seo?.medium || '', b.seo?.longer || '',
    b.benefit?.concise || '', b.benefit?.medium || '', b.benefit?.longer || '',
    b.balanced?.concise || '', b.balanced?.medium || '', b.balanced?.longer || '',
  ]
}

/**
 * Fetch research analyses and build the ListingGenerationInput object.
 * Shared by all phases.
 */
async function buildGenerationInput(
  supabase: ReturnType<typeof createClient>,
  generationContext: Record<string, unknown>,
  country: { name: string; language: string; title_limit: number; bullet_limit: number; bullet_count: number; description_limit: number; search_terms_limit: number },
  categoryName: string,
  optimizationMode?: string,
  existingListingText?: { title: string; bullets: string[]; description: string } | null,
): Promise<ListingGenerationInput> {
  const categoryId = generationContext.categoryId as string
  const countryId = generationContext.countryId as string

  // Fetch analyses
  const { data: analyses } = await supabase
    .from('lb_research_analysis')
    .select('analysis_type, analysis_result, source, market_intelligence_id')
    .eq('category_id', categoryId)
    .eq('country_id', countryId)
    .eq('status', 'completed')

  const allAnalyses = analyses || []

  // Pick best analysis per type: prefer merged > csv > file
  const sourcePriority = ['merged', 'csv', 'file', 'linked']
  const pickBest = (type: string) => {
    const matches = allAnalyses.filter((a) => a.analysis_type === type)
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

  // Resolve linked Market Intelligence data
  const miRow = allAnalyses.find((a) => a.analysis_type === 'market_intelligence' && a.source === 'linked')
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

  return {
    productName: (generationContext.productName as string) || '',
    brand: (generationContext.brand as string) || '',
    asin: (generationContext.asin as string) || undefined,
    attributes: (generationContext.attributes as Record<string, string>) || {},
    categoryName,
    countryName: country.name,
    language: country.language,
    charLimits: {
      title: country.title_limit,
      bullet: country.bullet_limit,
      bulletCount: country.bullet_count,
      description: country.description_limit,
      searchTerms: country.search_terms_limit,
    },
    keywordAnalysis: keywordRow ? (keywordRow.analysis_result as unknown as KeywordAnalysisResult) : null,
    reviewAnalysis: reviewRow ? (reviewRow.analysis_result as unknown as ReviewAnalysisResult) : null,
    qnaAnalysis: qnaRow ? (qnaRow.analysis_result as unknown as QnAAnalysisResult) : null,
    competitorAnalysis: competitorRow ? (competitorRow.analysis_result as unknown as CompetitorAnalysisResult) : null,
    marketIntelligence: marketIntelligence as import('@/types/market-intelligence').MarketIntelligenceResult | null,
    optimizationMode: (optimizationMode as 'new' | 'optimize_existing' | 'based_on_existing') || 'new',
    existingListingText: existingListingText || null,
  }
}

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { phase, listing_id } = body

    if (!phase || !['title', 'bullets', 'description', 'backend'].includes(phase)) {
      return NextResponse.json({ error: 'Valid phase required: title, bullets, description, backend' }, { status: 400 })
    }

    // ==================== TITLE PHASE ====================
    if (phase === 'title') {
      const { category_id, country_id, product_name, asin, brand, attributes, product_type_name, optimization_mode, existing_listing_text } = body

      if (!category_id || !country_id || !product_name || !brand) {
        return NextResponse.json({ error: 'category_id, country_id, product_name, and brand are required' }, { status: 400 })
      }

      if (typeof product_name !== 'string' || product_name.trim().length < 3) {
        return NextResponse.json({ error: 'Product name must be at least 3 characters' }, { status: 400 })
      }

      // Fetch category + country
      const [catResult, countryResult] = await Promise.all([
        supabase.from('lb_categories').select('id, name, brand').eq('id', category_id).single(),
        supabase.from('lb_countries').select('*').eq('id', country_id).single(),
      ])

      if (!catResult.data) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      if (!countryResult.data) return NextResponse.json({ error: 'Country not found' }, { status: 404 })

      const category = catResult.data
      const country = countryResult.data

      // Parse attributes
      const parsedAttributes: Record<string, string> = {}
      if (attributes && typeof attributes === 'object') {
        for (const [key, value] of Object.entries(attributes)) {
          if (key && value && typeof value === 'string') parsedAttributes[key] = value
        }
      }

      // Handle product type creation
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

        if (!ptError) productType = ptData
      }

      // Build generation input
      const generationContext = {
        categoryId: category_id,
        countryId: country_id,
        productName: product_name.trim(),
        brand,
        asin: asin || null,
        attributes: parsedAttributes,
      }

      const input = await buildGenerationInput(
        supabase, generationContext, country, category.name,
        optimization_mode, existing_listing_text
      )

      // Generate titles
      const { result, model, tokensUsed } = await generateTitlePhase(input)

      // If re-generating: delete existing listing and its sections
      if (listing_id) {
        await adminClient.from('lb_listing_sections').delete().eq('listing_id', listing_id)
        await adminClient.from('lb_listings').delete().eq('id', listing_id)
      }

      // Create listing row
      const { data: listing, error: listingError } = await adminClient
        .from('lb_listings')
        .insert({
          product_type_id: productType?.id || null,
          country_id,
          title: result.titles[0] || '',
          bullet_points: [],
          description: null,
          search_terms: null,
          subject_matter: [],
          backend_keywords: null,
          optimization_mode: optimization_mode || 'new',
          existing_listing_text: existing_listing_text || null,
          status: 'draft',
          generation_phase: 'title',
          keyword_coverage: result.keywordCoverage,
          generation_context: {
            ...generationContext,
            analysisTypes: Object.keys(input).filter((k) => k.endsWith('Analysis') && input[k as keyof typeof input]),
          },
          model_used: model,
          tokens_used: tokensUsed,
          created_by: lbUser.id,
        })
        .select()
        .single()

      if (listingError || !listing) {
        return NextResponse.json({ error: listingError?.message || 'Failed to save listing' }, { status: 500 })
      }

      // Insert title section with 5 variations
      const { data: sections, error: sectionsError } = await adminClient
        .from('lb_listing_sections')
        .insert({
          listing_id: listing.id,
          section_type: 'title',
          variations: result.titles,
          selected_variation: 0,
          is_approved: false,
        })
        .select()

      if (sectionsError) {
        await adminClient.from('lb_listings').delete().eq('id', listing.id)
        return NextResponse.json({ error: 'Failed to save title section: ' + sectionsError.message }, { status: 500 })
      }

      return NextResponse.json({
        data: {
          phase: 'title',
          listing_id: listing.id,
          sections: sections || [],
          model,
          tokensUsed,
          totalTokensUsed: tokensUsed,
          keywordCoverage: result.keywordCoverage,
          productType,
        },
      }, { status: 201 })
    }

    // ==================== BULLETS PHASE ====================
    if (phase === 'bullets') {
      if (!listing_id) return NextResponse.json({ error: 'listing_id required for bullets phase' }, { status: 400 })

      // Fetch listing
      const { data: listing, error: listingError } = await supabase
        .from('lb_listings')
        .select('*, product_type:lb_product_types(name, category_id)')
        .eq('id', listing_id)
        .single()

      if (listingError || !listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

      // Get confirmed title from the title section's final_text
      const { data: titleSections } = await supabase
        .from('lb_listing_sections')
        .select('*')
        .eq('listing_id', listing_id)
        .eq('section_type', 'title')

      const titleSection = titleSections?.[0]
      if (!titleSection) return NextResponse.json({ error: 'Title section not found — generate title first' }, { status: 400 })

      const confirmedTitle = titleSection.final_text?.trim()
        || (titleSection.variations as string[])[titleSection.selected_variation]
        || ''

      if (!confirmedTitle) {
        return NextResponse.json({ error: 'No confirmed title found. Please set a final title text first.' }, { status: 400 })
      }

      // Fetch category name
      const pt = Array.isArray(listing.product_type) ? listing.product_type[0] : listing.product_type
      const categoryId = pt?.category_id || listing.generation_context?.categoryId
      const { data: cat } = categoryId
        ? await supabase.from('lb_categories').select('name').eq('id', categoryId).single()
        : { data: null }

      // Fetch country
      const { data: country } = await supabase.from('lb_countries').select('*').eq('id', listing.country_id).single()
      if (!country) return NextResponse.json({ error: 'Country not found' }, { status: 404 })

      const input = await buildGenerationInput(
        supabase, listing.generation_context, country, cat?.name || 'Unknown',
        listing.optimization_mode, listing.existing_listing_text
      )

      const existingCoverage: KeywordCoverage = listing.keyword_coverage || { placed: [], remaining: [], coverageScore: 0 }

      // Delete existing bullet sections if re-generating (supports up to 10 bullets)
      const allBulletTypes = Array.from({ length: 10 }, (_, i) => `bullet_${i + 1}`)
      await adminClient.from('lb_listing_sections')
        .delete()
        .eq('listing_id', listing_id)
        .in('section_type', allBulletTypes)

      // Also delete downstream sections (description, search_terms, subject_matter)
      await adminClient.from('lb_listing_sections')
        .delete()
        .eq('listing_id', listing_id)
        .in('section_type', ['description', 'search_terms', 'subject_matter'])

      // Generate bullets
      const { result, model, tokensUsed } = await generateBulletsPhase(input, confirmedTitle, existingCoverage)

      // Upsert bullet sections (ON CONFLICT replaces if re-generating)
      const bulletRows = result.bullets.map((bullet, i) => ({
        listing_id: listing_id,
        section_type: `bullet_${i + 1}`,
        variations: normalizeBullet(bullet),
        selected_variation: 0,
        is_approved: false,
      }))

      const { data: sections, error: sectionsError } = await adminClient
        .from('lb_listing_sections')
        .upsert(bulletRows, { onConflict: 'listing_id,section_type' })
        .select()

      if (sectionsError) {
        return NextResponse.json({ error: 'Failed to save bullet sections: ' + sectionsError.message }, { status: 500 })
      }

      // Update listing
      const totalTokens = (listing.tokens_used || 0) + tokensUsed
      await adminClient.from('lb_listings').update({
        generation_phase: 'bullets',
        keyword_coverage: result.keywordCoverage,
        planning_matrix: result.planningMatrix || null,
        model_used: model,
        tokens_used: totalTokens,
      }).eq('id', listing_id)

      return NextResponse.json({
        data: {
          phase: 'bullets',
          listing_id,
          sections: sections || [],
          model,
          tokensUsed,
          totalTokensUsed: totalTokens,
          keywordCoverage: result.keywordCoverage,
          planningMatrix: result.planningMatrix || null,
        },
      })
    }

    // ==================== DESCRIPTION PHASE ====================
    if (phase === 'description') {
      if (!listing_id) return NextResponse.json({ error: 'listing_id required for description phase' }, { status: 400 })

      const { data: listing } = await supabase
        .from('lb_listings')
        .select('*, product_type:lb_product_types(name, category_id)')
        .eq('id', listing_id)
        .single()

      if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

      // Get confirmed title
      const { data: allSections } = await supabase
        .from('lb_listing_sections')
        .select('*')
        .eq('listing_id', listing_id)

      const sections = allSections || []
      const titleSec = sections.find((s) => s.section_type === 'title')
      const confirmedTitle = titleSec?.final_text?.trim()
        || (titleSec?.variations as string[])?.[titleSec?.selected_variation ?? 0]
        || ''

      // Get confirmed bullets (dynamic count — supports 5-10)
      const confirmedBullets: string[] = []
      const bulletSections = sections
        .filter((s) => s.section_type.startsWith('bullet_'))
        .sort((a, b) => parseInt(a.section_type.split('_')[1]) - parseInt(b.section_type.split('_')[1]))
      for (const bSec of bulletSections) {
        const text = bSec.final_text?.trim()
          || (bSec.variations as string[])?.[bSec.selected_variation ?? 0]
          || ''
        confirmedBullets.push(text)
      }

      if (!confirmedTitle || confirmedBullets.every((b) => !b)) {
        return NextResponse.json({ error: 'Title and bullets must be confirmed before generating description' }, { status: 400 })
      }

      const pt = Array.isArray(listing.product_type) ? listing.product_type[0] : listing.product_type
      const categoryId = pt?.category_id || listing.generation_context?.categoryId
      const { data: cat } = categoryId
        ? await supabase.from('lb_categories').select('name').eq('id', categoryId).single()
        : { data: null }
      const { data: country } = await supabase.from('lb_countries').select('*').eq('id', listing.country_id).single()
      if (!country) return NextResponse.json({ error: 'Country not found' }, { status: 404 })

      const input = await buildGenerationInput(
        supabase, listing.generation_context, country, cat?.name || 'Unknown',
        listing.optimization_mode, listing.existing_listing_text
      )

      const existingCoverage: KeywordCoverage = listing.keyword_coverage || { placed: [], remaining: [], coverageScore: 0 }

      // Delete existing description + search_terms + subject_matter sections if re-generating
      await adminClient.from('lb_listing_sections')
        .delete()
        .eq('listing_id', listing_id)
        .in('section_type', ['description', 'search_terms', 'subject_matter'])

      // Generate description + search terms
      const { result, model, tokensUsed } = await generateDescriptionPhase(input, confirmedTitle, confirmedBullets, existingCoverage)

      // Insert description + search_terms sections
      const sectionRows = [
        {
          listing_id: listing_id,
          section_type: 'description',
          variations: result.descriptions,
          selected_variation: 0,
          is_approved: false,
        },
        {
          listing_id: listing_id,
          section_type: 'search_terms',
          variations: result.searchTerms,
          selected_variation: 0,
          is_approved: false,
        },
      ]

      const { data: newSections, error: sectionsError } = await adminClient
        .from('lb_listing_sections')
        .upsert(sectionRows, { onConflict: 'listing_id,section_type' })
        .select()

      if (sectionsError) {
        return NextResponse.json({ error: 'Failed to save description sections: ' + sectionsError.message }, { status: 500 })
      }

      const totalTokens = (listing.tokens_used || 0) + tokensUsed
      await adminClient.from('lb_listings').update({
        generation_phase: 'description',
        keyword_coverage: result.keywordCoverage,
        model_used: model,
        tokens_used: totalTokens,
      }).eq('id', listing_id)

      return NextResponse.json({
        data: {
          phase: 'description',
          listing_id,
          sections: newSections || [],
          model,
          tokensUsed,
          totalTokensUsed: totalTokens,
          keywordCoverage: result.keywordCoverage,
        },
      })
    }

    // ==================== BACKEND PHASE ====================
    if (phase === 'backend') {
      if (!listing_id) return NextResponse.json({ error: 'listing_id required for backend phase' }, { status: 400 })

      const { data: listing } = await supabase
        .from('lb_listings')
        .select('*, product_type:lb_product_types(name, category_id)')
        .eq('id', listing_id)
        .single()

      if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

      // Get all confirmed content
      const { data: allSections } = await supabase
        .from('lb_listing_sections')
        .select('*')
        .eq('listing_id', listing_id)

      const sections = allSections || []

      const getConfirmedText = (sectionType: string) => {
        const sec = sections.find((s) => s.section_type === sectionType)
        return sec?.final_text?.trim()
          || (sec?.variations as string[])?.[sec?.selected_variation ?? 0]
          || ''
      }

      const confirmedTitle = getConfirmedText('title')
      const confirmedBullets = sections
        .filter((s) => s.section_type.startsWith('bullet_'))
        .sort((a, b) => parseInt(a.section_type.split('_')[1]) - parseInt(b.section_type.split('_')[1]))
        .map((s) => getConfirmedText(s.section_type))
      const confirmedDescription = getConfirmedText('description')
      const confirmedSearchTerms = getConfirmedText('search_terms')

      const pt = Array.isArray(listing.product_type) ? listing.product_type[0] : listing.product_type
      const categoryId = pt?.category_id || listing.generation_context?.categoryId
      const { data: cat } = categoryId
        ? await supabase.from('lb_categories').select('name').eq('id', categoryId).single()
        : { data: null }
      const { data: country } = await supabase.from('lb_countries').select('*').eq('id', listing.country_id).single()
      if (!country) return NextResponse.json({ error: 'Country not found' }, { status: 404 })

      const input = await buildGenerationInput(
        supabase, listing.generation_context, country, cat?.name || 'Unknown',
        listing.optimization_mode, listing.existing_listing_text
      )

      const existingCoverage: KeywordCoverage = listing.keyword_coverage || { placed: [], remaining: [], coverageScore: 0 }

      // Delete existing subject_matter section if re-generating
      await adminClient.from('lb_listing_sections')
        .delete()
        .eq('listing_id', listing_id)
        .eq('section_type', 'subject_matter')

      // Generate backend phase
      const { result, model, tokensUsed } = await generateBackendPhase(
        input, confirmedTitle, confirmedBullets, confirmedDescription, confirmedSearchTerms, existingCoverage
      )

      // Insert subject_matter section
      const sm = result.subjectMatter || []
      const subjectVariations = [0, 1, 2].map((varIdx) =>
        sm.map((field) => field[varIdx] || '').join('; ')
      )

      const { data: newSections, error: sectionsError } = await adminClient
        .from('lb_listing_sections')
        .upsert({
          listing_id: listing_id,
          section_type: 'subject_matter',
          variations: subjectVariations,
          selected_variation: 0,
          is_approved: false,
        }, { onConflict: 'listing_id,section_type' })
        .select()

      if (sectionsError) {
        return NextResponse.json({ error: 'Failed to save subject matter section: ' + sectionsError.message }, { status: 500 })
      }

      // Sync denormalized fields on listing
      const totalTokens = (listing.tokens_used || 0) + tokensUsed
      await adminClient.from('lb_listings').update({
        generation_phase: 'complete',
        keyword_coverage: result.keywordCoverage,
        backend_attributes: result.backendAttributes || null,
        title: confirmedTitle,
        bullet_points: confirmedBullets,
        description: confirmedDescription,
        search_terms: confirmedSearchTerms,
        subject_matter: subjectVariations.length > 0 ? [subjectVariations[0]] : [],
        model_used: model,
        tokens_used: totalTokens,
      }).eq('id', listing_id)

      return NextResponse.json({
        data: {
          phase: 'backend',
          listing_id,
          sections: newSections || [],
          model,
          tokensUsed,
          totalTokensUsed: totalTokens,
          keywordCoverage: result.keywordCoverage,
          backendAttributes: result.backendAttributes || null,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Phased generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
