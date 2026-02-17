import { SupabaseClient } from '@supabase/supabase-js'
import { generateDalleImage, orientationToSize } from '@/lib/openai'
import { generateGeminiImage, orientationToAspect } from '@/lib/gemini'
import { generateHiggsFieldImage, orientationToHiggsfield } from '@/lib/higgsfield'
import type { LbImageGeneration } from '@/types/database'

export interface GenerateAndStoreParams {
  prompt: string
  provider: 'dalle3' | 'gemini' | 'higgsfield'
  orientation: 'square' | 'portrait' | 'landscape'
  modelId?: string
  listingId?: string | null
  workshopId?: string | null
  createdBy: string
  adminClient: SupabaseClient
}

/**
 * Generate an image via the selected provider, upload to Supabase Storage,
 * and insert a record into lb_image_generations.
 * Shared by single-generate and batch-generate routes.
 */
export async function generateAndStoreImage(
  params: GenerateAndStoreParams
): Promise<LbImageGeneration> {
  const { prompt, provider, orientation, modelId, listingId, workshopId, createdBy, adminClient } = params

  let previewUrl: string
  let storagePath: string
  let costCents = 0

  if (provider === 'dalle3') {
    const result = await generateDalleImage({
      prompt: prompt.trim(),
      size: orientationToSize(orientation),
      quality: 'standard',
    })

    const imageResponse = await fetch(result.url)
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const fileName = `dalle3/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

    const { error: uploadError } = await adminClient.storage
      .from('lb-images')
      .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
    previewUrl = publicUrl.publicUrl
    storagePath = fileName
    costCents = 4
  } else if (provider === 'gemini') {
    const result = await generateGeminiImage({
      prompt: prompt.trim(),
      aspectRatio: orientationToAspect(orientation),
    })

    const imageBuffer = Buffer.from(result.base64Data, 'base64')
    const ext = result.mimeType.includes('png') ? 'png' : 'webp'
    const fileName = `gemini/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await adminClient.storage
      .from('lb-images')
      .upload(fileName, imageBuffer, { contentType: result.mimeType, upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
    previewUrl = publicUrl.publicUrl
    storagePath = fileName
    costCents = 2
  } else {
    const result = await generateHiggsFieldImage({
      prompt: prompt.trim(),
      modelId: modelId || undefined,
      aspectRatio: orientationToHiggsfield(orientation),
    })

    const imageResponse = await fetch(result.url)
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const contentType = imageResponse.headers.get('content-type') || 'image/png'
    const ext = contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
    const fileName = `higgsfield/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await adminClient.storage
      .from('lb-images')
      .upload(fileName, imageBuffer, { contentType, upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
    previewUrl = publicUrl.publicUrl
    storagePath = fileName
    costCents = 0
  }

  const { data: image, error: insertError } = await adminClient
    .from('lb_image_generations')
    .insert({
      listing_id: listingId || null,
      workshop_id: workshopId || null,
      prompt: prompt.trim(),
      provider,
      preview_url: previewUrl,
      full_url: null,
      status: 'preview',
      cost_cents: costCents,
      created_by: createdBy,
    })
    .select()
    .single()

  if (insertError || !image) {
    await adminClient.storage.from('lb-images').remove([storagePath])
    throw new Error(insertError?.message || 'Failed to save image record')
  }

  return image as LbImageGeneration
}
