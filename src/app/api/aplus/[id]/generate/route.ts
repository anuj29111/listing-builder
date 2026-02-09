import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateAPlusContent } from '@/lib/claude'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { product_name, brand, category_name, category_id, country_id } = body as {
      product_name: string
      brand: string
      category_name: string
      category_id?: string
      country_id?: string
    }

    if (!product_name || !brand) {
      return NextResponse.json({ error: 'product_name and brand are required' }, { status: 400 })
    }

    // Fetch the module
    const { data: module, error: modError } = await supabase
      .from('lb_aplus_modules')
      .select('*')
      .eq('id', params.id)
      .single()

    if (modError || !module) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }

    // Fetch research analysis if category/country provided
    let researchContext = ''
    if (category_id && country_id) {
      const { data: analyses } = await supabase
        .from('lb_research_analysis')
        .select('analysis_type, analysis_result')
        .eq('category_id', category_id)
        .eq('country_id', country_id)
        .eq('status', 'completed')

      if (analyses && analyses.length > 0) {
        const summaries = analyses.map((a) => {
          const result = a.analysis_result as Record<string, unknown>
          return `${a.analysis_type}: ${JSON.stringify(result).slice(0, 1000)}`
        })
        researchContext = summaries.join('\n\n')
      }
    }

    // Generate A+ content via Claude
    const { content, tokensUsed } = await generateAPlusContent({
      templateType: module.template_type,
      productName: product_name,
      brand,
      categoryName: category_name || 'General',
      researchContext,
    })

    // Update the module with generated content
    const { data: updated, error: updateError } = await adminClient
      .from('lb_aplus_modules')
      .update({
        content,
        title: module.title || `${brand} ${product_name} — ${module.template_type.replace(/_/g, ' ')}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update module' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        module: updated,
        tokens_used: tokensUsed,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('A+ content generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
