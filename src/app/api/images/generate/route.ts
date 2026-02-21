import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateAndStoreImage } from '@/lib/image-generation'
import type { GenerateImageRequest } from '@/types/api'

// Allow up to 5 minutes for image generation via OpenAI/Gemini/Higgsfield
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateImageRequest

    const { prompt, provider, model_id, orientation, listing_id, position, hf_model, hf_aspect_ratio, hf_resolution } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return NextResponse.json({ error: 'Prompt must be at least 5 characters' }, { status: 400 })
    }
    if (!provider || !['openai', 'gemini', 'higgsfield'].includes(provider)) {
      return NextResponse.json({ error: 'Provider must be openai, gemini, or higgsfield' }, { status: 400 })
    }

    const image = await generateAndStoreImage({
      prompt: prompt.trim(),
      provider,
      orientation: orientation || 'square',
      modelId: model_id,
      listingId: listing_id,
      createdBy: lbUser.id,
      adminClient,
      hfModel: hf_model,
      hfAspectRatio: hf_aspect_ratio,
      hfResolution: hf_resolution,
    })

    return NextResponse.json({
      data: {
        image,
        position: position || null,
      },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Image generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
