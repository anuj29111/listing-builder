import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const batchId = params.id

    // Fetch batch job
    const { data: batchJob, error: batchError } = await supabase
      .from('lb_batch_jobs')
      .select('*')
      .eq('id', batchId)
      .single()

    if (batchError || !batchJob) {
      return NextResponse.json({ error: 'Batch job not found' }, { status: 404 })
    }

    // Fetch listings for this batch
    const { data: listings, error: listingsError } = await supabase
      .from('lb_listings')
      .select('id, status, generation_context, created_at')
      .eq('batch_job_id', batchId)
      .order('created_at', { ascending: true })

    if (listingsError) {
      return NextResponse.json({ error: listingsError.message }, { status: 500 })
    }

    // Map listings to summary format
    const listingSummaries = (listings || []).map((l) => ({
      id: l.id,
      product_name: (l.generation_context as Record<string, string>)?.productName || 'Unknown',
      status: l.status,
      created_at: l.created_at,
    }))

    return NextResponse.json({
      data: {
        batch_job: batchJob,
        listings: listingSummaries,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const batchId = params.id
    const body = await request.json()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.name && typeof body.name === 'string') {
      updates.name = body.name.trim()
    }

    const { data, error } = await adminClient
      .from('lb_batch_jobs')
      .update(updates)
      .eq('id', batchId)
      .select()
      .single()

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
