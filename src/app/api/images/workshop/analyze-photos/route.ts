import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeProductPhotos } from '@/lib/claude'
import type { AnalyzeProductPhotosRequest } from '@/types/api'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as AnalyzeProductPhotosRequest

    const { workshop_id, photo_urls } = body

    if (!workshop_id || !photo_urls || photo_urls.length === 0) {
      return NextResponse.json(
        { error: 'workshop_id and photo_urls are required' },
        { status: 400 }
      )
    }

    // Fetch workshop to get product info
    const { data: workshop, error: fetchError } = await adminClient
      .from('lb_image_workshops')
      .select('product_name, brand')
      .eq('id', workshop_id)
      .single()

    if (fetchError || !workshop) {
      return NextResponse.json({ error: 'Workshop not found' }, { status: 404 })
    }

    // Analyze photos with Claude vision
    const { descriptions, model, tokensUsed } = await analyzeProductPhotos({
      photoUrls: photo_urls,
      productName: workshop.product_name,
      brand: workshop.brand,
    })

    // Save descriptions to workshop
    const { error: updateError } = await adminClient
      .from('lb_image_workshops')
      .update({
        product_photo_descriptions: descriptions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workshop_id)

    if (updateError) {
      console.error('Failed to save photo descriptions:', updateError)
    }

    return NextResponse.json({
      data: {
        descriptions,
        model,
        tokensUsed,
      },
    }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Analyze photos error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
