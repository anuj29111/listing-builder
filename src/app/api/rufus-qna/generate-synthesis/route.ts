/**
 * POST /api/rufus-qna/generate-synthesis
 *
 * Body: { asin: string, marketplace?: string, save_to_item_id?: string }
 *
 * Reads ALL source='rufus' Q&A from lb_asin_questions for this ASIN, then
 * calls Claude to produce a listing_recommendations.md synthesis.
 *
 * Returns the synthesis markdown. If save_to_item_id is provided, also writes
 * synthesis_md to that lb_rufus_job_items row (used by the Amy Loop UI to
 * persist the synthesis next to the loop run that produced it).
 */
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions } from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateSynthesis } from '@/lib/rufus-claude'

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
    await getAuthenticatedUser()

    const body = await request.json()
    const {
      asin,
      marketplace = 'amazon.com',
      save_to_item_id,
    } = body as {
      asin?: string
      marketplace?: string
      save_to_item_id?: string
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

    const synthesis = await generateSynthesis(cleanedAsin, marketplace, rufusOnly)

    // Optionally persist to a job item
    if (save_to_item_id) {
      await adminClient
        .from('lb_rufus_job_items')
        .update({ synthesis_md: synthesis })
        .eq('id', save_to_item_id)
    }

    return corsJson({
      success: true,
      asin: cleanedAsin,
      marketplace,
      qa_count_used: rufusOnly.length,
      synthesis_md: synthesis,
      saved_to_item_id: save_to_item_id ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return corsJson({ error: message }, 401)
    }
    console.error('generate-synthesis error:', e)
    return corsJson({ error: message }, 500)
  }
}
