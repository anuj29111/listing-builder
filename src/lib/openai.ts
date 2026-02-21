import OpenAI, { toFile } from 'openai'
import { createAdminClient } from '@/lib/supabase/server'

async function getApiKey(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .single()
    if (data?.value) return data.value
  } catch {
    // DB lookup failed, fall through to env var
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) return apiKey

  throw new Error('OPENAI_API_KEY not found. Set it in Admin Settings or as an environment variable.')
}

async function getClient(): Promise<OpenAI> {
  const apiKey = await getApiKey()
  return new OpenAI({ apiKey })
}

const DEFAULT_MODEL = 'gpt-image-1.5'
const EDIT_MODEL = 'gpt-image-1' // images.edit() endpoint model

export type OpenAIImageSize = '1024x1024' | '1536x1024' | '1024x1536'
export type OpenAIImageQuality = 'low' | 'medium' | 'high'

export interface ReferenceImage {
  buffer: Buffer
  mimeType: string
}

export interface OpenAIGenerateInput {
  prompt: string
  size?: OpenAIImageSize
  quality?: OpenAIImageQuality
  referenceImages?: ReferenceImage[]
}

export interface OpenAIGenerateResult {
  base64Data: string
}

const ORIENTATION_TO_SIZE: Record<string, OpenAIImageSize> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
}

export function orientationToSize(orientation: string): OpenAIImageSize {
  return ORIENTATION_TO_SIZE[orientation] || '1024x1024'
}

export async function generateOpenAIImage(input: OpenAIGenerateInput): Promise<OpenAIGenerateResult> {
  const client = await getClient()

  // When reference images are provided, use images.edit() so the AI sees the actual product
  if (input.referenceImages && input.referenceImages.length > 0) {
    const imageFiles = await Promise.all(
      input.referenceImages.map(async (img, i) => {
        const ext = img.mimeType.includes('png') ? 'png' : img.mimeType.includes('webp') ? 'webp' : 'jpg'
        return toFile(img.buffer, `reference-${i}.${ext}`, { type: img.mimeType })
      })
    )

    const editPrompt = `CRITICAL: The attached reference photos show the REAL product. You MUST recreate this exact product — same colors, same packaging, same labels, same design, same branding, same shape. Do NOT invent or change any visual detail. The output image must look like a professional photograph of THIS specific product, not a generic or imagined version. Match the product exactly as shown in the reference photos, then apply the following photography direction:\n\n${input.prompt}`

    const response = await client.images.edit({
      model: EDIT_MODEL,
      image: imageFiles,
      prompt: editPrompt,
      n: 1,
      size: input.size || '1024x1024',
      quality: input.quality || 'medium',
    })

    const image = response.data?.[0]
    if (!image || !image.b64_json) {
      throw new Error('GPT Image edit returned no image data')
    }

    return { base64Data: image.b64_json }
  }

  // Standard text-only generation (no reference images)
  const response = await client.images.generate({
    model: DEFAULT_MODEL,
    prompt: input.prompt,
    n: 1,
    size: input.size || '1024x1024',
    quality: input.quality || 'medium',
    response_format: 'b64_json',
  })

  const image = response.data?.[0]
  if (!image || !image.b64_json) {
    throw new Error('GPT Image returned no image data')
  }

  return {
    base64Data: image.b64_json,
  }
}

export function estimateOpenAICost(count: number, quality: OpenAIImageQuality = 'medium'): number {
  // Approximate costs in cents: low ~1c, medium ~3c, high ~8c
  const costMap: Record<OpenAIImageQuality, number> = { low: 1, medium: 3, high: 8 }
  return count * costMap[quality]
}
