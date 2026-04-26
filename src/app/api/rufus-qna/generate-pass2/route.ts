/**
 * POST /api/rufus-qna/generate-pass2
 *
 * Body: { asin: string, marketplace?: string }
 *
 * Reads Pass 1 answers from lb_asin_questions for this ASIN, then calls Claude
 * to generate 15 product-specific follow-up questions. Returns the questions
 * but does NOT enqueue them — caller chooses whether to use them.
 *
 * Used for:
 *   - Manual UI flow ("show me what Pass 2 would look like before running it")
 *   - Re-generate Pass 2 if first attempt was poor quality
 *   - Internal call from orchestrator (handlePass1Completion uses generatePass2Questions directly)
 */
import { createAdminClient } from '@/lib/supabase/server'
import { corsJson, corsOptions, validateExtensionKey } from '@/lib/rufus-cors'
import { getAuthenticatedUser } from '@/lib/auth'
import { generatePass2Questions } from '@/lib/rufus-claude'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

const AMY_PASS1_QUESTION_TEXTS = [
  'What is this product for?',
  'What do people like about this product?',
  "What don't people like about this product?",
  'What are people buying instead and why?',
  'Why do people choose this product over alternatives?',
]

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(request: Request) {
  try {
    // Dual auth: session cookie (UI) OR Bearer key (Claude/scripts/cron)
    let authed = false
    try {
      await getAuthenticatedUser()
      authed = true
    } catch {
      const adminCheck = createAdminClient()
      authed = await validateExtensionKey(request, adminCheck)
    }
    if (!authed) {
      return corsJson(
        { error: 'Not authenticated (need session cookie or Rufus Bearer key)' },
        401
      )
    }

    const body = await request.json()
    const { asin, marketplace = 'amazon.com' } = body as {
      asin?: string
      marketplace?: string
    }

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
      return corsJson({ error: 'Invalid ASIN format' }, 400)
    }

    const cleanedAsin = asin.trim().toUpperCase()
    const adminClient = createAdminClient()

    // Resolve country
    const { data: country } = await adminClient
      .from('lb_countries')
      .select('id')
      .eq('amazon_domain', marketplace)
      .single<{ id: string }>()

    if (!country) {
      return corsJson({ error: `Unknown marketplace: ${marketplace}` }, 400)
    }

    // Read Pass 1 answers
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

    // Try to find the 5 Amy framing questions
    const pass1: QAPair[] = []
    for (const amyQ of AMY_PASS1_QUESTION_TEXTS) {
      const norm = amyQ.toLowerCase().trim()
      const match = rufusOnly.find(
        (q) => q.question.toLowerCase().trim() === norm
      )
      if (match) pass1.push(match)
    }

    if (pass1.length < AMY_PASS1_QUESTION_TEXTS.length) {
      return corsJson(
        {
          error: `Pass 1 incomplete: found ${pass1.length}/${AMY_PASS1_QUESTION_TEXTS.length} framing answers. Re-run Pass 1.`,
          found: pass1.length,
          expected: AMY_PASS1_QUESTION_TEXTS.length,
        },
        400
      )
    }

    // Generate Pass 2 via Claude
    const questions = await generatePass2Questions(
      cleanedAsin,
      marketplace,
      pass1
    )

    return corsJson({
      success: true,
      asin: cleanedAsin,
      marketplace,
      pass1_used: pass1.length,
      questions,
      questions_count: questions.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('generate-pass2 error:', e)
    return corsJson({ error: message }, 500)
  }
}
