import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

// GET /api/products/check-asins?asins=B08N5WRWNW,B09V3KXJPB
// Returns which of the given ASINs exist in lb_products (i.e. are "own products")
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    const asinsParam = searchParams.get('asins')
    if (!asinsParam) {
      return NextResponse.json({ data: {} })
    }

    const asins = asinsParam.split(',').map((a) => a.trim().toUpperCase()).filter(Boolean)
    if (asins.length === 0) {
      return NextResponse.json({ data: {} })
    }

    const { data, error } = await supabase
      .from('lb_products')
      .select('asin')
      .in('asin', asins)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return a Set-like object: { "B08N5WRWNW": true, ... }
    const ownAsins: Record<string, boolean> = {}
    for (const row of data || []) {
      if (row.asin) {
        ownAsins[row.asin] = true
      }
    }

    return NextResponse.json({ data: ownAsins })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
