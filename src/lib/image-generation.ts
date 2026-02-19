import { SupabaseClient } from '@supabase/supabase-js'
import { generateOpenAIImage, orientationToSize } from '@/lib/openai'
import { generateGeminiImage, orientationToAspect } from '@/lib/gemini'
import type { LbImageGeneration, HfModel } from '@/types/database'

export interface GenerateAndStoreParams {
  prompt: string
  provider: 'openai' | 'gemini' | 'higgsfield'
  orientation: 'square' | 'portrait' | 'landscape'
  modelId?: string
  listingId?: string | null
  workshopId?: string | null
  imageType?: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'
  position?: number | null
  createdBy: string
  adminClient: SupabaseClient
  // Higgsfield-specific
  hfModel?: HfModel
  hfAspectRatio?: string
  hfResolution?: string
}

/**
 * Generate an image via the selected provider, upload to Supabase Storage,
 * and insert a record into lb_image_generations.
 *
 * For Higgsfield: inserts into hf_prompt_queue instead of calling the API directly.
 * The Python push_prompts.py script handles actual submission to Higgsfield's internal API.
 */
export async function generateAndStoreImage(
  params: GenerateAndStoreParams
): Promise<LbImageGeneration> {
  const { prompt, provider, orientation, modelId, listingId, workshopId, imageType, position, createdBy, adminClient } = params

  let previewUrl: string | null = null
  let storagePath: string | null = null
  let costCents = 0

  if (provider === 'openai') {
    const result = await generateOpenAIImage({
      prompt: prompt.trim(),
      size: orientationToSize(orientation),
      quality: 'medium',
    })

    const imageBuffer = Buffer.from(result.base64Data, 'base64')
    const fileName = `openai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

    const { error: uploadError } = await adminClient.storage
      .from('lb-images')
      .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
    previewUrl = publicUrl.publicUrl
    storagePath = fileName
    costCents = 3
  } else if (provider === 'gemini') {
    const result = await generateGeminiImage({
      prompt: prompt.trim(),
      aspectRatio: orientationToAspect(orientation),
      modelId: modelId || undefined,
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
    costCents = modelId === 'gemini-3-pro-image-preview' ? 4 : 2
  } else {
    // Higgsfield: queue-based flow via hf_prompt_queue
    // Inserts into queue → Supabase Edge Function auto-submits to Higgsfield's internal API.
    // modelId comes from the provider bar (e.g. 'nano-banana-pro', 'seedream', etc.)
    const hfModel = (params.modelId as HfModel) || params.hfModel || 'nano-banana-pro'
    const hfAspectRatio = params.hfAspectRatio || '1:1'
    const hfResolution = params.hfResolution || '2k'

    const { data: queueItem, error: queueError } = await adminClient
      .from('hf_prompt_queue')
      .insert({
        prompt: prompt.trim(),
        model: hfModel,
        settings: {
          aspect_ratio: hfAspectRatio,
          resolution: hfResolution,
        },
        status: 'pending',
        source: 'listing-builder',
        listing_id: listingId || null,
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (queueError || !queueItem) {
      throw new Error(`Failed to queue Higgsfield prompt: ${queueError?.message || 'Unknown error'}`)
    }

    // Insert image record with no preview yet — it will be updated when the prompt is processed
    const { data: image, error: insertError } = await adminClient
      .from('lb_image_generations')
      .insert({
        listing_id: listingId || null,
        workshop_id: workshopId || null,
        prompt: prompt.trim(),
        provider: 'higgsfield',
        preview_url: null,
        full_url: null,
        status: 'preview',
        cost_cents: 0,
        image_type: imageType || 'main',
        position: position ?? null,
        created_by: createdBy,
      })
      .select()
      .single()

    if (insertError || !image) {
      throw new Error(insertError?.message || 'Failed to save image record')
    }

    return image as LbImageGeneration
  }

  // OpenAI / Gemini: image is ready immediately
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
      image_type: imageType || 'main',
      position: position ?? null,
      created_by: createdBy,
    })
    .select()
    .single()

  if (insertError || !image) {
    if (storagePath) {
      await adminClient.storage.from('lb-images').remove([storagePath])
    }
    throw new Error(insertError?.message || 'Failed to save image record')
  }

  return image as LbImageGeneration
}
