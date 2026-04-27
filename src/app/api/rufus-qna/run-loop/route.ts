/**
 * POST /api/rufus-qna/run-loop
 *
 * Body: { asin: string, country_id: string, marketplace?: string, source?: 'amy_loop'|'manual'|'bulk', notes?: string }
 *
 * Entry point for the Full Amy Loop:
 *   1. Creates an lb_rufus_jobs row with loop_mode='full_amy_loop' (status='queued')
 *   2. Creates an lb_rufus_loop_runs row (status='queued', references job)
 *   3. Creates a single lb_rufus_job_items row with loop_phase='pass1',
 *      custom_questions = Amy's 5 framing questions, status='pending'
 *   4. Wires the loop_run.pass1_item_id to that item
 *   5. Creates an lb_asin_review_status row if missing
 *
 * Returns the job_id, loop_run_id, and pass1_item_id so the UI can poll for progress.
 *
 * The orchestrator (in queue/route.ts POST handler) takes over from there:
 *   - Pass 1 completes → handlePass1Completion → persists Pass 2 questions, creates pass2 item
 *   - Pass 2 completes → handlePass2Completion → persists synthesis with version
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

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
    // Dual auth: session cookie (UI) OR Bearer key (Claude/scripts/cron)
    let createdById: string | null = null
    try {
      const { lbUser } = await getAuthenticatedUser()
      createdById = lbUser.id
    } catch {
      const adminCheck = createAdminClient()
      const isExtKey = await validateExtensionKey(request, adminCheck)
      if (isExtKey) {
        createdById = await getSystemUserId()
      }
    }
    if (!createdById) {
      return corsJson(
        { error: 'Not authenticated (need session cookie or Rufus Bearer key)' },
        401
      )
    }

    const body = await request.json()
    const { asin, country_id, marketplace, source, notes } = body as {
      asin?: string
      country_id?: string
      marketplace?: string
      source?: 'amy_loop' | 'manual' | 'bulk'
      notes?: string
    }

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
      return corsJson({ error: 'Invalid ASIN format' }, 400)
    }

    if (!country_id) {
      return corsJson({ error: 'country_id is required' }, 400)
    }

    const cleanedAsin = asin.trim().toUpperCase()
    const adminClient = createAdminClient()

    // Look up marketplace domain from country (if not provided)
    let resolvedMarketplace = marketplace
    if (!resolvedMarketplace) {
      const { data: country } = await adminClient
        .from('lb_countries')
        .select('amazon_domain')
        .eq('id', country_id)
        .single<{ amazon_domain: string }>()
      resolvedMarketplace = country?.amazon_domain || 'amazon.com'
    }

    // Create the job
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
      console.error('Failed to create Amy loop job:', jobErr)
      return corsJson(
        { error: `Failed to create job: ${jobErr?.message}` },
        500
      )
    }

    // Create the loop_run row
    const { data: loopRun, error: loopErr } = await adminClient
      .from('lb_rufus_loop_runs')
      .insert({
        asin: cleanedAsin,
        country_id,
        marketplace_domain: resolvedMarketplace,
        job_id: job.id,
        status: 'queued',
        source: source ?? 'amy_loop',
        notes: notes ?? null,
        created_by: createdById,
      })
      .select('id')
      .single<{ id: string }>()

    if (loopErr || !loopRun) {
      console.error('Failed to create loop_run:', loopErr)
      await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
      return corsJson(
        { error: `Failed to create loop_run: ${loopErr?.message}` },
        500
      )
    }

    // Create the Pass 1 item with Amy's 5 framing questions
    const { data: item, error: itemErr } = await adminClient
      .from('lb_rufus_job_items')
      .insert({
        job_id: job.id,
        asin: cleanedAsin,
        status: 'pending',
        marketplace: resolvedMarketplace,
        loop_phase: 'pass1',
        custom_questions: AMY_PASS1_QUESTIONS,
        max_questions: AMY_PASS1_QUESTIONS.length,
      })
      .select('id')
      .single<{ id: string }>()

    if (itemErr || !item) {
      console.error('Failed to create Pass 1 item:', itemErr)
      await adminClient.from('lb_rufus_loop_runs').delete().eq('id', loopRun.id)
      await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
      return corsJson(
        { error: `Failed to create Pass 1 item: ${itemErr?.message}` },
        500
      )
    }

    // Wire loop_run → pass1_item_id
    await adminClient
      .from('lb_rufus_loop_runs')
      .update({ pass1_item_id: item.id })
      .eq('id', loopRun.id)

    // Ensure review_status row exists (best effort — non-fatal)
    await adminClient
      .from('lb_asin_review_status')
      .upsert(
        {
          asin: cleanedAsin,
          country_id,
          marketplace_domain: resolvedMarketplace,
        },
        { onConflict: 'asin,country_id' }
      )

    return corsJson({
      success: true,
      job_id: job.id,
      loop_run_id: loopRun.id,
      pass1_item_id: item.id,
      asin: cleanedAsin,
      marketplace: resolvedMarketplace,
      questions_queued: AMY_PASS1_QUESTIONS.length,
      message:
        'Amy loop started. Extension will pick up Pass 1, then Pass 2 + synthesis run automatically.',
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('run-loop error:', e)
    return corsJson({ error: message }, 500)
  }
}
