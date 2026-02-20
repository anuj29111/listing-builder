import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { selected_variations } = body as { selected_variations: string[] }

    if (!selected_variations?.length) {
      return NextResponse.json({ error: 'No variations selected' }, { status: 400 })
    }

    // Get job and validate status
    const { data: job, error: jobErr } = await adminClient
      .from('lb_seller_pull_jobs')
      .select('*')
      .eq('id', params.id)
      .single()

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'awaiting_variation_selection') {
      return NextResponse.json(
        { error: `Cannot import variations: job status is "${job.status}"` },
        { status: 400 }
      )
    }

    // Update job status
    await adminClient
      .from('lb_seller_pull_jobs')
      .update({
        selected_variations,
        status: 'importing_variations',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // Get variation records to import
    const variationsToImport = (job.variation_results || []).filter(
      (v: { asin: string; is_new: boolean }) =>
        v.is_new && selected_variations.includes(v.asin)
    )

    // Import: upsert to lb_products
    const supabase = createClient()
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const batchSize = 100

    for (let i = 0; i < variationsToImport.length; i += batchSize) {
      const batch = variationsToImport.slice(i, i + batchSize)
      const records = batch
        .filter((v: { asin: string }) => v.asin?.trim())
        .map((v: { asin: string; title: string; parent_asin: string }) => ({
          asin: v.asin.trim().toUpperCase(),
          product_name: v.title || v.asin,
          parent_asin: v.parent_asin || null,
          parent_name: null,
          category: 'Uncategorized',
          brand: null,
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

    const variation_import_result = {
      imported,
      skipped,
      errors,
      total: variationsToImport.length,
    }

    // Mark job as done
    await adminClient
      .from('lb_seller_pull_jobs')
      .update({
        status: 'done',
        variation_import_result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    return NextResponse.json({ success: true, variation_import_result })
  } catch (err) {
    console.error('Seller pull job import-variations error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
