import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import type { UpdateWorkshopRequest } from '@/types/api'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: workshop, error } = await supabase
      .from('lb_image_workshops')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !workshop) {
      return NextResponse.json({ error: 'Workshop not found' }, { status: 404 })
    }

    // Also fetch workshop images
    const { data: images } = await supabase
      .from('lb_image_generations')
      .select('*')
      .eq('workshop_id', params.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      data: { workshop, images: images || [] },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as UpdateWorkshopRequest

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.step !== undefined) updates.step = body.step
    if (body.element_tags !== undefined) updates.element_tags = body.element_tags
    if (body.final_image_id !== undefined) updates.final_image_id = body.final_image_id
    if (body.callout_texts !== undefined) updates.callout_texts = body.callout_texts
    if (body.competitor_urls !== undefined) updates.competitor_urls = body.competitor_urls
    if (body.generated_prompts !== undefined) updates.generated_prompts = body.generated_prompts
    if (body.selected_prompt_indices !== undefined) updates.selected_prompt_indices = body.selected_prompt_indices
    if (body.provider !== undefined) updates.provider = body.provider
    if (body.orientation !== undefined) updates.orientation = body.orientation
    if (body.creative_brief !== undefined) updates.creative_brief = body.creative_brief
    if (body.product_photos !== undefined) updates.product_photos = body.product_photos
    if (body.product_photo_descriptions !== undefined) updates.product_photo_descriptions = body.product_photo_descriptions

    const { data: workshop, error } = await adminClient
      .from('lb_image_workshops')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error || !workshop) {
      return NextResponse.json({ error: error?.message || 'Workshop not found' }, { status: 404 })
    }

    return NextResponse.json({ data: { workshop } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from('lb_image_workshops')
      .delete()
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: { success: true } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
