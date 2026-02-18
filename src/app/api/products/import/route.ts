import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

interface ProductRow {
  asin: string
  product_name: string
  parent_name: string | null
  parent_asin: string | null
  category: string
  brand: string | null
}

/**
 * Find a column value case-insensitively from a row object.
 */
function getCol(row: Record<string, unknown>, target: string): string {
  const key = Object.keys(row).find(
    (k) => k.toLowerCase().trim() === target.toLowerCase()
  )
  if (!key) return ''
  const val = row[key]
  return val != null ? String(val).trim() : ''
}

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let rawRows: Record<string, unknown>[]

    const isXlsx =
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isXlsx) {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      })
    } else {
      // CSV — use Papa parse
      const Papa = await import('papaparse')
      const text = buffer.toString('utf-8').replace(/^\uFEFF/, '') // strip BOM
      const parsed = Papa.default.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
      })
      rawRows = parsed.data
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 })
    }

    // Map to product rows
    const products: ProductRow[] = []
    const skipped: string[] = []

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      const asin = getCol(row, 'asin')
      const productName = getCol(row, 'product name')
      const category = getCol(row, 'category')

      if (!asin || !productName || !category) {
        skipped.push(`Row ${i + 2}: missing ASIN, Product Name, or Category`)
        continue
      }

      products.push({
        asin,
        product_name: productName,
        parent_name: getCol(row, 'parent name') || null,
        parent_asin: getCol(row, 'parent asin') || null,
        category,
        brand: getCol(row, 'brand') || null,
      })
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Check column headers: ASIN, Product Name, Category' },
        { status: 400 }
      )
    }

    // Upsert in batches of 100
    const BATCH_SIZE = 100
    let imported = 0
    const errors: string[] = []

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE).map((p) => ({
        ...p,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('lb_products')
        .upsert(batch, { onConflict: 'asin' })

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        imported += batch.length
      }
    }

    return NextResponse.json({
      imported,
      skipped: skipped.length,
      errors,
      skippedDetails: skipped.slice(0, 10),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
