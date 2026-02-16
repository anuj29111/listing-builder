import { createAdminClient } from '@/lib/supabase/server'

const PLATFORM_BASE = 'https://platform.higgsfield.ai'
const DEFAULT_MODEL = 'higgsfield-ai/soul/standard'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_TIMEOUT_MS = 120000

// --- Credentials ---

interface HiggsFieldCredentials {
  apiKey: string
  apiSecret: string
}

async function getCredentials(): Promise<HiggsFieldCredentials> {
  try {
    const adminClient = createAdminClient()
    const { data: keyRow } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'higgsfield_api_key')
      .single()
    const { data: secretRow } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'higgsfield_api_secret')
      .single()

    if (keyRow?.value && secretRow?.value) {
      return { apiKey: keyRow.value, apiSecret: secretRow.value }
    }
  } catch {
    // DB lookup failed, fall through to env vars
  }

  // Try combined key format: "key:secret"
  const combined = process.env.HF_KEY
  if (combined && combined.includes(':')) {
    const [apiKey, apiSecret] = combined.split(':')
    return { apiKey, apiSecret }
  }

  // Try separate env vars
  const apiKey = process.env.HIGGSFIELD_API_KEY
  const apiSecret = process.env.HIGGSFIELD_API_SECRET
  if (apiKey && apiSecret) {
    return { apiKey, apiSecret }
  }

  throw new Error(
    'Higgsfield API credentials not found. Set higgsfield_api_key and higgsfield_api_secret in Admin Settings, or set HF_KEY (key:secret) as an environment variable.'
  )
}

function authHeader(creds: HiggsFieldCredentials): string {
  return `Key ${creds.apiKey}:${creds.apiSecret}`
}

// --- Types ---

export interface HiggsFieldGenerateInput {
  prompt: string
  modelId?: string
  aspectRatio?: string // e.g. "1:1", "16:9", "9:16"
  resolution?: string  // e.g. "1K", "2K"
}

export interface HiggsFieldGenerateResult {
  url: string
  requestId: string
}

type HiggsFieldStatus = 'Queued' | 'InProgress' | 'Completed' | 'Failed' | 'NSFW' | 'Cancelled'

interface SubmitResponse {
  request_id: string
}

interface StatusResponse {
  status: HiggsFieldStatus
  output?: {
    url?: string
    images?: Array<{ url: string }>
  }
  error?: string
}

// --- Orientation mapping ---

const ORIENTATION_TO_ASPECT: Record<string, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
}

export function orientationToHiggsfield(orientation: string): string {
  return ORIENTATION_TO_ASPECT[orientation] || '1:1'
}

// --- Core functions ---

async function submitRequest(
  creds: HiggsFieldCredentials,
  modelId: string,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${PLATFORM_BASE}/${modelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(creds),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error')
    throw new Error(`Higgsfield submit failed (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as SubmitResponse
  if (!data.request_id) {
    throw new Error('Higgsfield submit did not return a request_id')
  }

  return data.request_id
}

async function pollUntilDone(
  creds: HiggsFieldCredentials,
  requestId: string
): Promise<StatusResponse> {
  const start = Date.now()

  while (Date.now() - start < MAX_POLL_TIMEOUT_MS) {
    const res = await fetch(`${PLATFORM_BASE}/requests/${requestId}/status`, {
      headers: {
        Authorization: authHeader(creds),
      },
    })

    if (!res.ok) {
      throw new Error(`Higgsfield status check failed (${res.status})`)
    }

    const data = (await res.json()) as StatusResponse

    switch (data.status) {
      case 'Completed':
        return data
      case 'Failed':
        throw new Error(`Higgsfield generation failed: ${data.error || 'Unknown reason'}`)
      case 'NSFW':
        throw new Error('Higgsfield flagged the image as NSFW. Please modify your prompt.')
      case 'Cancelled':
        throw new Error('Higgsfield request was cancelled')
      case 'Queued':
      case 'InProgress':
        // Keep polling
        break
      default:
        // Unknown status — keep polling
        break
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`Higgsfield generation timed out after ${MAX_POLL_TIMEOUT_MS / 1000}s`)
}

function extractImageUrl(response: StatusResponse): string {
  // Try output.url first
  if (response.output?.url) {
    return response.output.url
  }
  // Try output.images array
  if (response.output?.images && response.output.images.length > 0 && response.output.images[0].url) {
    return response.output.images[0].url
  }
  throw new Error('Higgsfield returned no image URL in the completed response')
}

// --- Public API ---

export async function generateHiggsFieldImage(
  input: HiggsFieldGenerateInput
): Promise<HiggsFieldGenerateResult> {
  const creds = await getCredentials()
  const modelId = input.modelId || DEFAULT_MODEL

  const requestBody: Record<string, unknown> = {
    prompt: input.prompt,
  }

  if (input.aspectRatio) {
    requestBody.aspect_ratio = input.aspectRatio
  }

  if (input.resolution) {
    requestBody.resolution = input.resolution
  }

  const requestId = await submitRequest(creds, modelId, requestBody)
  const result = await pollUntilDone(creds, requestId)
  const url = extractImageUrl(result)

  return { url, requestId }
}

export function estimateHiggsfieldCost(_count: number): number {
  // Pricing TBD — returning 0 for now until user sets it up
  return 0
}
