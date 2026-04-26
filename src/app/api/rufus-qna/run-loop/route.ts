/**
 * POST /api/rufus-qna/run-loop
 *
 * Body: { asin: string, country_id: string, marketplace?: string }
 *
 * Entry point for the Full Amy Loop:
 *   1. Creates an lb_rufus_jobs row with loop_mode='full_amy_loop' (status='queued')
 *   2. Creates a single lb_rufus_job_items row with loop_phase='pass1',
 *      custom_questions = Amy's 5 framing questions, status='pending'
 *
 * Returns the job_id and item_id so the UI can poll for progress.
 *
 * The orchestrator (in queue/route.ts POST handler) takes over from there:
 *   - Pass 1 completes → handlePass1Completion → creates pass2 item
 *   - Pass 2 completes → handlePass2Completion → writes synthesis_md
 */
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions } from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import { AMY_PASS1_QUESTIONS } from '@/lib/rufus-orchestrator'

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()

    const body = await request.json()
    const { asin, country_id, marketplace } = body as {
      asin?: string
      country_id?: string
      marketplace?: string
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
        total_asins: 1, // pass1 only initially; orchestrator bumps to 2 after pass1
        completed_asins: 0,
        failed_asins: 0,
        created_by: lbUser.id,
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
      // Roll back the job
      await adminClient.from('lb_rufus_jobs').delete().eq('id', job.id)
      return corsJson(
        { error: `Failed to create Pass 1 item: ${itemErr?.message}` },
        500
      )
    }

    return corsJson({
      success: true,
      job_id: job.id,
      pass1_item_id: item.id,
      asin: cleanedAsin,
      marketplace: resolvedMarketplace,
      questions_queued: AMY_PASS1_QUESTIONS.length,
      message:
        'Amy loop started. Extension will pick up Pass 1, then Pass 2 + synthesis run automatically.',
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return corsJson({ error: message }, 401)
    }
    console.error('run-loop error:', e)
    return corsJson({ error: message }, 500)
  }
}
