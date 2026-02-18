import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateSwatchPrompts } from '@/lib/claude'
import type { GenerateSwatchPromptsRequest } from '@/types/api'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateSwatchPromptsRequest

    const { product_name, brand, category_id, country_id, listing_id, variants } = body

    if (!product_name || !brand || !category_id || !country_id) {
      return NextResponse.json(
        { error: 'product_name, brand, category_id, and country_id are required' },
        { status: 400 }
      )
    }

    if (!variants || variants.length === 0) {
      return NextResponse.json(
        { error: 'At least one variant is required' },
        { status: 400 }
      )
    }

    const validVariants = variants.filter((v) => v.name?.trim())
    if (validVariants.length === 0) {
      return NextResponse.json(
        { error: 'At least one variant must have a name' },
        { status: 400 }
      )
    }

    // Fetch category name
    const { data: category, error: catError } = await supabase
      .from('lb_categories')
      .select('id, name, brand')
      .eq('id', category_id)
      .single()

    if (catError || !category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const { result } = await generateSwatchPrompts({
      productName: product_name,
      brand,
      categoryName: category.name,
      variants: validVariants,
    })

    // Create workshop record with prompts persisted
    const workshopName = `${brand} ${product_name} — Swatches — ${new Date().toLocaleDateString()}`
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
        image_type: 'swatch',
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
    console.error('Swatch prompts error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
