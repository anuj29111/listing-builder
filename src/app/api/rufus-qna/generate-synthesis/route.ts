/**
 * POST /api/rufus-qna/generate-synthesis
 *
 * Body: {
 *   asin: string,
 *   marketplace?: string,
 *   save_to_item_id?: string,         // optional back-compat: also write synthesis_md to a job item
 *   loop_run_id?: string,             // optional: link to a specific loop run
 *   source?: 'manual_regen'|'backfill'|'bulk' // default 'manual_regen'
 * }
 *
 * Reads ALL source='rufus' Q&A from lb_asin_questions for this ASIN, then
 * calls Claude to produce a listing_recommendations.md synthesis + structured JSON.
 *
 * ALWAYS persists to lb_rufus_synthesis with auto-incremented version (per asin/country).
 * Returns the synthesis row id, version, markdown, and structured fields.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions, validateExtensionKey } from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import { persistSynthesis } from '@/lib/rufus-orchestrator'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
    // Dual auth: session cookie (UI) OR Bearer key (Claude/scripts/cron)
    let userId: string | null = null
    try {
      const { lbUser } = await getAuthenticatedUser()
      userId = lbUser.id
    } catch {
      const adminCheck = createAdminClient()
      const ok = await validateExtensionKey(request, adminCheck)
      if (!ok) {
        return corsJson(
          { error: 'Not authenticated (need session cookie or Rufus Bearer key)' },
          401
        )
      }
    }

    const body = await request.json()
    const {
      asin,
      marketplace = 'amazon.com',
      save_to_item_id,
      loop_run_id,
      source,
    } = body as {
      asin?: string
      marketplace?: string
      save_to_item_id?: string
      loop_run_id?: string
      source?: 'manual_regen' | 'backfill' | 'bulk'
    }

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
      return corsJson({ error: 'Invalid ASIN format' }, 400)
    }

    const cleanedAsin = asin.trim().toUpperCase()
    const adminClient = createAdminClient()

    const { data: country } = await adminClient
      .from('lb_countries')
      .select('id, amazon_domain')
      .eq('amazon_domain', marketplace)
      .single<{ id: string; amazon_domain: string }>()

    if (!country) {
      return corsJson({ error: `Unknown marketplace: ${marketplace}` }, 400)
    }

    const { data: row } = await adminClient
      .from('lb_asin_questions')
      .select('questions')
      .eq('asin', cleanedAsin)
      .eq('country_id', country.id)
      .single<{ questions: QAPair[] }>()

    if (!row?.questions || !Array.isArray(row.questions)) {
      return corsJson({ error: 'No Q&A data found for this ASIN' }, 404)
    }

    const rufusOnly = row.questions.filter((q) => q.source === 'rufus')

    if (rufusOnly.length < 5) {
      return corsJson(
        {
          error: `Not enough Rufus Q&A to synthesize (have ${rufusOnly.length}, need >= 5)`,
        },
        400
      )
    }

    const synth = await persistSynthesis({
      asin: cleanedAsin,
      countryId: country.id,
      marketplaceDomain: marketplace,
      qaPairs: rufusOnly,
      loopRunId: loop_run_id ?? null,
      source: source ?? 'manual_regen',
      generatedBy: userId,
    })

    // Optionally back-compat: write synthesis_md to a job item too
    if (save_to_item_id) {
      await adminClient
        .from('lb_rufus_job_items')
        .update({ synthesis_md: synth.synthesis_md })
        .eq('id', save_to_item_id)
    }

    return corsJson({
      success: true,
      asin: cleanedAsin,
      marketplace,
      synthesis_id: synth.id,
      version: synth.version,
      qa_count_used: rufusOnly.length,
      synthesis_md: synth.synthesis_md,
      structured: synth.structured,
      cost_usd: synth.cost_usd,
      saved_to_item_id: save_to_item_id ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('generate-synthesis error:', e)
    return corsJson({ error: message }, 500)
  }
}
