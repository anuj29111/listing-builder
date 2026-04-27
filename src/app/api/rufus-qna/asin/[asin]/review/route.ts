/**
 * PATCH /api/rufus-qna/asin/[asin]/review
 *
 * Body: {
 *   country_id: string,
 *   status?: 'not_reviewed'|'reviewing'|'reviewed'|'applied'|'archived'|'flagged',
 *   priority?: 1|2|3|4|5,
 *   notes?: string,
 *   pinned_top3?: any,
 *   pinned_image_briefs?: any
 * }
 *
 * Updates the per-ASIN review status row. Auto-stamps reviewed_at when status
 * transitions to 'reviewed', and applied_to_listing_at when status transitions
 * to 'applied'. Creates the row if it doesn't exist.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

const VALID_STATUSES = [
  'not_reviewed',
  'reviewing',
  'reviewed',
  'applied',
  'archived',
  'flagged',
]

export async function PATCH(
  request: Request,
  { params }: { params: { asin: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const asin = params.asin?.trim().toUpperCase()
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json({ error: 'Invalid ASIN' }, { status: 400 })
    }

    const body = await request.json()
    const {
      country_id,
      status,
      priority,
      notes,
      pinned_top3,
      pinned_image_briefs,
    } = body as {
      country_id?: string
      status?: string
      priority?: number
      notes?: string
      pinned_top3?: unknown
      pinned_image_briefs?: unknown
    }

    if (!country_id) {
      return NextResponse.json(
        { error: 'country_id is required in body' },
        { status: 400 }
      )
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    if (priority !== undefined && (priority < 1 || priority > 5)) {
      return NextResponse.json(
        { error: 'priority must be 1-5' },
        { status: 400 }
      )
    }

    // Look up marketplace_domain from country
    const { data: country } = await adminClient
      .from('lb_countries')
      .select('amazon_domain')
      .eq('id', country_id)
      .single<{ amazon_domain: string }>()
    if (!country) {
      return NextResponse.json(
        { error: 'Unknown country_id' },
        { status: 400 }
      )
    }

    // Read existing to detect status transitions
    const { data: existing } = await adminClient
      .from('lb_asin_review_status')
      .select('status')
      .eq('asin', asin)
      .eq('country_id', country_id)
      .maybeSingle<{ status: string }>()

    const updates: Record<string, unknown> = {
      asin,
      country_id,
      marketplace_domain: country.amazon_domain,
    }

    if (status) {
      updates.status = status
      if (status === 'reviewed' && existing?.status !== 'reviewed') {
        updates.reviewed_at = new Date().toISOString()
        updates.reviewed_by = lbUser.id
      }
      if (status === 'applied' && existing?.status !== 'applied') {
        updates.applied_to_listing_at = new Date().toISOString()
        updates.applied_by = lbUser.id
      }
    }
    if (priority !== undefined) updates.priority = priority
    if (notes !== undefined) updates.notes = notes
    if (pinned_top3 !== undefined) updates.pinned_top3 = pinned_top3
    if (pinned_image_briefs !== undefined) {
      updates.pinned_image_briefs = pinned_image_briefs
    }

    const { data: row, error } = await adminClient
      .from('lb_asin_review_status')
      .upsert(updates, { onConflict: 'asin,country_id' })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, review_status: row })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('review PATCH error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
