import { GoogleGenerativeAI } from '@google/generative-ai'
import { createAdminClient } from '@/lib/supabase/server'

const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview'

async function getApiKey(): Promise<string> {
  try {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'google_ai_api_key')
      .single()
    if (data?.value) return data.value
  } catch {
    // DB lookup failed, fall through to env var
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (apiKey) return apiKey

  throw new Error('GOOGLE_AI_API_KEY not found. Set it in Admin Settings or as an environment variable.')
}

async function getClient(): Promise<GoogleGenerativeAI> {
  const apiKey = await getApiKey()
  return new GoogleGenerativeAI(apiKey)
}

export type GeminiAspectRatio = '1:1' | '9:16' | '16:9'

export interface GeminiGenerateInput {
  prompt: string
  aspectRatio?: GeminiAspectRatio
  modelId?: string
}

export interface GeminiGenerateResult {
  base64Data: string
  mimeType: string
}

const ORIENTATION_TO_ASPECT: Record<string, GeminiAspectRatio> = {
  square: '1:1',
  portrait: '9:16',
  landscape: '16:9',
}

export function orientationToAspect(orientation: string): GeminiAspectRatio {
  return ORIENTATION_TO_ASPECT[orientation] || '1:1'
}

export async function generateGeminiImage(input: GeminiGenerateInput): Promise<GeminiGenerateResult> {
  const genAI = await getClient()

  const model = genAI.getGenerativeModel({
    model: input.modelId || DEFAULT_IMAGE_MODEL,
    generationConfig: {
      // @ts-expect-error — Gemini image generation uses responseModalities
      responseModalities: ['image', 'text'],
    },
  })

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `Generate a product image: ${input.prompt}` }],
    }],
  })

  const response = result.response
  const candidates = response.candidates

  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates')
  }

  for (const part of candidates[0].content.parts) {
    if (part.inlineData) {
      return {
        base64Data: part.inlineData.data as string,
        mimeType: part.inlineData.mimeType as string,
      }
    }
  }

  throw new Error('Gemini returned no image data. The model may not support image generation with this configuration.')
}

export function estimateGeminiCost(count: number): number {
  return count * 2
}
