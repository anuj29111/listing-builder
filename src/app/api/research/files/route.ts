import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { FILE_TYPES } from '@/lib/constants'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { searchParams } = new URL(request.url)

    let query = supabase
      .from('lb_research_files')
      .select(
        '*, category:lb_categories(name, slug, brand), country:lb_countries(name, code, flag_emoji), uploader:lb_users!uploaded_by(full_name)'
      )
      .order('created_at', { ascending: false })

    const categoryId = searchParams.get('category_id')
    const countryId = searchParams.get('country_id')
    const fileType = searchParams.get('file_type')

    if (categoryId) query = query.eq('category_id', categoryId)
    if (countryId) query = query.eq('country_id', countryId)
    if (fileType) query = query.eq('file_type', fileType)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const categoryId = formData.get('category_id') as string
    const countryId = formData.get('country_id') as string
    const fileType = formData.get('file_type') as string
    const rowCountStr = formData.get('row_count') as string | null

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }
    if (!categoryId || !countryId || !fileType) {
      return NextResponse.json(
        { error: 'category_id, country_id, and file_type are required' },
        { status: 400 }
      )
    }
    if (!(FILE_TYPES as readonly string[]).includes(fileType)) {
      return NextResponse.json(
        { error: 'Invalid file_type' },
        { status: 400 }
      )
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Fetch category slug and country code for storage path
    const [catResult, countryResult] = await Promise.all([
      supabase
        .from('lb_categories')
        .select('slug')
        .eq('id', categoryId)
        .single(),
      supabase
        .from('lb_countries')
        .select('code')
        .eq('id', countryId)
        .single(),
    ])

    if (catResult.error || !catResult.data) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      )
    }
    if (countryResult.error || !countryResult.data) {
      return NextResponse.json(
        { error: 'Invalid country' },
        { status: 400 }
      )
    }

    // Build storage path
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    let finalStorageName = safeName
    let fileBuffer = Buffer.from(await file.arrayBuffer())
    let contentType = file.type || 'text/csv'
    let parsedRowCount: number | null = null

    // SP Prompts: parse xlsx server-side, convert to clean CSV before storage
    if (fileType === 'sp_prompts' && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      const XLSX = await import('xlsx')
      const Papa = await import('papaparse')
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      // Extract relevant columns (case-insensitive matching)
      const SP_COLUMNS = [
        'prompt details', 'country', 'advertised asin', 'advertised sku',
        'impressions', 'clicks', 'click-thru rate (ctr)', 'spend',
        '7 day total sales', 'total advertising cost of sales (acos)',
        '7 day total orders (#)',
      ]
      const allKeys = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
      const selectedKeys = SP_COLUMNS.map((col) =>
        allKeys.find((k) => k.toLowerCase().trim() === col) || null
      ).filter((k): k is string => k !== null)

      const cleanRows = rawRows.map((row) =>
        Object.fromEntries(selectedKeys.map((k) => [k, row[k] ?? '']))
      )

      const csvContent = Papa.default.unparse(cleanRows, { header: true })
      fileBuffer = Buffer.from(csvContent, 'utf-8')
      finalStorageName = safeName.replace(/\.xlsx$/i, '.csv').replace(/\.xls$/i, '.csv')
      contentType = 'text/csv'
      parsedRowCount = rawRows.length
    }

    const storagePath = `${catResult.data.slug}/${countryResult.data.code.toLowerCase()}/${fileType}/${Date.now()}_${finalStorageName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('lb-research-files')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Insert DB record
    const rowCount = parsedRowCount ?? (rowCountStr ? parseInt(rowCountStr, 10) : null)
    const { data, error: dbError } = await supabase
      .from('lb_research_files')
      .insert({
        category_id: categoryId,
        country_id: countryId,
        file_type: fileType,
        file_name: file.name,
        storage_path: storagePath,
        source: 'manual_upload',
        file_size_bytes: file.size,
        row_count: isNaN(rowCount as number) ? null : rowCount,
        uploaded_by: lbUser.id,
      })
      .select(
        '*, category:lb_categories(name, slug, brand), country:lb_countries(name, code, flag_emoji), uploader:lb_users!uploaded_by(full_name)'
      )
      .single()

    if (dbError) {
      // Clean up storage on DB failure
      await supabase.storage.from('lb-research-files').remove([storagePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
