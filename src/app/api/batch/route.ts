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
import type { BatchProduct, CompetitorAnalysisResult } from '@/types/api'

const MAX_BATCH_SIZE = 20

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('lb_batch_jobs')
      .select('*, category:lb_categories(name, brand), country:lb_countries(name, code, flag_emoji)')

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

    const { name, category_id, country_id, products } = body as {
      name?: string
      category_id: string
      country_id: string
      products: BatchProduct[]
    }

    // Validate required fields
    if (!category_id || !country_id) {
      return NextResponse.json(
        { error: 'category_id and country_id are required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'At least one product is required' },
        { status: 400 }
      )
    }

    if (products.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} products per batch` },
        { status: 400 }
      )
    }

    // Validate each product
    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      if (!p.product_name || typeof p.product_name !== 'string' || p.product_name.trim().length < 3) {
        return NextResponse.json(
          { error: `Product ${i + 1}: product_name must be at least 3 characters` },
          { status: 400 }
        )
      }
      if (!p.brand || typeof p.brand !== 'string') {
        return NextResponse.json(
          { error: `Product ${i + 1}: brand is required` },
          { status: 400 }
        )
      }
    }

    // Fetch category, country, and analyses ONCE (shared across all products)
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

    // Create batch job
    const { data: batchJob, error: batchError } = await adminClient
      .from('lb_batch_jobs')
      .insert({
        name: name || `Batch: ${category.name} - ${country.name}`,
        category_id,
        country_id,
        product_type_ids: [],
        status: 'processing',
        total_listings: products.length,
        completed_listings: 0,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (batchError || !batchJob) {
      return NextResponse.json(
        { error: batchError?.message || 'Failed to create batch job' },
        { status: 500 }
      )
    }

    // Generate listings sequentially
    const failedProducts: Array<{ product_name: string; error: string }> = []
    const productTypeIds: string[] = []

    for (let i = 0; i < products.length; i++) {
      const product = products[i]

      try {
        // Parse attributes
        const parsedAttributes: Record<string, string> = {}
        if (product.attributes && typeof product.attributes === 'object') {
          for (const [key, value] of Object.entries(product.attributes)) {
            if (key && value && typeof value === 'string') {
              parsedAttributes[key] = value
            }
          }
        }

        // Create product type if name provided
        let productType = null
        if (product.product_type_name && typeof product.product_type_name === 'string' && product.product_type_name.trim()) {
          const { data: ptData, error: ptError } = await adminClient
            .from('lb_product_types')
            .insert({
              category_id,
              name: product.product_type_name.trim(),
              asin: product.asin || null,
              attributes: parsedAttributes,
              created_by: lbUser.id,
            })
            .select()
            .single()

          if (!ptError && ptData) {
            productType = ptData
            productTypeIds.push(ptData.id)
          }
        }

        // Build shared generation input for all 4 phases
        const genInput: ListingGenerationInput = {
          productName: product.product_name.trim(),
          brand: product.brand,
          asin: product.asin || undefined,
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
        }

        // Normalize bullet into string array of variations
        const normalizeBullet = (bullet: string[] | Record<string, unknown>): string[] => {
          if (!bullet) return []
          if (Array.isArray(bullet)) return bullet as string[]
          const b = bullet as { seo?: { concise?: string; medium?: string; longer?: string }; benefit?: { concise?: string; medium?: string; longer?: string }; balanced?: { concise?: string; medium?: string; longer?: string } }
          return [
            b.seo?.concise || '', b.seo?.medium || '', b.seo?.longer || '',
            b.benefit?.concise || '', b.benefit?.medium || '', b.benefit?.longer || '',
            b.balanced?.concise || '', b.balanced?.medium || '', b.balanced?.longer || '',
          ]
        }

        let totalTokens = 0
        let modelUsed = ''

        // --- Phase 1: Title ---
        const titleResult = await generateTitlePhase(genInput)
        totalTokens += titleResult.tokensUsed
        modelUsed = titleResult.model
        const confirmedTitle = titleResult.result.titles[0] || ''
        let keywordCov = titleResult.result.keywordCoverage

        // --- Phase 2: Bullets ---
        const bulletsResult = await generateBulletsPhase(genInput, confirmedTitle, keywordCov)
        totalTokens += bulletsResult.tokensUsed
        const confirmedBullets = bulletsResult.result.bullets.map((b) => normalizeBullet(b)[0] || '')
        keywordCov = bulletsResult.result.keywordCoverage

        // --- Phase 3: Description + Search Terms ---
        const descResult = await generateDescriptionPhase(genInput, confirmedTitle, confirmedBullets, keywordCov)
        totalTokens += descResult.tokensUsed
        const confirmedDescription = descResult.result.descriptions[0] || ''
        const confirmedSearchTerms = descResult.result.searchTerms[0] || ''
        keywordCov = descResult.result.keywordCoverage

        // --- Phase 4: Backend ---
        const backendResult = await generateBackendPhase(
          genInput, confirmedTitle, confirmedBullets, confirmedDescription, confirmedSearchTerms, keywordCov
        )
        totalTokens += backendResult.tokensUsed
        keywordCov = backendResult.result.keywordCoverage

        // Insert listing row
        const { data: listing, error: listingError } = await adminClient
          .from('lb_listings')
          .insert({
            product_type_id: productType?.id || null,
            country_id,
            title: confirmedTitle,
            bullet_points: confirmedBullets,
            description: confirmedDescription,
            search_terms: confirmedSearchTerms,
            subject_matter: (backendResult.result.subjectMatter || []).map((s) => s[0] || ''),
            backend_keywords: confirmedSearchTerms,
            planning_matrix: bulletsResult.result.planningMatrix || null,
            backend_attributes: backendResult.result.backendAttributes || null,
            keyword_coverage: keywordCov,
            generation_phase: 'complete',
            status: 'draft',
            generation_context: {
              categoryId: category_id,
              countryId: country_id,
              productName: product.product_name.trim(),
              brand: product.brand,
              asin: product.asin || null,
              attributes: parsedAttributes,
              analysisTypes: analyses.map((a) => a.analysis_type),
            },
            model_used: modelUsed,
            tokens_used: totalTokens,
            created_by: lbUser.id,
            batch_job_id: batchJob.id,
          })
          .select()
          .single()

        if (listingError || !listing) {
          throw new Error(listingError?.message || 'Failed to save listing')
        }

        // Build section rows from all 4 phases
        const sectionRows: Array<{
          listing_id: string
          section_type: string
          variations: string[]
          selected_variation: number
          is_approved: boolean
          final_text: string
        }> = []

        // Title section
        sectionRows.push({
          listing_id: listing.id,
          section_type: 'title',
          variations: titleResult.result.titles,
          selected_variation: 0,
          is_approved: true,
          final_text: confirmedTitle,
        })

        // Bullet sections (5-10 bullets × 3 variations each)
        for (let b = 0; b < bulletsResult.result.bullets.length; b++) {
          sectionRows.push({
            listing_id: listing.id,
            section_type: `bullet_${b + 1}`,
            variations: normalizeBullet(bulletsResult.result.bullets[b]),
            selected_variation: 0,
            is_approved: true,
            final_text: confirmedBullets[b] || '',
          })
        }

        // Description section
        sectionRows.push({
          listing_id: listing.id,
          section_type: 'description',
          variations: descResult.result.descriptions,
          selected_variation: 0,
          is_approved: true,
          final_text: confirmedDescription,
        })

        // Search terms section
        sectionRows.push({
          listing_id: listing.id,
          section_type: 'search_terms',
          variations: descResult.result.searchTerms,
          selected_variation: 0,
          is_approved: true,
          final_text: confirmedSearchTerms,
        })

        // Subject matter section
        const sm = backendResult.result.subjectMatter || []
        sectionRows.push({
          listing_id: listing.id,
          section_type: 'subject_matter',
          variations: [0, 1, 2].map((varIdx) =>
            sm.map((field) => field[varIdx] || '').join('; ')
          ),
          selected_variation: 0,
          is_approved: true,
          final_text: sm.map((field) => field[0] || '').join('; '),
        })

        const { error: sectionsError } = await adminClient
          .from('lb_listing_sections')
          .insert(sectionRows)

        if (sectionsError) {
          // Clean up listing if sections fail
          await adminClient.from('lb_listings').delete().eq('id', listing.id)
          throw new Error('Failed to save listing sections: ' + sectionsError.message)
        }

        // Update batch progress
        await adminClient
          .from('lb_batch_jobs')
          .update({
            completed_listings: i + 1 - failedProducts.length,
            product_type_ids: productTypeIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', batchJob.id)
      } catch (productError) {
        const errorMsg = productError instanceof Error ? productError.message : 'Generation failed'
        console.error(`Batch product ${i + 1} (${product.product_name}) failed:`, errorMsg)
        failedProducts.push({ product_name: product.product_name, error: errorMsg })
      }
    }

    // Finalize batch status
    const successCount = products.length - failedProducts.length
    const finalStatus = successCount === 0 ? 'failed' : 'completed'

    const { data: updatedBatch } = await adminClient
      .from('lb_batch_jobs')
      .update({
        status: finalStatus,
        completed_listings: successCount,
        product_type_ids: productTypeIds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchJob.id)
      .select()
      .single()

    return NextResponse.json(
      {
        data: {
          batch_job: updatedBatch || { ...batchJob, status: finalStatus, completed_listings: successCount },
          failed_products: failedProducts,
        },
      },
      { status: 201 }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Batch creation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
