'use client'

/**
 * AsinDetailDrawer
 *
 * Side drawer (or inline expansion) showing the full per-ASIN payload:
 *   - 4 data layers: Pass 1 Q&A, Pass 2 Question Set, Pass 2 Q&A, Synthesis
 *   - Loop run history
 *   - Synthesis version dropdown
 *   - Review status controls (status / priority / notes)
 *   - Re-run loop, Re-synthesize buttons
 *
 * Reads /api/rufus-qna/asin/[asin]?country_id=...
 */
import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Copy,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ExternalLink,
} from 'lucide-react'

interface AsinDetail {
  asin: string
  country_id: string
  marketplace_domain: string
  qa_updated_at: string
  qa_counts: {
    total: number
    rufus: number
    pass1: number
    other_rufus: number
    non_rufus: number
  }
  pass1_qa: Array<{ question: string; answer: string }>
  other_rufus_qa: Array<{ question: string; answer: string }>
  non_rufus_qa: Array<{ question: string; answer: string; source?: string }>
  loop_runs: Array<{
    id: string
    status: string
    error_message: string | null
    error_phase: string | null
    pass1_started_at: string | null
    pass1_completed_at: string | null
    pass2_questions_generated_at: string | null
    pass2_started_at: string | null
    pass2_completed_at: string | null
    synthesis_completed_at: string | null
    total_claude_cost_usd: number | null
    source: string
    created_at: string
    notes: string | null
  }>
  pass2_question_sets: Array<{
    id: string
    loop_run_id: string | null
    questions: string[]
    questions_count: number
    pass1_qa_count: number
    model_used: string | null
    cost_usd: number | null
    thinking_used: boolean | null
    source: string
    generated_at: string
    answered_count: number
    pairs: Array<{ question: string; answer: string | null; captured: boolean }>
  }>
  synthesis_versions: Array<{
    id: string
    loop_run_id: string | null
    version: number
    synthesis_md: string
    structured_json: Record<string, unknown> | null
    input_qa_total: number
    input_pass1_count: number | null
    input_pass2_count: number | null
    model_used: string | null
    cost_usd: number | null
    web_searches_used: number | null
    thinking_used: boolean | null
    source: string
    generated_at: string
  }>
  review_status: {
    status: string
    priority: number
    notes: string | null
    reviewed_at: string | null
    applied_to_listing_at: string | null
  } | null
  amy_pass1_questions: string[]
}

interface Props {
  asin: string
  countryId: string
  marketplace: string
  onClose: () => void
  onMutated?: () => void
}

