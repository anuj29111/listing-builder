import { NextResponse } from 'next/server'

/**
 * Shared CORS headers for Rufus extension endpoints.
 * The Chrome extension calls these endpoints from any Amazon domain,
 * and the listing-builder UI calls them from its own origin.
 */
export const RUFUS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function corsJson(body: object, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: RUFUS_CORS_HEADERS })
}

export function corsOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: RUFUS_CORS_HEADERS })
}

/**
 * Validate the Rufus extension API key from the Authorization header.
 * Key is stored in lb_admin_settings.rufus_extension_api_key.
 */
export async function validateExtensionKey(
  request: Request,
  adminClient: { from: (t: string) => unknown }
): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const providedKey = authHeader.slice(7).trim()
  if (!providedKey) return false

  const builder = adminClient.from('lb_admin_settings') as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: { value: string } | null }>
      }
    }
  }
  const { data } = await builder
    .select('value')
    .eq('key', 'rufus_extension_api_key')
    .single()

  if (!data?.value) return false
  return data.value === providedKey
}
