'use client'

/**
 * AsinReviewTab
 *
 * The product-by-product review screen.
 *   - Filter chips (country, has-synthesis, active-loop, review-status)
 *   - Sort by recent QA / recent synth / priority / asin
 *   - Sortable table of ASINs with stats columns + top-3 preview
 *   - Click row → opens AsinDetailDrawer with full 4-layer view
 *   - Per-row actions: Run loop / Re-synthesize / Mark reviewed
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  Filter,
  ArrowUpDown,
  PlayCircle,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Eye,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { AsinDetailDrawer } from './AsinDetailDrawer'

interface Country {
  id: string
  name: string
  amazon_domain: string
  flag_emoji: string | null
}

interface ReviewRow {
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
  latest_loop_status: string | null
  synthesis_count: number
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

interface ReviewSummary {
  total: number
  with_synthesis: number
  without_synthesis: number
  with_active_loop: number
  not_reviewed: number
  reviewing: number
  reviewed: number
  applied: number
}

const REVIEW_BADGE_COLOR: Record<string, string> = {
  not_reviewed: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-blue-100 text-blue-800',
  applied: 'bg-green-100 text-green-800',
  flagged: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
}

const LOOP_STATUS_COLOR: Record<string, string> = {
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

interface AsinReviewTabProps {
  countries: Country[]
}

export function AsinReviewTab({ countries }: AsinReviewTabProps) {
  const [countryFilter, setCountryFilter] = useState<string>('') // empty = all
  const [reviewFilter, setReviewFilter] = useState<string>('')
  const [synthFilter, setSynthFilter] = useState<string>('') // 'true' | 'false' | ''
  const [activeLoopFilter, setActiveLoopFilter] = useState<string>('')
  const [sort, setSort] = useState<'recent_qa' | 'recent_synth' | 'priority' | 'asin'>('recent_qa')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [openAsin, setOpenAsin] = useState<{
    asin: string
    countryId: string
    marketplace: string
  } | null>(null)
  const [busyAsin, setBusyAsin] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (countryFilter) qs.set('country_id', countryFilter)
      if (reviewFilter) qs.set('review_status', reviewFilter)
      if (synthFilter) qs.set('has_synthesis', synthFilter)
      if (activeLoopFilter) qs.set('active_loop', activeLoopFilter)
      qs.set('sort', sort)
      qs.set('limit', '500')

      const res = await fetch(`/api/rufus-qna/asin-review?${qs.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows || [])
        setSummary(data.summary || null)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [countryFilter, reviewFilter, synthFilter, activeLoopFilter, sort])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleRunLoop = async (row: ReviewRow) => {
    setBusyAsin(row.asin)
    try {
      const res = await fetch('/api/rufus-qna/run-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: row.asin,
          country_id: row.country_id,
          marketplace: row.marketplace_domain,
          source: 'manual',
        }),
      })
      if (res.ok) await fetchRows()
    } finally {
      setBusyAsin(null)
    }
  }

  const handleResynth = async (row: ReviewRow) => {
    setBusyAsin(row.asin)
    try {
      const res = await fetch('/api/rufus-qna/generate-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: row.asin,
          marketplace: row.marketplace_domain,
          source: 'manual_regen',
        }),
      })
      if (res.ok) await fetchRows()
    } finally {
      setBusyAsin(null)
    }
  }

  const handleMarkReviewed = async (row: ReviewRow) => {
    setBusyAsin(row.asin)
    try {
      const res = await fetch(`/api/rufus-qna/asin/${row.asin}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_id: row.country_id,
          status: 'reviewed',
        }),
      })
      if (res.ok) await fetchRows()
    } finally {
      setBusyAsin(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
          <SummaryStat label="Total ASINs" value={summary.total} />
          <SummaryStat label="With synthesis" value={summary.with_synthesis} color="green" />
          <SummaryStat label="Need synthesis" value={summary.without_synthesis} color="amber" />
          <SummaryStat label="Active loop" value={summary.with_active_loop} color="blue" />
          <SummaryStat label="Not reviewed" value={summary.not_reviewed} color="gray" />
          <SummaryStat label="Reviewed" value={summary.reviewed} color="blue" />
          <SummaryStat label="Applied" value={summary.applied} color="green" />
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <Filter className="h-3 w-3" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <FilterSelect
            label="Country"
            value={countryFilter}
            onChange={setCountryFilter}
            options={[
              { value: '', label: 'All countries' },
              ...countries.map((c) => ({
                value: c.id,
                label: `${c.flag_emoji ?? ''} ${c.name}`,
              })),
            ]}
          />
          <FilterSelect
            label="Review status"
            value={reviewFilter}
            onChange={setReviewFilter}
            options={[
              { value: '', label: 'All' },
              { value: 'not_reviewed', label: 'Not reviewed' },
              { value: 'reviewing', label: 'Reviewing' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'applied', label: 'Applied' },
              { value: 'flagged', label: 'Flagged' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <FilterSelect
            label="Has synthesis"
            value={synthFilter}
            onChange={setSynthFilter}
            options={[
              { value: '', label: 'Any' },
              { value: 'true', label: 'With synthesis' },
              { value: 'false', label: 'Without synthesis' },
            ]}
          />
          <FilterSelect
            label="Active loop"
            value={activeLoopFilter}
            onChange={setActiveLoopFilter}
            options={[
              { value: '', label: 'Any' },
              { value: 'true', label: 'Has active loop' },
              { value: 'false', label: 'No active loop' },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={[
              { value: 'recent_qa', label: 'Recent Q&A' },
              { value: 'recent_synth', label: 'Recent synthesis' },
              { value: 'priority', label: 'Priority (high → low)' },
              { value: 'asin', label: 'ASIN (a → z)' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-gray-500">
            {rows.length} row{rows.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={fetchRows}
            className="text-xs text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            No ASINs match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <Th>ASIN</Th>
                  <Th>QA</Th>
                  <Th>Loop</Th>
                  <Th>Synthesis</Th>
                  <Th className="max-w-[280px]">Top 3 / Moat preview</Th>
                  <Th>Review</Th>
                  <Th>Last QA</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const country = countries.find((c) => c.id === r.country_id)
                  return (
                    <tr
                      key={`${r.asin}|${r.country_id}`}
                      className="border-t hover:bg-blue-50/40"
                    >
                      <Td>
                        <div className="font-mono">{r.asin}</div>
                        <div className="text-[10px] text-gray-500">
                          {country?.flag_emoji} {r.marketplace_domain}
                        </div>
                      </Td>
                      <Td>
                        <div className="font-medium">{r.rufus_qa}</div>
                        <div className="text-[10px] text-gray-500">
                          P1 {r.pass1_count} · P2 {r.pass2_inferred_count}
                        </div>
                      </Td>
                      <Td>
                        {r.active_loop_status ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded ${LOOP_STATUS_COLOR[r.active_loop_status] || 'bg-gray-100 text-gray-700'} text-[10px]`}
                          >
                            {r.active_loop_status}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500">
                            {r.latest_loop_status || '—'}
                          </span>
                        )}
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {r.loop_runs_count} run{r.loop_runs_count !== 1 ? 's' : ''}
                        </div>
                      </Td>
                      <Td>
                        {r.latest_synthesis_version ? (
                          <>
                            <div className="font-medium">v{r.latest_synthesis_version}</div>
                            <div className="text-[10px] text-gray-500">
                              {r.latest_synthesis_at
                                ? new Date(r.latest_synthesis_at).toLocaleDateString()
                                : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-amber-700">none</span>
                        )}
                      </Td>
                      <Td>
                        {r.latest_top3_titles && r.latest_top3_titles.length > 0 ? (
                          <ol className="list-decimal list-inside text-[10px] text-gray-700 space-y-0.5 max-w-[280px]">
                            {r.latest_top3_titles.slice(0, 3).map((t, i) => (
                              <li key={i} className="truncate" title={t}>
                                {t}
                              </li>
                            ))}
                          </ol>
                        ) : r.latest_moat ? (
                          <div className="text-[10px] italic text-green-700 truncate" title={r.latest_moat}>
                            {r.latest_moat}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded ${REVIEW_BADGE_COLOR[r.review_status] || 'bg-gray-100 text-gray-700'} text-[10px]`}
                        >
                          {r.review_status}
                        </span>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          P{r.review_priority}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[10px] text-gray-600">
                          {new Date(r.qa_updated_at).toLocaleDateString()}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <IconButton
                            label="View detail"
                            disabled={busyAsin === r.asin}
                            onClick={() =>
                              setOpenAsin({
                                asin: r.asin,
                                countryId: r.country_id,
                                marketplace: r.marketplace_domain,
                              })
                            }
                          >
                            <Eye className="h-3 w-3" />
                          </IconButton>
                          <IconButton
                            label="Run full loop"
                            disabled={busyAsin === r.asin || !!r.active_loop_run_id}
                            onClick={() => handleRunLoop(r)}
                          >
                            {busyAsin === r.asin ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PlayCircle className="h-3 w-3 text-purple-700" />
                            )}
                          </IconButton>
                          <IconButton
                            label="Re-synthesize"
                            disabled={busyAsin === r.asin || r.rufus_qa < 5}
                            onClick={() => handleResynth(r)}
                          >
                            <Sparkles className="h-3 w-3 text-blue-700" />
                          </IconButton>
                          <IconButton
                            label="Mark reviewed"
                            disabled={busyAsin === r.asin || r.review_status === 'reviewed'}
                            onClick={() => handleMarkReviewed(r)}
                          >
                            <CheckCircle2 className="h-3 w-3 text-green-700" />
                          </IconButton>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {openAsin && (
        <AsinDetailDrawer
          asin={openAsin.asin}
          countryId={openAsin.countryId}
          marketplace={openAsin.marketplace}
          onClose={() => setOpenAsin(null)}
          onMutated={fetchRows}
        />
      )}
    </div>
  )
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`text-left p-2 text-[11px] font-semibold text-gray-700 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={`p-2 align-top ${className}`}>{children}</td>
}

function SummaryStat({
  label,
  value,
  color = 'gray',
}: {
  label: string
  value: number
  color?: 'gray' | 'green' | 'amber' | 'blue' | 'red'
}) {
  const colorClass: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className={`rounded p-2 ${colorClass[color]}`}>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px]">{label}</div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-600 font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 rounded-md border bg-background px-2 py-1.5 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="p-1 rounded hover:bg-blue-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
