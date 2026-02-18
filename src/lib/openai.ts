import OpenAI from 'openai'
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

export type OpenAIImageSize = '1024x1024' | '1536x1024' | '1024x1536'
export type OpenAIImageQuality = 'low' | 'medium' | 'high'

export interface OpenAIGenerateInput {
  prompt: string
  size?: OpenAIImageSize
  quality?: OpenAIImageQuality
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
