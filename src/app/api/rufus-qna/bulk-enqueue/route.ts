/**
 * POST /api/rufus-qna/bulk-enqueue
 *
 * Body: {
 *   asins: string[],          // up to 1000 ASINs in one batch
 *   country_id: string,
 *   marketplace?: string,     // optional override
 *   skip_if_synthesized_within_days?: number, // dedup heuristic, e.g. 30
 *   notes?: string
 * }
 *
 * Bulk-enqueues Amy loops for many ASINs. For each:
 *   1. Skip if a recent synthesis exists (per skip_if_synthesized_within_days)
 *   2. Skip if there's already an active loop_run (queued / pass*_running / synthesizing)
 *   3. Create a new lb_rufus_jobs row (loop_mode='full_amy_loop', source='bulk')
 *   4. Create lb_rufus_loop_runs (status='queued', source='bulk')
 *   5. Create lb_rufus_job_items (loop_phase='pass1', custom_questions=Amy's 5)
 *   6. Upsert lb_asin_review_status row
 *
 * Returns counts + per-ASIN status (created / skipped_recent / skipped_active / invalid_asin / error).
 *
 * The Chrome extension's queue poller picks them up sequentially. Throughput is
 * gated by Chrome runner availability — see /dashboard endpoint for ETA math.
 */
import { createAdminClient } from '@/lib/supabase/server'
import {
  corsJson,
  corsOptions,
  validateExtensionKey,
  getSystemUserId,
} from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import { AMY_PASS1_QUESTIONS } from '@/lib/rufus-orchestrator'

interface AsinResult {
  asin: string
  status:
    | 'created'
    | 'skipped_recent_synthesis'
    | 'skipped_active_loop'
    | 'invalid_asin'
    | 'error'
  loop_run_id?: string
  job_id?: string
  pass1_item_id?: string
  reason?: string
}

const ACTIVE_STATUSES = [
  'queued',
  'pass1_running',
  'pass1_done',
  'pass2_generating',
  'pass2_running',
  'pass2_done',
  'synthesizing',
]

