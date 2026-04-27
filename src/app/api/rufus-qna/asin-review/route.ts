/**
 * GET /api/rufus-qna/asin-review
 *
 * Query params:
 *   country_id?: string                  filter to one marketplace
 *   review_status?: string               filter by review status (not_reviewed/reviewing/reviewed/applied/archived/flagged)
 *   has_synthesis?: 'true'|'false'       only ASINs with/without a synthesis
 *   active_loop?: 'true'|'false'         only ASINs with an active loop run
 *   sort?: 'recent_qa'|'recent_synth'|'priority'|'asin'    default 'recent_qa'
 *   limit?: number                       default 200, max 1000
 *
 * Returns aggregated stats per ASIN for the review table:
 *   - QA counts (total / rufus / pass1 detected / pass2 detected)
 *   - Loop run counts + latest status
 *   - Synthesis: latest version, generated_at, cost
 *   - Review status fields
 *   - Top 3 critical fixes (extracted from latest structured_json)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { AMY_PASS1_QUESTIONS } from '@/lib/rufus-orchestrator'

interface QAPair {
  question: string
  answer: string
  source?: string
}

interface AsinReviewRow {
  asin: string
  country_id: string
  marketplace_domain: string
  total_qa: number
  rufus_qa: number
  pass1_count: number
  pass2_inferred_count: number
  loop_runs_count: number
  active_loop_run_id: string | null
  active_loop_status: string | null
  latest_loop_run_id: string | null
  latest_loop_status: string | null
  synthesis_count: number
  latest_synthesis_id: string | null
  latest_synthesis_version: number | null
  latest_synthesis_at: string | null
  latest_synthesis_cost_usd: number | null
  latest_top3_titles: string[] | null
  latest_moat: string | null
  review_status: string
  review_priority: number
  reviewed_at: string | null
  applied_to_listing_at: string | null
  qa_updated_at: string
}

const AMY_NORMALIZED = AMY_PASS1_QUESTIONS.map((q) => q.toLowerCase().trim())

const ACTIVE_STATUSES = [
  'queued',
  'pass1_running',
  'pass1_done',
  'pass2_generating',
  'pass2_running',
  'pass2_done',
  'synthesizing',
]

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const url = new URL(request.url)

    const countryId = url.searchParams.get('country_id')
    const reviewStatus = url.searchParams.get('review_status')
    const hasSynthesisFilter = url.searchParams.get('has_synthesis')
    const activeLoopFilter = url.searchParams.get('active_loop')
    const sort = url.searchParams.get('sort') || 'recent_qa'
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '200', 10) || 200,
      1000
    )

    // Step 1: pull all asin_questions rows (these define the universe of "ASINs we have data for")
    let qaQuery = adminClient
      .from('lb_asin_questions')
      .select('asin, country_id, marketplace_domain, questions, updated_at')
    if (countryId) qaQuery = qaQuery.eq('country_id', countryId)
    const { data: qaRows, error: qaErr } = await qaQuery

    if (qaErr) {
      return NextResponse.json({ error: qaErr.message }, { status: 500 })
    }

    if (!qaRows || qaRows.length === 0) {
      return NextResponse.json({ rows: [], summary: zeroSummary() })
    }

    type QaRow = {
      asin: string
      country_id: string
      marketplace_domain: string | null
      questions: QAPair[] | null
      updated_at: string
    }
    const typedQa = qaRows as unknown as QaRow[]

    // Filter to rows that have at least 1 rufus entry
    const interesting = typedQa.filter(
      (r) =>
        Array.isArray(r.questions) &&
        r.questions.some((q) => q.source === 'rufus')
    )

    if (interesting.length === 0) {
      return NextResponse.json({ rows: [], summary: zeroSummary() })
    }

    const asins = interesting.map((r) => r.asin)
    const countryIds = Array.from(new Set(interesting.map((r) => r.country_id)))

    // Step 2: pull loop_runs for those (asin, country_id) pairs
    const { data: runs } = await adminClient
      .from('lb_rufus_loop_runs')
      .select(
        'id, asin, country_id, status, created_at, total_claude_cost_usd, error_message'
      )
      .in('asin', asins)
      .in('country_id', countryIds)
      .order('created_at', { ascending: false })

    type RunRow = {
      id: string
      asin: string
      country_id: string
      status: string
      created_at: string
      total_claude_cost_usd: number | null
      error_message: string | null
    }
    const typedRuns: RunRow[] = (runs as unknown as RunRow[]) || []

    // Step 3: pull synthesis rows
    const { data: synths } = await adminClient
      .from('lb_rufus_synthesis')
      .select(
        'id, asin, country_id, version, generated_at, cost_usd, structured_json'
      )
      .in('asin', asins)
      .in('country_id', countryIds)
      .order('version', { ascending: false })

    type SynthRow = {
      id: string
      asin: string
      country_id: string
      version: number
      generated_at: string
      cost_usd: number | null
      structured_json: {
        top_3_critical?: Array<{ title: string }>
        moat_statement?: string
      } | null
    }
    const typedSynths: SynthRow[] = (synths as unknown as SynthRow[]) || []

    // Step 4: pull review_status rows
    const { data: reviews } = await adminClient
      .from('lb_asin_review_status')
      .select(
        'asin, country_id, status, priority, reviewed_at, applied_to_listing_at'
      )
      .in('asin', asins)
      .in('country_id', countryIds)

    type ReviewRow = {
      asin: string
      country_id: string
      status: string
      priority: number
      reviewed_at: string | null
      applied_to_listing_at: string | null
    }
    const typedReviews: ReviewRow[] = (reviews as unknown as ReviewRow[]) || []

    const reviewByKey = new Map<string, ReviewRow>()
    for (const r of typedReviews) {
      reviewByKey.set(`${r.asin}|${r.country_id}`, r)
    }

    // Build the result rows
    const rows: AsinReviewRow[] = interesting.map((qa) => {
      const key = `${qa.asin}|${qa.country_id}`
      const rufusQa = (qa.questions || []).filter((q) => q.source === 'rufus')
      const totalQa = (qa.questions || []).length
      const pass1Count = rufusQa.filter((q) =>
        AMY_NORMALIZED.includes(q.question.toLowerCase().trim())
      ).length
      const pass2InferredCount = rufusQa.length - pass1Count

      const allRunsForAsin = typedRuns.filter(
        (r) => r.asin === qa.asin && r.country_id === qa.country_id
      )
      const activeRun = allRunsForAsin.find((r) =>
        ACTIVE_STATUSES.includes(r.status)
      )
      const latestRun = allRunsForAsin[0] // already sorted desc

      const allSynthsForAsin = typedSynths.filter(
        (s) => s.asin === qa.asin && s.country_id === qa.country_id
      )
      const latestSynth = allSynthsForAsin[0]

      const review = reviewByKey.get(key)

      const top3 = latestSynth?.structured_json?.top_3_critical
      const top3Titles =
        top3 && Array.isArray(top3) ? top3.map((t) => t.title) : null

      return {
        asin: qa.asin,
        country_id: qa.country_id,
        marketplace_domain: qa.marketplace_domain || 'amazon.com',
        total_qa: totalQa,
        rufus_qa: rufusQa.length,
        pass1_count: pass1Count,
        pass2_inferred_count: pass2InferredCount,
        loop_runs_count: allRunsForAsin.length,
        active_loop_run_id: activeRun?.id ?? null,
        active_loop_status: activeRun?.status ?? null,
        latest_loop_run_id: latestRun?.id ?? null,
        latest_loop_status: latestRun?.status ?? null,
        synthesis_count: allSynthsForAsin.length,
        latest_synthesis_id: latestSynth?.id ?? null,
        latest_synthesis_version: latestSynth?.version ?? null,
        latest_synthesis_at: latestSynth?.generated_at ?? null,
        latest_synthesis_cost_usd: latestSynth?.cost_usd
          ? Number(latestSynth.cost_usd)
          : null,
        latest_top3_titles: top3Titles,
        latest_moat: latestSynth?.structured_json?.moat_statement ?? null,
        review_status: review?.status ?? 'not_reviewed',
        review_priority: review?.priority ?? 3,
        reviewed_at: review?.reviewed_at ?? null,
        applied_to_listing_at: review?.applied_to_listing_at ?? null,
        qa_updated_at: qa.updated_at,
      }
    })

    // Apply filters
    let filtered = rows
    if (reviewStatus) {
      filtered = filtered.filter((r) => r.review_status === reviewStatus)
    }
    if (hasSynthesisFilter === 'true') {
      filtered = filtered.filter((r) => r.synthesis_count > 0)
    } else if (hasSynthesisFilter === 'false') {
      filtered = filtered.filter((r) => r.synthesis_count === 0)
    }
    if (activeLoopFilter === 'true') {
      filtered = filtered.filter((r) => r.active_loop_run_id !== null)
    } else if (activeLoopFilter === 'false') {
      filtered = filtered.filter((r) => r.active_loop_run_id === null)
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case 'recent_synth':
          return (
            (b.latest_synthesis_at || '').localeCompare(a.latest_synthesis_at || '')
          )
        case 'priority':
          return a.review_priority - b.review_priority
        case 'asin':
          return a.asin.localeCompare(b.asin)
        case 'recent_qa':
        default:
          return b.qa_updated_at.localeCompare(a.qa_updated_at)
      }
    })

    const summary = {
      total: rows.length,
      with_synthesis: rows.filter((r) => r.synthesis_count > 0).length,
      without_synthesis: rows.filter((r) => r.synthesis_count === 0).length,
      with_active_loop: rows.filter((r) => r.active_loop_run_id !== null).length,
      not_reviewed: rows.filter((r) => r.review_status === 'not_reviewed').length,
      reviewing: rows.filter((r) => r.review_status === 'reviewing').length,
      reviewed: rows.filter((r) => r.review_status === 'reviewed').length,
      applied: rows.filter((r) => r.review_status === 'applied').length,
    }

    return NextResponse.json({
      rows: filtered.slice(0, limit),
      total_filtered: filtered.length,
      summary,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('asin-review GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function zeroSummary() {
  return {
    total: 0,
    with_synthesis: 0,
    without_synthesis: 0,
    with_active_loop: 0,
    not_reviewed: 0,
    reviewing: 0,
    reviewed: 0,
    applied: 0,
  }
}
