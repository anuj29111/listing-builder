/**
 * GET /api/rufus-qna/asin/[asin]?country_id=...
 *
 * Full per-ASIN review payload — every data point in one response.
 * Returns:
 *   - asin meta (marketplace, qa_updated_at)
 *   - All Pass 1 Q&A (matched against Amy's 5 framing questions)
 *   - All "other" rufus Q&A (everything not matching Amy's 5)
 *   - All loop runs (chronological)
 *   - All Pass 2 question sets ever generated for this ASIN
 *   - All synthesis versions
 *   - Review status
 *   - Inferred per-loop-run Pass 2 Q&A pairing (using pass2_question_set.questions
 *     to match against Q&A entries)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { AMY_PASS1_QUESTIONS } from '@/lib/rufus-orchestrator'

interface QAPair {
  question: string
  answer: string
  source?: string
  votes?: number
}

const AMY_NORMALIZED = AMY_PASS1_QUESTIONS.map((q) => q.toLowerCase().trim())

export async function GET(
  request: Request,
  { params }: { params: { asin: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const url = new URL(request.url)
    const countryId = url.searchParams.get('country_id')

    const asin = params.asin?.trim().toUpperCase()
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json({ error: 'Invalid ASIN' }, { status: 400 })
    }

    if (!countryId) {
      return NextResponse.json(
        { error: 'country_id query param is required' },
        { status: 400 }
      )
    }

    // 1. ASIN questions row
    const { data: qaRow } = await adminClient
      .from('lb_asin_questions')
      .select('asin, country_id, marketplace_domain, questions, updated_at, total_questions, fetched_by')
      .eq('asin', asin)
      .eq('country_id', countryId)
      .single<{
        asin: string
        country_id: string
        marketplace_domain: string
        questions: QAPair[] | null
        updated_at: string
        total_questions: number
        fetched_by: string | null
      }>()

    if (!qaRow) {
      return NextResponse.json(
        { error: 'No Q&A data for this ASIN/country' },
        { status: 404 }
      )
    }

    const allQa = qaRow.questions || []
    const rufusQa = allQa.filter((q) => q.source === 'rufus')
    const nonRufusQa = allQa.filter((q) => q.source !== 'rufus')

    // Pass 1 = first 5 Rufus entries by capture order (not exact-text match —
    // playbook rule #2 says vary phrasing per ASIN to dodge Rufus dedup, so
    // legacy data has rephrased framing questions). Going forward orchestrator
    // captures Amy's exact 5 verbatim, so this still works.
    // We also try exact match first as a strict-detection signal for the badge.
    const exactMatches: QAPair[] = []
    for (const norm of AMY_NORMALIZED) {
      const m = rufusQa.find((q) => q.question.toLowerCase().trim() === norm)
      if (m) exactMatches.push(m)
    }
    const pass1Qa: QAPair[] =
      exactMatches.length === AMY_PASS1_QUESTIONS.length
        ? exactMatches
        : rufusQa.slice(0, AMY_PASS1_QUESTIONS.length)

    const pass1QuestionSet = new Set(
      pass1Qa.map((q) => q.question.toLowerCase().trim())
    )
    const otherRufusQa = rufusQa.filter(
      (q) => !pass1QuestionSet.has(q.question.toLowerCase().trim())
    )

    // 2. Loop runs (newest first)
    const { data: runs } = await adminClient
      .from('lb_rufus_loop_runs')
      .select('*')
      .eq('asin', asin)
      .eq('country_id', countryId)
      .order('created_at', { ascending: false })

    // 3. Pass 2 question sets (newest first)
    const { data: pass2Sets } = await adminClient
      .from('lb_rufus_pass2_questions')
      .select(
        'id, loop_run_id, questions, questions_count, pass1_qa_count, model_used, cost_usd, input_tokens, output_tokens, thinking_used, source, generated_at, generated_by'
      )
      .eq('asin', asin)
      .eq('country_id', countryId)
      .order('generated_at', { ascending: false })

    type Pass2Set = {
      id: string
      loop_run_id: string | null
      questions: string[]
      questions_count: number
      pass1_qa_count: number
      model_used: string | null
      cost_usd: number | null
      input_tokens: number | null
      output_tokens: number | null
      thinking_used: boolean | null
      source: string
      generated_at: string
      generated_by: string | null
    }
    const typedPass2: Pass2Set[] = (pass2Sets as unknown as Pass2Set[]) || []

    // For each Pass 2 question set, infer the Q&A pairs from rufusQa
    // by matching question text (case-insensitive)
    const pass2WithAnswers = typedPass2.map((set) => {
      const setQuestionsNorm = (set.questions || []).map((q) =>
        q.toLowerCase().trim()
      )
      const matchedQa = rufusQa.filter((q) =>
        setQuestionsNorm.includes(q.question.toLowerCase().trim())
      )
      // For each question in the set, find the Q&A entry (or null if not yet captured)
      const pairs = (set.questions || []).map((q) => {
        const norm = q.toLowerCase().trim()
        const found = rufusQa.find(
          (e) => e.question.toLowerCase().trim() === norm
        )
        return {
          question: q,
          answer: found?.answer ?? null,
          captured: !!found,
        }
      })
      return {
        ...set,
        answered_count: matchedQa.length,
        pairs,
      }
    })

    // 4. Synthesis versions (newest first)
    const { data: synths } = await adminClient
      .from('lb_rufus_synthesis')
      .select(
        'id, loop_run_id, version, synthesis_md, structured_json, input_qa_total, input_pass1_count, input_pass2_count, model_used, cost_usd, input_tokens, output_tokens, web_searches_used, thinking_used, source, generated_at, generated_by'
      )
      .eq('asin', asin)
      .eq('country_id', countryId)
      .order('version', { ascending: false })

    // 5. Review status
    const { data: review } = await adminClient
      .from('lb_asin_review_status')
      .select('*')
      .eq('asin', asin)
      .eq('country_id', countryId)
      .maybeSingle()

    return NextResponse.json({
      asin: qaRow.asin,
      country_id: qaRow.country_id,
      marketplace_domain: qaRow.marketplace_domain,
      qa_updated_at: qaRow.updated_at,

      qa_counts: {
        total: allQa.length,
        rufus: rufusQa.length,
        pass1: pass1Qa.length,
        other_rufus: otherRufusQa.length,
        non_rufus: nonRufusQa.length,
      },

      pass1_qa: pass1Qa,           // 5 entries (or fewer if incomplete)
      other_rufus_qa: otherRufusQa, // Pass 2 + auto chips, in storage order
      non_rufus_qa: nonRufusQa,    // Oxylabs / amazon-qa imports, kept for completeness

      loop_runs: runs || [],
      pass2_question_sets: pass2WithAnswers,
      synthesis_versions: synths || [],
      review_status: review || null,

      amy_pass1_questions: AMY_PASS1_QUESTIONS,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('asin detail GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
