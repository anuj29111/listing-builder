import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateDalleImage, orientationToSize } from '@/lib/openai'
import { generateGeminiImage, orientationToAspect } from '@/lib/gemini'
import { generateHiggsFieldImage, orientationToHiggsfield } from '@/lib/higgsfield'
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
    if (!provider || !['dalle3', 'gemini', 'higgsfield'].includes(provider)) {
      return NextResponse.json({ error: 'Provider must be dalle3, gemini, or higgsfield' }, { status: 400 })
    }

    const validOrientation = orientation || 'square'
    let previewUrl: string
    let storagePath: string
    let costCents = 0

    if (provider === 'dalle3') {
      const result = await generateDalleImage({
        prompt: prompt.trim(),
        size: orientationToSize(validOrientation),
        quality: 'standard',
      })

      // Download image from DALL-E URL and upload to Supabase Storage
      const imageResponse = await fetch(result.url)
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
      const fileName = `dalle3/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      const { data: publicUrl } = adminClient.storage
        .from('lb-images')
        .getPublicUrl(fileName)

      previewUrl = publicUrl.publicUrl
      storagePath = fileName
      costCents = 4
    } else if (provider === 'gemini') {
      const result = await generateGeminiImage({
        prompt: prompt.trim(),
        aspectRatio: orientationToAspect(validOrientation),
      })

      // Upload base64 data to Supabase Storage
      const imageBuffer = Buffer.from(result.base64Data, 'base64')
      const ext = result.mimeType.includes('png') ? 'png' : 'webp'
      const fileName = `gemini/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, imageBuffer, {
          contentType: result.mimeType,
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      const { data: publicUrl } = adminClient.storage
        .from('lb-images')
        .getPublicUrl(fileName)

      previewUrl = publicUrl.publicUrl
      storagePath = fileName
      costCents = 2
    } else {
      // Higgsfield
      const result = await generateHiggsFieldImage({
        prompt: prompt.trim(),
        modelId: model_id || undefined,
        aspectRatio: orientationToHiggsfield(validOrientation),
      })

      // Download image from Higgsfield URL and upload to Supabase Storage
      const imageResponse = await fetch(result.url)
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
      const contentType = imageResponse.headers.get('content-type') || 'image/png'
      const ext = contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
      const fileName = `higgsfield/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, imageBuffer, {
          contentType,
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      const { data: publicUrl } = adminClient.storage
        .from('lb-images')
        .getPublicUrl(fileName)

      previewUrl = publicUrl.publicUrl
      storagePath = fileName
      costCents = 0 // Pricing TBD
    }

    // Insert record into lb_image_generations
    const { data: image, error: insertError } = await adminClient
      .from('lb_image_generations')
      .insert({
        listing_id: listing_id || null,
        prompt: prompt.trim(),
        provider,
        preview_url: previewUrl,
        full_url: null,
        status: 'preview',
        cost_cents: costCents,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (insertError || !image) {
      // Clean up storage on DB failure
      await adminClient.storage.from('lb-images').remove([storagePath])
      throw new Error(insertError?.message || 'Failed to save image record')
    }

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