const ASIN_REGEX = /^[A-Z0-9]{10}$/

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
    let createdById: string | null = null
    try {
      const { lbUser } = await getAuthenticatedUser()
      createdById = lbUser.id
    } catch {
      const adminCheck = createAdminClient()
      const isExtKey = await validateExtensionKey(request, adminCheck)
      if (isExtKey) createdById = await getSystemUserId()
    }
    if (!createdById) {
      return corsJson(
        { error: 'Not authenticated (need session cookie or Rufus Bearer key)' },
        401
      )
    }

    const body = await request.json()
    const {
      asins,
      country_id,
      marketplace,
      skip_if_synthesized_within_days,
      notes,
    } = body as {
      asins?: string[]
      country_id?: string
      marketplace?: string
      skip_if_synthesized_within_days?: number
      notes?: string
    }

    if (!Array.isArray(asins) || asins.length === 0) {
      return corsJson({ error: 'asins (non-empty array) required' }, 400)
    }
    if (asins.length > 1000) {
      return corsJson(
        { error: `Max 1000 ASINs per batch (got ${asins.length})` },
        400
      )
    }
    if (!country_id) {
      return corsJson({ error: 'country_id is required' }, 400)
    }

    const adminClient = createAdminClient()

    // Resolve marketplace from country if not provided
    let resolvedMarketplace = marketplace
    if (!resolvedMarketplace) {
      const { data: country } = await adminClient
        .from('lb_countries')
        .select('amazon_domain')
        .eq('id', country_id)
        .single<{ amazon_domain: string }>()
      resolvedMarketplace = country?.amazon_domain || 'amazon.com'
    }

    const results: AsinResult[] = []
    const cleaned = Array.from(
      new Set(asins.map((a) => a.trim().toUpperCase()).filter(Boolean))
    )

    // Optional dedup: pre-fetch ASINs with a recent synthesis
    let recentSet = new Set<string>()
    if (
      typeof skip_if_synthesized_within_days === 'number' &&
      skip_if_synthesized_within_days > 0
    ) {
      const cutoff = new Date(
        Date.now() - skip_if_synthesized_within_days * 24 * 60 * 60 * 1000
      ).toISOString()
      const { data: recent } = await adminClient
        .from('lb_rufus_synthesis')
        .select('asin')
        .eq('country_id', country_id)
        .gte('generated_at', cutoff)
      recentSet = new Set((recent || []).map((r) => r.asin))
    }

    // Pre-fetch active loop_runs to skip dups
    const { data: activeRuns } = await adminClient
      .from('lb_rufus_loop_runs')
      .select('asin')
      .eq('country_id', country_id)
      .in('status', ACTIVE_STATUSES)
    const activeSet = new Set((activeRuns || []).map((r) => r.asin))

    for (const asin of cleaned) {
      if (!ASIN_REGEX.test(asin)) {
        results.push({ asin, status: 'invalid_asin' })
        continue
      }

      if (recentSet.has(asin)) {
        results.push({
          asin,
          status: 'skipped_recent_synthesis',
          reason: `synthesis exists within last ${skip_if_synthesized_within_days} days`,
        })
        continue
      }

      if (activeSet.has(asin)) {
        results.push({
          asin,
          status: 'skipped_active_loop',
          reason: 'active loop_run already exists',
        })
        continue
      }

      // Create job
      const { data: job, error: jobErr } = await adminClient
        .from('lb_rufus_jobs')
        .insert({
          country_id,
          marketplace_domain: resolvedMarketplace,
          source: 'amy_loop',
          status: 'queued',
          total_asins: 1,
          completed_asins: 0,
          failed_asins: 0,
          created_by: createdById,
          loop_mode: 'full_amy_loop',
        })
        .select('id')
        .single<{ id: string }>()
      if (jobErr || !job) {
        results.push({ asin, status: 'error', reason: jobErr?.message })
        continue
      }

      // Create loop_run
      const { data: loopRun, error: loopErr } = await adminClient
        .from('lb_rufus_loop_runs')
        .insert({
          asin,
          country_id,
          marketplace_domain: resolvedMarketplace,
          job_id: job.id,
          status: 'queued',
          source: 'bulk',
          notes: notes ?? null,
          created_by: createdById,
        })
        .select('id')
        .single<{ id: string }>()
      if (loopErr || !loopRun) {
        await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
        results.push({ asin, status: 'error', reason: loopErr?.message })
        continue
      }

      // Create pass1 item
      const { data: item, error: itemErr } = await adminClient
        .from('lb_rufus_job_items')
        .insert({
          job_id: job.id,
          asin,
          status: 'pending',
          marketplace: resolvedMarketplace,
          loop_phase: 'pass1',
          custom_questions: AMY_PASS1_QUESTIONS,
          max_questions: AMY_PASS1_QUESTIONS.length,
        })
        .select('id')
        .single<{ id: string }>()
      if (itemErr || !item) {
        await adminClient
          .from('lb_rufus_loop_runs')
          .delete()
          .eq('id', loopRun.id)
        await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
        results.push({ asin, status: 'error', reason: itemErr?.message })
        continue
      }

      // Wire loop_run → pass1_item
      await adminClient
        .from('lb_rufus_loop_runs')
        .update({ pass1_item_id: item.id })
        .eq('id', loopRun.id)

      // Upsert review_status
      await adminClient
        .from('lb_asin_review_status')
        .upsert(
          {
            asin,
            country_id,
            marketplace_domain: resolvedMarketplace,
          },
          { onConflict: 'asin,country_id' }
        )

      // Track in activeSet to prevent dupes within same batch
      activeSet.add(asin)

      results.push({
        asin,
        status: 'created',
        loop_run_id: loopRun.id,
        job_id: job.id,
        pass1_item_id: item.id,
      })
    }

    const summary = {
      total_input: asins.length,
      total_unique: cleaned.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped_recent: results.filter(
        (r) => r.status === 'skipped_recent_synthesis'
      ).length,
      skipped_active: results.filter((r) => r.status === 'skipped_active_loop')
        .length,
      invalid: results.filter((r) => r.status === 'invalid_asin').length,
      errors: results.filter((r) => r.status === 'error').length,
    }

    return corsJson({
      success: true,
      summary,
      results,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('bulk-enqueue error:', e)
    return corsJson({ error: message }, 500)
  }
}
