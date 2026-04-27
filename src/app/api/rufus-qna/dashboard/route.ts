/**
 * GET /api/rufus-qna/dashboard?country_id=...
 *
 * Operations dashboard for the Rufus pipeline.
 * Returns:
 *   - Counts by status (queued, pass1_running, pass2_running, synthesizing, complete, failed)
 *   - Throughput (loops completed today, this week)
 *   - Cost (total today, total all-time, avg per loop)
 *   - Average phase duration (pass1, pass2, synthesis)
 *   - ETA for queue based on observed throughput (mins/hours/days)
 *   - Recent failures (last 10)
 *   - Chrome runner readiness signal (last queue poll time)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const url = new URL(request.url)
    const countryId = url.searchParams.get('country_id')

    const now = Date.now()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const last30dStart = new Date(now - 30 * 24 * 60 * 60 * 1000)

    // 1. Counts by status (current)
    let statusQ = adminClient
      .from('lb_rufus_loop_runs')
      .select('status, total_claude_cost_usd, created_at, synthesis_completed_at, pass1_started_at, pass1_completed_at, pass2_started_at, pass2_completed_at, synthesis_started_at')
    if (countryId) statusQ = statusQ.eq('country_id', countryId)
    const { data: allRuns } = await statusQ

    type RunRow = {
      status: string
      total_claude_cost_usd: number | null
      created_at: string
      synthesis_completed_at: string | null
      pass1_started_at: string | null
      pass1_completed_at: string | null
      pass2_started_at: string | null
      pass2_completed_at: string | null
      synthesis_started_at: string | null
    }
    const runs: RunRow[] = (allRuns as unknown as RunRow[]) || []

    const statusCounts: Record<string, number> = {
      queued: 0,
      pass1_running: 0,
      pass1_done: 0,
      pass2_generating: 0,
      pass2_running: 0,
      pass2_done: 0,
      synthesizing: 0,
      complete: 0,
      failed: 0,
      cancelled: 0,
    }
    for (const r of runs) {
      if (r.status in statusCounts) statusCounts[r.status]++
    }

    // 2. Throughput
    const completedToday = runs.filter(
      (r) =>
        r.status === 'complete' &&
        r.synthesis_completed_at &&
        new Date(r.synthesis_completed_at) >= todayStart
    )
    const completedWeek = runs.filter(
      (r) =>
        r.status === 'complete' &&
        r.synthesis_completed_at &&
        new Date(r.synthesis_completed_at) >= weekStart
    )
    const completedAll = runs.filter((r) => r.status === 'complete')

    // 3. Cost
    const sumCost = (rs: RunRow[]) =>
      rs.reduce(
        (acc, r) => acc + Number(r.total_claude_cost_usd ?? 0),
        0
      )
    const costToday = sumCost(completedToday)
    const costWeek = sumCost(completedWeek)
    const costAll = sumCost(completedAll)
    const avgCostPerLoop =
      completedAll.length > 0 ? costAll / completedAll.length : 0

    // 4. Phase durations (median over last 30 days, complete runs)
    const recentComplete = runs.filter(
      (r) =>
        r.status === 'complete' &&
        r.synthesis_completed_at &&
        new Date(r.synthesis_completed_at) >= last30dStart
    )

    const phaseMs = (start: string | null, end: string | null): number | null => {
      if (!start || !end) return null
      return new Date(end).getTime() - new Date(start).getTime()
    }
    const median = (nums: number[]): number => {
      if (nums.length === 0) return 0
      const sorted = [...nums].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    }

    const pass1Durations = recentComplete
      .map((r) => phaseMs(r.pass1_started_at, r.pass1_completed_at))
      .filter((d): d is number => d !== null && d > 0)
    const pass2Durations = recentComplete
      .map((r) => phaseMs(r.pass2_started_at, r.pass2_completed_at))
      .filter((d): d is number => d !== null && d > 0)
    const synthDurations = recentComplete
      .map((r) => phaseMs(r.synthesis_started_at, r.synthesis_completed_at))
      .filter((d): d is number => d !== null && d > 0)
    const totalDurations = recentComplete
      .map((r) => phaseMs(r.created_at, r.synthesis_completed_at))
      .filter((d): d is number => d !== null && d > 0)

    const medianPass1 = median(pass1Durations)
    const medianPass2 = median(pass2Durations)
    const medianSynth = median(synthDurations)
    const medianTotal = median(totalDurations)

    // 5. ETA — queue depth × median time per loop
    const queueDepth =
      statusCounts.queued +
      statusCounts.pass1_running +
      statusCounts.pass1_done +
      statusCounts.pass2_generating +
      statusCounts.pass2_running +
      statusCounts.pass2_done +
      statusCounts.synthesizing

    const etaMs = medianTotal > 0 ? queueDepth * medianTotal : 0

    // 6. Recent failures (last 10)
    let failQ = adminClient
      .from('lb_rufus_loop_runs')
      .select('id, asin, country_id, status, error_phase, error_message, created_at')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10)
    if (countryId) failQ = failQ.eq('country_id', countryId)
    const { data: failures } = await failQ

    // 7. Chrome runner heartbeat — most recent extension poll
    // We approximate by the most recent lb_rufus_job_items.started_at where status='processing'
    // OR a recent telemetry row if we have one. For now, use job_items.
    const { data: lastPoll } = await adminClient
      .from('lb_rufus_job_items')
      .select('started_at, asin')
      .not('started_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ started_at: string; asin: string }>()

    const lastPollAt = lastPoll?.started_at ?? null
    const lastPollAgoMs = lastPollAt
      ? now - new Date(lastPollAt).getTime()
      : null

    // Runner status: green if poll <2 min, yellow <10 min, red otherwise (or never)
    let runnerStatus: 'green' | 'yellow' | 'red' = 'red'
    if (lastPollAgoMs !== null) {
      if (lastPollAgoMs < 2 * 60 * 1000) runnerStatus = 'green'
      else if (lastPollAgoMs < 10 * 60 * 1000) runnerStatus = 'yellow'
    }

    return NextResponse.json({
      status_counts: statusCounts,
      queue_depth: queueDepth,
      throughput: {
        completed_today: completedToday.length,
        completed_week: completedWeek.length,
        completed_all_time: completedAll.length,
      },
      cost: {
        today_usd: round4(costToday),
        week_usd: round4(costWeek),
        all_time_usd: round4(costAll),
        avg_per_loop_usd: round4(avgCostPerLoop),
      },
      median_durations_ms: {
        pass1: medianPass1,
        pass2: medianPass2,
        synthesis: medianSynth,
        total: medianTotal,
      },
      eta_ms: etaMs,
      eta_human: humanDuration(etaMs),
      recent_failures: failures || [],
      chrome_runner: {
        status: runnerStatus,
        last_poll_at: lastPollAt,
        last_poll_ago_ms: lastPollAgoMs,
        last_poll_asin: lastPoll?.asin ?? null,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('dashboard GET error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function humanDuration(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const hr = Math.round((min / 60) * 10) / 10
  if (hr < 24) return `${hr}h`
  const days = Math.round((hr / 24) * 10) / 10
  return `${days}d`
}
