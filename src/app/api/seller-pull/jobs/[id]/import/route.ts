import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { backgroundScrape } from '@/lib/seller-pull'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { selected_asins, product_categories } = body as {
      selected_asins: string[]
      product_categories: Record<string, string>
    }

    if (!selected_asins?.length) {
      return NextResponse.json({ error: 'No products selected' }, { status: 400 })
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

    if (job.status !== 'pulled') {
      return NextResponse.json(
        { error: `Cannot import: job status is "${job.status}", expected "pulled"` },
        { status: 400 }
      )
    }

    // Save selections to job
    await adminClient
      .from('lb_seller_pull_jobs')
      .update({
        selected_asins,
        product_categories: product_categories || {},
        status: 'importing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // Get products from pull_result
    const products = (job.pull_result?.products || []).filter(
      (p: { asin: string }) => selected_asins.includes(p.asin)
    )

    // Import: upsert to lb_products
    const supabase = createClient()
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const batchSize = 100

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)
      const records = batch
        .filter((p: { asin: string }) => p.asin?.trim())
        .map((p: { asin: string; title: string; manufacturer?: string }) => ({
          asin: p.asin.trim().toUpperCase(),
          product_name: p.title || p.asin,
          parent_asin: null,
          parent_name: null,
          category: product_categories[p.asin] || 'Uncategorized',
          brand: p.manufacturer || null,
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

    const import_result = { imported, skipped, errors, total: products.length }

    // Get country for domain mapping (needed for scrape)
    const { data: country } = await supabase
      .from('lb_countries')
      .select('id, amazon_domain')
      .eq('id', job.country_id)
      .single()

    const oxylabsDomain = country?.amazon_domain?.replace('amazon.', '') || ''
    const amazonDomain = country?.amazon_domain || ''

    // Update job: imported, start scraping
    await adminClient
      .from('lb_seller_pull_jobs')
      .update({
        status: 'scraping',
        import_result,
        scrape_progress: { current: 0, total: selected_asins.length },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // Fire and forget: background scrape
    backgroundScrape(
      params.id,
      selected_asins,
      job.country_id,
      oxylabsDomain,
      amazonDomain,
      lbUser.id
    ).catch((err) => console.error(`[Seller Pull Job ${params.id}] Scrape unhandled error:`, err))

    return NextResponse.json({ success: true, import_result })
  } catch (err) {
    console.error('Seller pull job import error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
