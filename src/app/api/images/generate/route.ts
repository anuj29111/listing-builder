import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateAndStoreImage } from '@/lib/image-generation'
import type { GenerateImageRequest } from '@/types/api'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as GenerateImageRequest

    const { prompt, provider, model_id, orientation, listing_id, position } = body

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
