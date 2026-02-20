import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { backgroundPull } from '@/lib/seller-pull'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { country_id } = body as { country_id: string }
    if (!country_id) {
      return NextResponse.json({ error: 'country_id is required' }, { status: 400 })
    }

    // Check for active job on same country (prevent duplicates)
    const { data: existingJob } = await adminClient
      .from('lb_seller_pull_jobs')
      .select('id, status')
      .eq('country_id', country_id)
      .not('status', 'in', '("done","failed")')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingJob) {
      return NextResponse.json({ job_id: existingJob.id, existing: true })
    }

    // Get seller ID from admin settings
    const { data: sellerIdsSetting } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'seller_ids')
      .single()

    if (!sellerIdsSetting?.value) {
      return NextResponse.json(
        { error: 'No seller IDs configured. Go to Settings → Admin → Amazon Seller IDs.' },
        { status: 400 }
      )
    }

    let sellerIdsMap: Record<string, string>
    try {
      sellerIdsMap = JSON.parse(sellerIdsSetting.value)
    } catch {
      return NextResponse.json({ error: 'Invalid seller IDs configuration' }, { status: 500 })
    }

    const sellerId = sellerIdsMap[country_id]
    if (!sellerId) {
      return NextResponse.json(
        { error: 'No seller ID configured for this marketplace.' },
        { status: 400 }
      )
    }

    // Get country record for domain mapping
    const supabase = createClient()
    const { data: country, error: countryErr } = await supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain')
      .eq('id', country_id)
      .single()

    if (countryErr || !country) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    const oxylabsDomain = country.amazon_domain.replace('amazon.', '')

    // Create job row
    const { data: job, error: jobError } = await adminClient
      .from('lb_seller_pull_jobs')
      .insert({
        country_id,
        seller_id: sellerId,
        status: 'pulling',
        created_by: lbUser.id,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || 'Failed to create job' },
        { status: 500 }
      )
    }

    // Fire and forget: process pull in background
    backgroundPull(
      job.id,
      sellerId,
      oxylabsDomain,
      country_id,
      { id: country.id, name: country.name, code: country.code }
    ).catch((err) => console.error(`[Seller Pull Job ${job.id}] Unhandled error:`, err))

    return NextResponse.json({ job_id: job.id })
  } catch (err) {
    console.error('Create seller pull job error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const { searchParams } = new URL(request.url)
    const country_id = searchParams.get('country_id')

    let query = adminClient
      .from('lb_seller_pull_jobs')
      .select('id, country_id, seller_id, status, error, created_at, updated_at, pull_result')
      .order('created_at', { ascending: false })
      .limit(10)

    if (country_id) {
      query = query.eq('country_id', country_id)
    }

    const { data: jobs, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Mark stale jobs (>30 min in a background state) as failed
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const backgroundStates = ['pulling', 'scraping', 'discovering_variations']

    for (const job of jobs || []) {
      if (backgroundStates.includes(job.status) && job.updated_at < thirtyMinAgo) {
        await adminClient
          .from('lb_seller_pull_jobs')
          .update({ status: 'failed', error: 'Timed out', updated_at: new Date().toISOString() })
          .eq('id', job.id)
        job.status = 'failed'
        job.error = 'Timed out'
      }
    }

    // Return lightweight list (pull_result has summary only, not full product list)
    const lightweight = (jobs || []).map((j) => ({
      id: j.id,
      country_id: j.country_id,
      seller_id: j.seller_id,
      status: j.status,
      error: j.error,
      created_at: j.created_at,
      updated_at: j.updated_at,
      product_count: j.pull_result?.products?.length || 0,
      summary: j.pull_result?.summary || null,
    }))

    return NextResponse.json({ jobs: lightweight })
  } catch (err) {
    console.error('List seller pull jobs error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