const REVIEW_STATUS_OPTIONS = [
  { value: 'not_reviewed', label: 'Not reviewed', color: 'bg-gray-100 text-gray-700' },
  { value: 'reviewing', label: 'Reviewing', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-blue-100 text-blue-800' },
  { value: 'applied', label: 'Applied to listing', color: 'bg-green-100 text-green-800' },
  { value: 'flagged', label: 'Flagged', color: 'bg-red-100 text-red-700' },
  { value: 'archived', label: 'Archived', color: 'bg-gray-100 text-gray-500' },
]

export function AsinDetailDrawer({ asin, countryId, marketplace, onClose, onMutated }: Props) {
  const [data, setData] = useState<AsinDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSynthVersion, setActiveSynthVersion] = useState<number | null>(null)
  const [reSynthing, setReSynthing] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [openLayers, setOpenLayers] = useState<Set<string>>(
    new Set(['pass1', 'pass2_q', 'pass2_qa', 'synthesis'])
  )

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rufus-qna/asin/${asin}?country_id=${encodeURIComponent(countryId)}`
      )
      if (res.ok) {
        const json = await res.json()
        setData(json as AsinDetail)
        if (json.synthesis_versions?.length > 0 && activeSynthVersion === null) {
          setActiveSynthVersion(json.synthesis_versions[0].version)
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [asin, countryId, activeSynthVersion])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const toggleLayer = (id: string) => {
    setOpenLayers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleResynthesize = async () => {
    setReSynthing(true)
    try {
      const res = await fetch('/api/rufus-qna/generate-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin,
          marketplace,
          source: 'manual_regen',
        }),
      })
      if (res.ok) {
        await fetchDetail()
        onMutated?.()
      }
    } finally {
      setReSynthing(false)
    }
  }

  const handleRerunLoop = async () => {
    setRerunning(true)
    try {
      const res = await fetch('/api/rufus-qna/run-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin,
          country_id: countryId,
          marketplace,
          source: 'manual',
        }),
      })
      if (res.ok) {
        await fetchDetail()
        onMutated?.()
      }
    } finally {
      setRerunning(false)
    }
  }

  const handleReviewUpdate = async (
    updates: { status?: string; priority?: number; notes?: string }
  ) => {
    setSavingReview(true)
    try {
      const res = await fetch(`/api/rufus-qna/asin/${asin}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_id: countryId, ...updates }),
      })
      if (res.ok) {
        await fetchDetail()
        onMutated?.()
      }
    } finally {
      setSavingReview(false)
    }
  }

  const activeSynth = data?.synthesis_versions?.find(
    (s) => s.version === activeSynthVersion
  )
  const structured = activeSynth?.structured_json as
    | {
        top_3_critical?: Array<{
          title: string
          description: string
          target_field?: string
          expected_lift?: string
        }>
        tier_2_fixes?: Array<{
          title: string
          description: string
          target_field?: string
        }>
        image_briefs?: Array<{
          filename_hint?: string
          description: string
          use_case?: string
          placement?: string
        }>
        competitors?: Array<{
          name: string
          their_edge: string
          our_edge: string
          price_or_position?: string
        }>
        hidden_risks?: Array<{ risk: string; mitigation: string }>
        moat_statement?: string
        buyer_avatars?: string[]
        use_cases?: string[]
      }
    | undefined

  // The "active" loop run = most recent
  const latestRun = data?.loop_runs?.[0]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Drawer */}
      <div className="w-full max-w-4xl bg-white shadow-2xl overflow-y-auto h-full">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b z-10 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="font-mono text-base font-semibold">{asin}</div>
              <div className="text-xs text-gray-500">{marketplace}</div>
            </div>
            {data && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                  {data.qa_counts.rufus} Rufus Q&A
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {data.synthesis_versions.length} synthesis version
                  {data.synthesis_versions.length !== 1 ? 's' : ''}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  {data.loop_runs.length} loop run
                  {data.loop_runs.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`https://www.${marketplace}/dp/${asin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
            >
              View on Amazon <ExternalLink className="h-3 w-3" />
            </a>
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Action bar */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRerunLoop}
                disabled={rerunning || latestRun?.status === 'queued' || latestRun?.status?.endsWith('_running') || latestRun?.status === 'synthesizing'}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white disabled:bg-purple-300"
              >
                {rerunning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PlayCircle className="h-3 w-3" />
                )}
                Run full loop again
              </button>
              <button
                onClick={handleResynthesize}
                disabled={reSynthing || data.qa_counts.rufus < 5}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300"
              >
                {reSynthing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Re-synthesize from current Q&A
              </button>
            </div>

            {/* Review status panel */}
            <div className="rounded-lg border bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold text-amber-900">Review</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {REVIEW_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleReviewUpdate({ status: opt.value })}
                      disabled={savingReview}
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        data.review_status?.status === opt.value
                          ? `${opt.color} border-amber-400 ring-2 ring-amber-300`
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-amber-900/80">Priority:</span>
                {[1, 2, 3, 4, 5].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleReviewUpdate({ priority: p })}
                    disabled={savingReview}
                    className={`w-6 h-6 rounded text-xs font-medium ${
                      data.review_status?.priority === p
                        ? 'bg-amber-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-amber-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <span className="text-amber-900/60 ml-2">(1=high)</span>
                {data.review_status?.reviewed_at && (
                  <span className="ml-2 text-amber-900/70">
                    Reviewed {new Date(data.review_status.reviewed_at).toLocaleString()}
                  </span>
                )}
                {data.review_status?.applied_to_listing_at && (
                  <span className="ml-2 text-green-800/80">
                    Applied {new Date(data.review_status.applied_to_listing_at).toLocaleString()}
                  </span>
                )}
              </div>
              <textarea
                value={data.review_status?.notes ?? ''}
                onChange={(e) => {
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          review_status: {
                            status: prev.review_status?.status ?? 'not_reviewed',
                            priority: prev.review_status?.priority ?? 3,
                            reviewed_at: prev.review_status?.reviewed_at ?? null,
                            applied_to_listing_at:
                              prev.review_status?.applied_to_listing_at ?? null,
                            notes: e.target.value,
                          },
                        }
                      : prev
                  )
                }}
                onBlur={(e) =>
                  handleReviewUpdate({ notes: e.target.value })
                }
                placeholder="Notes for this ASIN review (saved on blur)..."
                rows={2}
                className="w-full text-[11px] rounded border border-amber-300 bg-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Loop runs timeline */}
            {data.loop_runs.length > 0 && (
              <SectionToggle
                id="loop_runs"
                title={`📋 Loop runs (${data.loop_runs.length})`}
                isOpen={openLayers.has('loop_runs')}
                onToggle={toggleLayer}
              >
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {data.loop_runs.map((run) => (
                    <LoopRunRow key={run.id} run={run} />
                  ))}
                </div>
              </SectionToggle>
            )}

            {/* LAYER 1: Pass 1 Q&A */}
            <SectionToggle
              id="pass1"
              title={`📚 Layer 1 — Pass 1 Q&A (${data.qa_counts.pass1}/5)`}
              isOpen={openLayers.has('pass1')}
              onToggle={toggleLayer}
            >
              <div className="space-y-2">
                {data.amy_pass1_questions.map((q, i) => {
                  const qa = data.pass1_qa.find(
                    (e) => e.question.toLowerCase().trim() === q.toLowerCase().trim()
                  )
                  return (
                    <div
                      key={i}
                      className={`rounded border p-2 text-xs ${qa ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className="font-medium text-gray-900">
                        Q{i + 1}: {q}
                      </div>
                      {qa ? (
                        <div className="mt-1 text-gray-700 whitespace-pre-wrap">
                          {qa.answer}
                        </div>
                      ) : (
                        <div className="mt-1 italic text-gray-400">
                          (not yet captured)
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SectionToggle>

            {/* LAYER 2: Pass 2 question sets (Claude-generated) */}
            <SectionToggle
              id="pass2_q"
              title={`🤖 Layer 2 — Pass 2 Generated Questions (${data.pass2_question_sets.length} set${data.pass2_question_sets.length !== 1 ? 's' : ''})`}
              isOpen={openLayers.has('pass2_q')}
              onToggle={toggleLayer}
            >
              {data.pass2_question_sets.length === 0 ? (
                <div className="text-xs italic text-gray-500">
                  No Pass 2 question sets generated yet — run the full loop or trigger Pass 2 generator.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.pass2_question_sets.map((set) => (
                    <div
                      key={set.id}
                      className="rounded border border-purple-200 bg-purple-50/40 p-2"
                    >
                      <div className="flex items-center justify-between text-[11px] text-purple-900/80 mb-1">
                        <div>
                          {new Date(set.generated_at).toLocaleString()} ·{' '}
                          {set.model_used} · {set.questions_count} Qs ·{' '}
                          {set.thinking_used ? 'thinking ON' : 'thinking OFF'} · $
                          {Number(set.cost_usd ?? 0).toFixed(3)} ·{' '}
                          <span className="text-purple-800 font-medium">
                            {set.answered_count}/{set.questions_count} answered
                          </span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          {set.source}
                        </span>
                      </div>
                      <ol className="list-decimal list-inside space-y-0.5 text-xs text-gray-800">
                        {set.questions.map((q, i) => {
                          const pair = set.pairs[i]
                          return (
                            <li
                              key={i}
                              className={pair?.captured ? '' : 'text-gray-400 italic'}
                            >
                              {q}{' '}
                              {pair?.captured && (
                                <CheckCircle2 className="inline h-3 w-3 text-green-600" />
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </SectionToggle>

            {/* LAYER 3: Pass 2 Q&A (raw answers) */}
            <SectionToggle
              id="pass2_qa"
              title={`💬 Layer 3 — Pass 2 Q&A (${data.qa_counts.other_rufus} answers)`}
              isOpen={openLayers.has('pass2_qa')}
              onToggle={toggleLayer}
            >
              {data.other_rufus_qa.length === 0 ? (
                <div className="text-xs italic text-gray-500">
                  No Pass 2 / follow-up Q&A captured yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {data.other_rufus_qa.map((qa, i) => (
                    <div key={i} className="rounded border bg-blue-50/40 border-blue-200 p-2 text-xs">
                      <div className="font-medium text-gray-900">{qa.question}</div>
                      <div className="mt-1 text-gray-700 whitespace-pre-wrap">{qa.answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionToggle>

            {/* LAYER 4: Synthesis (with version dropdown) */}
            <SectionToggle
              id="synthesis"
              title={`✨ Layer 4 — Synthesis (${data.synthesis_versions.length} version${data.synthesis_versions.length !== 1 ? 's' : ''})`}
              isOpen={openLayers.has('synthesis')}
              onToggle={toggleLayer}
            >
              {data.synthesis_versions.length === 0 ? (
                <div className="text-xs italic text-gray-500">
                  No synthesis yet — click "Re-synthesize from current Q&A" above (need {Math.max(0, 5 - data.qa_counts.rufus)} more Rufus Q&A).
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Version picker */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-700">Version:</span>
                    {data.synthesis_versions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setActiveSynthVersion(s.version)}
                        className={`text-[11px] px-2 py-0.5 rounded border ${
                          activeSynthVersion === s.version
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'
                        }`}
                        title={`v${s.version} · ${s.model_used} · $${Number(s.cost_usd ?? 0).toFixed(3)} · ${s.web_searches_used ?? 0} web searches`}
                      >
                        v{s.version}
                        <span className="ml-1 opacity-70">
                          {new Date(s.generated_at).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Active synthesis: structured cards */}
                  {activeSynth && (
                    <>
                      <div className="text-[11px] text-gray-500 flex flex-wrap gap-2">
                        <span>{activeSynth.model_used}</span>
                        <span>·</span>
                        <span>{activeSynth.input_qa_total} Q&A in</span>
                        <span>·</span>
                        <span>${Number(activeSynth.cost_usd ?? 0).toFixed(3)}</span>
                        <span>·</span>
                        <span>{activeSynth.web_searches_used ?? 0} web searches</span>
                        <span>·</span>
                        <span>{activeSynth.thinking_used ? 'thinking ON' : 'thinking OFF'}</span>
                        <span>·</span>
                        <span>{activeSynth.source}</span>
                        <span>·</span>
                        <span>{new Date(activeSynth.generated_at).toLocaleString()}</span>
                      </div>

                      {structured ? (
                        <StructuredSynthesisView structured={structured} />
                      ) : (
                        <div className="text-[11px] italic text-amber-700 bg-amber-50 rounded px-2 py-1">
                          Structured JSON not parsed for this version (older format). Markdown below is still complete.
                        </div>
                      )}

                      {/* Markdown view */}
                      <details className="rounded border bg-gray-50">
                        <summary className="cursor-pointer text-xs font-medium text-gray-700 px-2 py-1 hover:bg-gray-100 flex items-center justify-between">
                          <span>Full markdown ({activeSynth.synthesis_md.length.toLocaleString()} chars)</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(activeSynth.synthesis_md)
                            }}
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                        </summary>
                        <pre className="px-3 py-2 whitespace-pre-wrap font-sans text-xs text-gray-900 max-h-96 overflow-y-auto">
                          {activeSynth.synthesis_md}
                        </pre>
                      </details>
                    </>
                  )}
                </div>
              )}
            </SectionToggle>

            {/* Other QA (Oxylabs / amazon-qa) */}
            {data.qa_counts.non_rufus > 0 && (
              <SectionToggle
                id="non_rufus"
                title={`📂 Other Q&A (${data.qa_counts.non_rufus} non-Rufus entries)`}
                isOpen={openLayers.has('non_rufus')}
                onToggle={toggleLayer}
              >
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {data.non_rufus_qa.map((qa, i) => (
                    <div key={i} className="rounded border bg-gray-50 p-2 text-xs">
                      <div className="font-medium text-gray-900">
                        {qa.question}
                        {qa.source && (
                          <span className="ml-2 px-1 py-0.5 rounded bg-gray-200 text-[10px] text-gray-700">
                            {qa.source}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-gray-700 whitespace-pre-wrap">
                        {qa.answer}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionToggle>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionToggle({
  id,
  title,
  isOpen,
  onToggle,
  children,
}: {
  id: string
  title: string
  isOpen: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-white">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-2 p-3 hover:bg-gray-50 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {isOpen && <div className="border-t p-3">{children}</div>}
    </div>
  )
}

function LoopRunRow({
  run,
}: {
  run: AsinDetail['loop_runs'][number]
}) {
  const statusColor: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-700',
    pass1_running: 'bg-yellow-100 text-yellow-800',
    pass1_done: 'bg-blue-100 text-blue-700',
    pass2_generating: 'bg-purple-100 text-purple-700',
    pass2_running: 'bg-yellow-100 text-yellow-800',
    pass2_done: 'bg-blue-100 text-blue-700',
    synthesizing: 'bg-indigo-100 text-indigo-800',
    complete: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  return (
    <div className="rounded border p-2 text-[11px] flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 rounded ${statusColor[run.status] || 'bg-gray-100 text-gray-700'}`}
        >
          {run.status}
        </span>
        <span className="text-gray-700">{run.source}</span>
        <span className="text-gray-500">
          {new Date(run.created_at).toLocaleString()}
        </span>
        {run.error_message && (
          <span className="text-red-700 truncate max-w-xs" title={run.error_message}>
            <AlertTriangle className="h-3 w-3 inline" /> {run.error_phase}
          </span>
        )}
      </div>
      <div className="text-gray-500">
        ${Number(run.total_claude_cost_usd ?? 0).toFixed(3)}
      </div>
    </div>
  )
}

function StructuredSynthesisView({
  structured,
}: {
  structured: NonNullable<
    ReturnType<typeof structuredOf>
  >
}) {
  return (
    <div className="space-y-3">
      {/* Top 3 critical */}
      {structured.top_3_critical && structured.top_3_critical.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-red-800 mb-1">🔴 Top 3 critical changes</div>
          <div className="grid grid-cols-1 gap-2">
            {structured.top_3_critical.map((c, i) => (
              <div
                key={i}
                className="rounded border border-red-200 bg-red-50 p-2 text-xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-red-900">{i + 1}. {c.title}</span>
                  {c.target_field && (
                    <span className="px-1 py-0.5 rounded bg-red-200 text-red-800 text-[10px]">
                      {c.target_field}
                    </span>
                  )}
                  {c.expected_lift && (
                    <span className="px-1 py-0.5 rounded bg-green-200 text-green-800 text-[10px]">
                      +{c.expected_lift}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-gray-800">{c.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tier 2 fixes */}
      {structured.tier_2_fixes && structured.tier_2_fixes.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-yellow-800 mb-1">
            🟡 Tier 2 fixes ({structured.tier_2_fixes.length})
          </div>
          <ul className="space-y-1 text-xs">
            {structured.tier_2_fixes.map((f, i) => (
              <li key={i} className="rounded border bg-yellow-50 border-yellow-200 p-1.5">
                <span className="font-medium text-yellow-900">{f.title}</span>
                {f.target_field && (
                  <span className="ml-2 px-1 py-0.5 rounded bg-yellow-200 text-yellow-800 text-[10px]">
                    {f.target_field}
                  </span>
                )}
                <div className="text-gray-800 text-[11px] mt-0.5">{f.description}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Image briefs */}
      {structured.image_briefs && structured.image_briefs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-pink-800 mb-1">
            🆕 Image briefs ({structured.image_briefs.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {structured.image_briefs.map((b, i) => (
              <div key={i} className="rounded border bg-pink-50 border-pink-200 p-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {b.placement && (
                    <span className="px-1 py-0.5 rounded bg-pink-200 text-pink-800 text-[10px]">
                      {b.placement}
                    </span>
                  )}
                  {b.use_case && (
                    <span className="text-[10px] text-pink-700 italic">
                      {b.use_case}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-gray-800">{b.description}</div>
                {b.filename_hint && (
                  <div className="mt-1 text-[10px] text-pink-700 font-mono">
                    {b.filename_hint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {structured.competitors && structured.competitors.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-orange-800 mb-1">
            🆚 Competitor positioning
          </div>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-orange-50">
                <tr>
                  <th className="text-left p-1.5 font-medium text-orange-900">Competitor</th>
                  <th className="text-left p-1.5 font-medium text-orange-900">Their edge</th>
                  <th className="text-left p-1.5 font-medium text-orange-900">Our edge</th>
                  <th className="text-left p-1.5 font-medium text-orange-900">Position</th>
                </tr>
              </thead>
              <tbody>
                {structured.competitors.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5 font-medium">{c.name}</td>
                    <td className="p-1.5 text-gray-700">{c.their_edge}</td>
                    <td className="p-1.5 text-gray-700">{c.our_edge}</td>
                    <td className="p-1.5 text-gray-500">{c.price_or_position || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden risks */}
      {structured.hidden_risks && structured.hidden_risks.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-purple-800 mb-1">
            ⚠️ Hidden risks
          </div>
          <ul className="space-y-1 text-xs">
            {structured.hidden_risks.map((r, i) => (
              <li
                key={i}
                className="rounded border border-purple-200 bg-purple-50 p-1.5"
              >
                <span className="font-medium text-purple-900">{r.risk}</span>
                <div className="text-gray-700 text-[11px] mt-0.5">
                  → {r.mitigation}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Buyer avatars + use cases */}
      {(structured.buyer_avatars?.length || structured.use_cases?.length) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {structured.buyer_avatars && structured.buyer_avatars.length > 0 && (
            <div className="rounded border bg-cyan-50 border-cyan-200 p-2 text-xs">
              <div className="font-semibold text-cyan-900 mb-1">👤 Buyer avatars</div>
              <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                {structured.buyer_avatars.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {structured.use_cases && structured.use_cases.length > 0 && (
            <div className="rounded border bg-cyan-50 border-cyan-200 p-2 text-xs">
              <div className="font-semibold text-cyan-900 mb-1">🎯 Use cases</div>
              <ul className="list-disc list-inside text-gray-800 space-y-0.5">
                {structured.use_cases.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Moat */}
      {structured.moat_statement && (
        <div className="rounded border-2 border-green-300 bg-green-50 p-3">
          <div className="text-xs font-semibold text-green-900 mb-1">💪 Moat statement</div>
          <div className="text-sm text-green-900 italic">
            "{structured.moat_statement}"
          </div>
        </div>
      )}
    </div>
  )
}

// Helper used only for the type signature of StructuredSynthesisView's prop
function structuredOf(): {
  top_3_critical?: Array<{
    title: string
    description: string
    target_field?: string
    expected_lift?: string
  }>
  tier_2_fixes?: Array<{
    title: string
    description: string
    target_field?: string
  }>
  image_briefs?: Array<{
    filename_hint?: string
    description: string
    use_case?: string
    placement?: string
  }>
  competitors?: Array<{
    name: string
    their_edge: string
    our_edge: string
    price_or_position?: string
  }>
  hidden_risks?: Array<{ risk: string; mitigation: string }>
  moat_statement?: string
  buyer_avatars?: string[]
  use_cases?: string[]
} {
  return {}
}
