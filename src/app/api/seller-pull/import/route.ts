import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

interface ImportProduct {
  asin: string
  title: string
  brand?: string
  parent_asin?: string
  category?: string
}

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { products, default_category } = body as {
      products: ImportProduct[]
      default_category?: string
    }

    if (!products?.length) {
      return NextResponse.json({ error: 'No products to import' }, { status: 400 })
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)

      const records = batch
        .filter((p) => p.asin?.trim())
        .map((p) => ({
          asin: p.asin.trim().toUpperCase(),
          product_name: p.title || p.asin,
          parent_asin: p.parent_asin || null,
          parent_name: null,
          category: p.category || default_category || 'Uncategorized',
          brand: p.brand || null,
        }))

      if (records.length === 0) continue

      const { data, error } = await supabase
        .from('lb_products')
        .upsert(records, { onConflict: 'asin' })
        .select('id')

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
        skipped += records.length
      } else {
        imported += data?.length || records.length
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors,
      total: products.length,
    })
  } catch (err) {
    console.error('Seller pull import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
