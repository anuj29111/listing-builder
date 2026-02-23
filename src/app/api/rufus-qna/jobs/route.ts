import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

/**
 * GET /api/rufus-qna/jobs
 *
 * List all Rufus Q&A jobs for the authenticated user.
 * Returns jobs with item summary counts.
 */
export async function GET() {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: jobs, error } = await supabase
      .from('lb_rufus_jobs')
      .select(`
        id,
        country_id,
        marketplace_domain,
        source,
        market_intelligence_id,
        status,
        total_asins,
        completed_asins,
        failed_asins,
        created_by,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/rufus-qna/jobs
 *
 * Create a new Rufus Q&A job.
 * Accepts either manual ASINs or a Market Intelligence ID.
 */
export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const body = await request.json()
    const { source, country_id, asins, market_intelligence_id } = body

    let jobAsins: string[] = []
    let jobCountryId: string = country_id
    let jobMarketplaceDomain: string = ''
    let jobMiId: string | null = null

    if (source === 'market_intelligence') {
      // Import ASINs from a completed MI record
      if (!market_intelligence_id) {
        return NextResponse.json({ error: 'market_intelligence_id is required' }, { status: 400 })
      }

      const { data: mi, error: miErr } = await adminClient
        .from('lb_market_intelligence')
        .select('id, selected_asins, country_id, marketplace_domain, status')
        .eq('id', market_intelligence_id)
        .single()

      if (miErr || !mi) {
        return NextResponse.json({ error: 'Market Intelligence record not found' }, { status: 404 })
      }

      if (mi.status !== 'completed') {
        return NextResponse.json({ error: 'MI record must be completed' }, { status: 400 })
      }

      if (!mi.selected_asins || !Array.isArray(mi.selected_asins) || mi.selected_asins.length === 0) {
        return NextResponse.json({ error: 'MI record has no selected ASINs' }, { status: 400 })
      }

      jobAsins = mi.selected_asins as string[]
      jobCountryId = mi.country_id
      jobMarketplaceDomain = mi.marketplace_domain || ''
      jobMiId = mi.id
    } else {
      // Manual ASINs
      if (!country_id) {
        return NextResponse.json({ error: 'country_id is required' }, { status: 400 })
      }

      if (!Array.isArray(asins) || asins.length === 0) {
        return NextResponse.json({ error: 'asins array is required and must not be empty' }, { status: 400 })
      }

      // Validate and clean ASINs
      jobAsins = asins
        .map((a: string) => a.trim().toUpperCase())
        .filter((a: string) => /^[A-Z0-9]{10}$/.test(a))

      if (jobAsins.length === 0) {
        return NextResponse.json({ error: 'No valid ASINs provided' }, { status: 400 })
      }

      // Look up marketplace domain from country
      const { data: country } = await adminClient
        .from('lb_countries')
        .select('amazon_domain')
        .eq('id', country_id)
        .single()

      jobMarketplaceDomain = country?.amazon_domain || 'amazon.com'
    }

    // Deduplicate ASINs
    jobAsins = Array.from(new Set(jobAsins))

    // Create the job
    const { data: job, error: jobErr } = await adminClient
      .from('lb_rufus_jobs')
      .insert({
        country_id: jobCountryId,
        marketplace_domain: jobMarketplaceDomain,
        source: source || 'manual',
        market_intelligence_id: jobMiId,
        status: 'queued',
        total_asins: jobAsins.length,
        completed_asins: 0,
        failed_asins: 0,
        created_by: lbUser.id,
      })
      .select('id')
      .single()

    if (jobErr || !job) {
      console.error('Failed to create job:', jobErr)
      return NextResponse.json({ error: `Failed to create job: ${jobErr?.message}` }, { status: 500 })
    }

    // Create job items (one per ASIN)
    const items = jobAsins.map((asin) => ({
      job_id: job.id,
      asin,
      status: 'pending' as const,
    }))

    const { error: itemsErr } = await adminClient
      .from('lb_rufus_job_items')
      .insert(items)

    if (itemsErr) {
      console.error('Failed to create job items:', itemsErr)
      // Clean up the job
      await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
      return NextResponse.json({ error: `Failed to create job items: ${itemsErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      total_asins: jobAsins.length,
      asins: jobAsins,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Jobs POST error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
