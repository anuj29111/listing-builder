import { createAdminClient } from '@/lib/supabase/server'

interface OxylabsCredentials {
  username: string
  password: string
}

async function getCredentials(): Promise<OxylabsCredentials> {
  try {
    const adminClient = createAdminClient()
    const [usernameResult, passwordResult] = await Promise.all([
      adminClient
        .from('lb_admin_settings')
        .select('value')
        .eq('key', 'oxylabs_username')
        .single(),
      adminClient
        .from('lb_admin_settings')
        .select('value')
        .eq('key', 'oxylabs_password')
        .single(),
    ])

    if (usernameResult.data?.value && passwordResult.data?.value) {
      return {
        username: usernameResult.data.value,
        password: passwordResult.data.value,
      }
    }
  } catch {
    // DB lookup failed, fall through to env vars
  }

  const username = process.env.OXYLABS_USERNAME
  const password = process.env.OXYLABS_PASSWORD

  if (!username || !password) {
    throw new Error(
      'Oxylabs credentials not found. Set them in Admin Settings or as environment variables (OXYLABS_USERNAME, OXYLABS_PASSWORD).'
    )
  }

  return { username, password }
}

export interface OxylabsProductResult {
  url: string
  title: string
  manufacturer: string
  description: string
  bullet_points: string
  rating: number
  price: number
  price_initial: number
  price_buybox: number
  currency: string
  stock: string
  reviews_count: number
  images: string[]
  category: Array<{ ladder: Array<{ url: string; name: string }> }>
  variation: unknown[]
  featured_merchant: Record<string, unknown>
  sales_rank: Array<{ rank: number; ladder: Array<{ url: string; name: string }> }>
  is_prime_eligible: boolean
  [key: string]: unknown
}

export async function lookupAsin(
  asin: string,
  domain: string
): Promise<{ success: boolean; data?: OxylabsProductResult; error?: string }> {
  const { username, password } = await getCredentials()

  const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    },
    body: JSON.stringify({
      source: 'amazon_product',
      domain,
      query: asin,
      parse: true,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return {
      success: false,
      error: `Oxylabs API error (${response.status}): ${text}`,
    }
  }

  const json = await response.json()

  // Oxylabs returns { results: [{ content: { ... } }] }
  const content = json.results?.[0]?.content
  if (!content) {
    return { success: false, error: 'No results returned from Oxylabs' }
  }

  return { success: true, data: content as OxylabsProductResult }
}
