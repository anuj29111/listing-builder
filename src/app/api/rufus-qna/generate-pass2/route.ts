/**
 * POST /api/rufus-qna/generate-pass2
 *
 * Body: {
 *   asin: string,
 *   marketplace?: string,
 *   loop_run_id?: string,        // optional: link to a specific loop run
 *   source?: 'manual'|'regen'    // default 'manual'
 * }
 *
 * Reads Pass 1 answers from lb_asin_questions for this ASIN, then calls Claude
 * to generate 15 product-specific follow-up questions. ALWAYS persists to
 * lb_rufus_pass2_questions for full audit trail. Does NOT enqueue them as a
 * job item — caller chooses whether to use them (UI preview / regen flow).
 */
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions, validateExtensionKey } from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  AMY_PASS1_QUESTIONS,
  persistPass2Questions,
} from '@/lib/rufus-orchestrator'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

const AMY_PASS1_NORMALIZED = AMY_PASS1_QUESTIONS.map((q) =>
  q.toLowerCase().trim()
)

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
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
      loop_run_id,
      source,
    } = body as {
      asin?: string
      marketplace?: string
      loop_run_id?: string
      source?: 'manual' | 'regen'
    }

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
      return corsJson({ error: 'Invalid ASIN format' }, 400)
    }

    const cleanedAsin = asin.trim().toUpperCase()
    const adminClient = createAdminClient()

    const { data: country } = await adminClient
      .from('lb_countries')
      .select('id')
      .eq('amazon_domain', marketplace)
      .single<{ id: string }>()

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
      return corsJson(
        { error: 'No Q&A data found for this ASIN. Run Pass 1 first.' },
        404
      )
    }

    const rufusOnly = row.questions.filter((q) => q.source === 'rufus')

    if (rufusOnly.length < AMY_PASS1_QUESTIONS.length) {
      return corsJson(
        {
          error: `Need at least ${AMY_PASS1_QUESTIONS.length} Rufus answers; have ${rufusOnly.length}. Run Pass 1 first.`,
          found: rufusOnly.length,
          expected: AMY_PASS1_QUESTIONS.length,
        },
        400
      )
    }

    // Try exact match against Amy's 5 framing questions first;
    // fallback to first-5-by-capture-order if extension typed varied phrasings.
    const exact: QAPair[] = []
    for (const norm of AMY_PASS1_NORMALIZED) {
      const match = rufusOnly.find(
        (q) => q.question.toLowerCase().trim() === norm
      )
      if (match) exact.push(match)
    }
    const pass1: QAPair[] =
      exact.length === AMY_PASS1_QUESTIONS.length
        ? exact
        : rufusOnly.slice(0, AMY_PASS1_QUESTIONS.length)

    const result = await persistPass2Questions({
      asin: cleanedAsin,
      countryId: country.id,
      marketplaceDomain: marketplace,
      pass1,
      loopRunId: loop_run_id ?? null,
      source: source ?? 'manual',
      generatedBy: userId,
    })

    return corsJson({
      success: true,
      asin: cleanedAsin,
      marketplace,
      pass2_question_set_id: result.id,
      questions: result.questions,
      questions_count: result.questions.length,
      cost_usd: result.cost_usd,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('generate-pass2 error:', e)
    return corsJson({ error: message }, 500)
  }
}
