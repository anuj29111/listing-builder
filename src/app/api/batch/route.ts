import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateListing,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import { SECTION_TYPES } from '@/lib/constants'
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

        // Generate listing via Claude
        const { result, model, tokensUsed } = await generateListing({
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
        })

        // Flatten bullet object into 9-element array
        const flattenBullet = (bullet: typeof result.bullets[0]): string[] => {
          if (!bullet) return []
          if (Array.isArray(bullet)) return bullet as unknown as string[]
          return [
            bullet.seo?.concise || '', bullet.seo?.medium || '', bullet.seo?.longer || '',
            bullet.benefit?.concise || '', bullet.benefit?.medium || '', bullet.benefit?.longer || '',
            bullet.balanced?.concise || '', bullet.balanced?.medium || '', bullet.balanced?.longer || '',
          ]
        }

        // Insert listing row
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
            model_used: model,
            tokens_used: tokensUsed,
            created_by: lbUser.id,
            batch_job_id: batchJob.id,
          })
          .select()
          .single()

        if (listingError || !listing) {
          throw new Error(listingError?.message || 'Failed to save listing')
        }

        // Insert listing sections
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
          } else if (sectionType === 'backend_attributes') {
            const attrs = result.backendAttributes || {}
            const formatted = Object.entries(attrs)
              .map(([key, values]) => `${key.replace(/_/g, ' ')}: ${(values || []).join(', ')}`)
              .join('\n')
            variations = [formatted]
          }

          return {
            listing_id: listing.id,
            section_type: sectionType,
            variations,
            selected_variation: 0,
            is_approved: false,
          }
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
