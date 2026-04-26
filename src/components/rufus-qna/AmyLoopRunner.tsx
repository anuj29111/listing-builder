'use client'

/**
 * Amy Loop Runner
 *
 * UI for the Full Amy Wees Rufus loop:
 *   Pass 1 (5 framing Qs) → Pass 2 (15 generated follow-ups) → Synthesis
 *
 * Workflow:
 *   1. User picks an ASIN + marketplace, clicks "Run Full Amy Loop"
 *   2. Backend creates an lb_rufus_jobs row (loop_mode='full_amy_loop')
 *      and one lb_rufus_job_items row (loop_phase='pass1', custom_questions=Amy's 5)
 *   3. Chrome extension v1.14.0+ picks up the queue item and runs Manual mode
 *   4. On Pass 1 completion, the backend orchestrator generates Pass 2 questions
 *      via Claude and creates a child queue item (loop_phase='pass2')
 *   5. On Pass 2 completion, the orchestrator runs the synthesis via Claude and
 *      writes synthesis_md to both items
 *   6. This component polls /api/rufus-qna/jobs/<job_id> every 5s and renders
 *      the synthesis when it's ready
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  RefreshCw,
} from 'lucide-react'

interface Country {
  id: string
  name: string
  amazon_domain: string
  flag_emoji: string | null
}

interface JobItem {
  id: string
  asin: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  loop_phase?: 'pass1' | 'pass2' | 'single' | 'auto_chips' | null
  custom_questions?: string[] | null
  questions_found?: number
  synthesis_md?: string | null
  parent_item_id?: string | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
}

interface JobDetail {
  id: string
  status: string
  loop_mode?: string | null
  total_asins: number
  completed_asins: number
  failed_asins: number
  created_at: string
  items: JobItem[]
}

interface AmyLoopRunnerProps {
  countries: Country[]
}

const POLL_INTERVAL_MS = 5000

export function AmyLoopRunner({ countries }: AmyLoopRunnerProps) {
  const [asin, setAsin] = useState('')
  const [countryId, setCountryId] = useState(countries[0]?.id || '')
  const [running, setRunning] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Restore active job from sessionStorage (so refresh doesn't lose progress)
  useEffect(() => {
    const stored = sessionStorage.getItem('amy_loop_active_job_id')
    if (stored) setActiveJobId(stored)
  }, [])

  // Persist active job
  useEffect(() => {
    if (activeJobId) {
      sessionStorage.setItem('amy_loop_active_job_id', activeJobId)
    } else {
      sessionStorage.removeItem('amy_loop_active_job_id')
    }
  }, [activeJobId])

  // Fetch job detail
  const fetchJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/rufus-qna/jobs/${jobId}`)
      if (res.ok) {
        const data = await res.json()
        setJobDetail({
          id: jobId,
          ...data.job,
          items: data.items || [],
        })
      }
    } catch {
      // network blip — keep polling
    }
  }, [])

  // Poll while job is active
  useEffect(() => {
    if (!activeJobId) return
    fetchJob(activeJobId)
    pollRef.current = setInterval(() => fetchJob(activeJobId), POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeJobId, fetchJob])

  // Stop polling when job is fully done (synthesis present OR all items terminal)
  useEffect(() => {
    if (!jobDetail) return
    const synthesisReady = jobDetail.items.some((i) => i.synthesis_md)
    const allTerminal = jobDetail.items.every((i) =>
      ['completed', 'failed', 'skipped'].includes(i.status)
    )
    if (synthesisReady || allTerminal) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [jobDetail])

  const cleanedAsin = asin.trim().toUpperCase()
  const validAsin = /^[A-Z0-9]{10}$/.test(cleanedAsin)
  const country = countries.find((c) => c.id === countryId)
  const marketplace = country?.amazon_domain || 'amazon.com'

  // Run full Amy loop
  const handleRunLoop = async () => {
    if (!validAsin || !countryId) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/rufus-qna/run-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: cleanedAsin,
          country_id: countryId,
          marketplace,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start loop')
        return
      }
      setActiveJobId(data.job_id)
      setJobDetail(null) // clear stale
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  // Manually trigger synthesis (rerun)
  const handleRegenSynthesis = async () => {
    const pass1 = jobDetail?.items.find((i) => i.loop_phase === 'pass1')
    if (!pass1) return
    setSynthesisLoading(true)
    try {
      const res = await fetch('/api/rufus-qna/generate-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: pass1.asin,
          marketplace,
          save_to_item_id: pass1.id,
        }),
      })
      if (res.ok && activeJobId) {
        await fetchJob(activeJobId)
      }
    } finally {
      setSynthesisLoading(false)
    }
  }

  // Reset state for a new loop
  const handleReset = () => {
    setActiveJobId(null)
    setJobDetail(null)
    setError(null)
    setAsin('')
  }

  // Derive current phase + status text
  const phaseStatus = derivePhaseStatus(jobDetail)
  const synthesisItem = jobDetail?.items.find((i) => i.synthesis_md)

  return (
    <div className="rounded-lg border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-600 p-2 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-purple-900">
              Amy Loop — Full Rufus Audit
            </h2>
            <p className="text-xs text-purple-700/80 mt-0.5">
              Pass 1 (5 framing Qs) → Pass 2 (15 product-specific follow-ups) → Synthesis (recommendations.md)
            </p>
          </div>
        </div>
        {activeJobId && (
          <button
            onClick={handleReset}
            className="text-xs text-purple-700 hover:text-purple-900 underline"
          >
            New run
          </button>
        )}
      </div>

      {/* Input form */}
      {!activeJobId && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-purple-900/80">ASIN</label>
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="B0XXXXXXXXX"
              className="w-full mt-1 rounded-md border border-purple-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={10}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-purple-900/80">Country</label>
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="w-full mt-1 rounded-md border border-purple-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Run button */}
      {!activeJobId && (
        <button
          onClick={handleRunLoop}
          disabled={!validAsin || !countryId || running}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium py-2.5 text-sm transition"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Starting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Run Full Amy Loop
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Job progress */}
      {activeJobId && jobDetail && (
        <div className="space-y-3">
          <div className="rounded-md bg-white border border-purple-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-mono">
                ASIN {jobDetail.items[0]?.asin || '—'} · job {activeJobId.slice(0, 8)}
              </div>
              <div className="text-xs text-purple-700 font-medium">
                {jobDetail.completed_asins}/{jobDetail.total_asins} phases done
              </div>
            </div>
            <PhaseTimeline phaseStatus={phaseStatus} items={jobDetail.items} />
          </div>

          {/* Synthesis output */}
          {synthesisItem?.synthesis_md && (
            <div className="rounded-md bg-white border-2 border-green-300 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">
                    listing_recommendations.md
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(synthesisItem.synthesis_md || '')
                    }}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                    title="Copy markdown"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    onClick={handleRegenSynthesis}
                    disabled={synthesisLoading}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                    title="Regenerate from current Q&A"
                  >
                    {synthesisLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 bg-gray-50 rounded p-4 max-h-[600px] overflow-auto">
                  {synthesisItem.synthesis_md}
                </pre>
              </div>
            </div>
          )}

          {/* If no synthesis yet but Pass 2 done — show stuck state with manual trigger */}
          {!synthesisItem?.synthesis_md &&
            jobDetail.items.some(
              (i) => i.loop_phase === 'pass2' && i.status === 'completed'
            ) && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm text-yellow-900 mb-2">
                  Pass 2 done but no synthesis written yet — orchestrator may have failed silently.
                </p>
                <button
                  onClick={handleRegenSynthesis}
                  disabled={synthesisLoading}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-700 text-white disabled:opacity-50"
                >
                  {synthesisLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Generate synthesis now
                </button>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// ---------- helpers ----------

interface PhaseStatus {
  pass1: 'pending' | 'processing' | 'completed' | 'failed'
  pass2: 'pending' | 'processing' | 'completed' | 'failed' | 'not_started'
  synthesis: 'pending' | 'completed' | 'not_started'
}

function derivePhaseStatus(job: JobDetail | null): PhaseStatus {
  if (!job) {
    return { pass1: 'pending', pass2: 'not_started', synthesis: 'not_started' }
  }

  const pass1Item = job.items.find((i) => i.loop_phase === 'pass1')
  const pass2Item = job.items.find((i) => i.loop_phase === 'pass2')
  const hasSynth = job.items.some((i) => i.synthesis_md)

  const pass1Status: PhaseStatus['pass1'] = pass1Item
    ? pass1Item.status === 'failed'
      ? 'failed'
      : pass1Item.status === 'completed'
        ? 'completed'
        : pass1Item.status === 'processing'
          ? 'processing'
          : 'pending'
    : 'pending'

  const pass2Status: PhaseStatus['pass2'] = !pass2Item
    ? 'not_started'
    : pass2Item.status === 'failed'
      ? 'failed'
      : pass2Item.status === 'completed'
        ? 'completed'
        : pass2Item.status === 'processing'
          ? 'processing'
          : 'pending'

  const synthesisStatus: PhaseStatus['synthesis'] = hasSynth
    ? 'completed'
    : pass2Status === 'completed'
      ? 'pending'
      : 'not_started'

  return { pass1: pass1Status, pass2: pass2Status, synthesis: synthesisStatus }
}

function PhaseTimeline({
  phaseStatus,
  items,
}: {
  phaseStatus: PhaseStatus
  items: JobItem[]
}) {
  const pass1Item = items.find((i) => i.loop_phase === 'pass1')
  const pass2Item = items.find((i) => i.loop_phase === 'pass2')

  return (
    <div className="grid grid-cols-3 gap-2">
      <PhaseChip
        label="Pass 1"
        sublabel="5 framing Qs"
        status={phaseStatus.pass1}
        count={pass1Item?.questions_found}
      />
      <PhaseChip
        label="Pass 2"
        sublabel="15 follow-ups"
        status={phaseStatus.pass2}
        count={pass2Item?.questions_found}
      />
      <PhaseChip
        label="Synthesis"
        sublabel="recommendations.md"
        status={phaseStatus.synthesis}
      />
    </div>
  )
}

function PhaseChip({
  label,
  sublabel,
  status,
  count,
}: {
  label: string
  sublabel: string
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'not_started'
  count?: number
}) {
  const config: Record<
    string,
    { bg: string; text: string; icon: React.ReactNode; label: string }
  > = {
    not_started: {
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-500',
      icon: <Clock className="h-3 w-3" />,
      label: 'Waiting',
    },
    pending: {
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-700',
      icon: <Clock className="h-3 w-3" />,
      label: 'Queued',
    },
    processing: {
      bg: 'bg-yellow-50 border-yellow-300',
      text: 'text-yellow-800',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: 'Running',
    },
    completed: {
      bg: 'bg-green-50 border-green-300',
      text: 'text-green-800',
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Done',
    },
    failed: {
      bg: 'bg-red-50 border-red-300',
      text: 'text-red-700',
      icon: <XCircle className="h-3 w-3" />,
      label: 'Failed',
    },
  }
  const c = config[status] || config.not_started
  return (
    <div className={`rounded-md border-2 p-2.5 ${c.bg} ${c.text}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold">{label}</div>
        <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide">
          {c.icon} {c.label}
        </div>
      </div>
      <div className="text-[11px] opacity-80">{sublabel}</div>
      {typeof count === 'number' && count > 0 && (
        <div className="text-[11px] mt-1 font-medium">
          {count} answer{count !== 1 ? 's' : ''} captured
        </div>
      )}
    </div>
  )
}
