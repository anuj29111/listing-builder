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

export type DalleSize = '1024x1024' | '1792x1024' | '1024x1792'
export type DalleQuality = 'standard' | 'hd'

export interface DalleGenerateInput {
  prompt: string
  size?: DalleSize
  quality?: DalleQuality
}

export interface DalleGenerateResult {
  url: string
  revisedPrompt: string
}

const ORIENTATION_TO_SIZE: Record<string, DalleSize> = {
  square: '1024x1024',
  landscape: '1792x1024',
  portrait: '1024x1792',
}

export function orientationToSize(orientation: string): DalleSize {
  return ORIENTATION_TO_SIZE[orientation] || '1024x1024'
}

export async function generateDalleImage(input: DalleGenerateInput): Promise<DalleGenerateResult> {
  const client = await getClient()

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: input.prompt,
    n: 1,
    size: input.size || '1024x1024',
    quality: input.quality || 'standard',
    response_format: 'url',
  })

  const image = response.data?.[0]
  if (!image || !image.url) {
    throw new Error('DALL-E 3 returned no image')
  }

  return {
    url: image.url,
    revisedPrompt: image.revised_prompt || input.prompt,
  }
}

export function estimateDalleCost(count: number, quality: DalleQuality = 'standard'): number {
  const costPerImage = quality === 'hd' ? 8 : 4
  return count * costPerImage
}
