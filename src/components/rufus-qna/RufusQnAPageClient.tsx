'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bot,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  PlayCircle,
  Sparkles,
  ListChecks,
  Upload,
  Activity,
} from 'lucide-react'
import type { LbRufusJob, LbRufusJobItem } from '@/types'
import { QnADetailPanel } from './QnADetailPanel'
import { AmyLoopRunner } from './AmyLoopRunner'
import { AsinReviewTab } from './AsinReviewTab'
import { BulkEnqueueTab } from './BulkEnqueueTab'
import { RufusDashboardWidget } from './RufusDashboardWidget'

interface Country {
  id: string
  name: string
  code: string
  amazon_domain: string
  flag_emoji: string | null
  is_active: boolean
}

interface MIRecord {
  id: string
  keyword: string
  keywords: string[] | null
  country_id: string
  marketplace_domain: string
  selected_asins: string[] | null
  status: string
  created_at: string
}

interface JobWithItems extends LbRufusJob {
  items?: LbRufusJobItem[]
}

interface RufusQnAPageClientProps {
  countries: Country[]
  miRecords: MIRecord[]
}

type TabId = 'run' | 'review' | 'bulk' | 'legacy'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode; description: string }> = [
  {
    id: 'review',
    label: 'ASIN Review',
    icon: <ListChecks className="h-4 w-4" />,
    description: 'Product-by-product review of every captured Q&A + synthesis',
  },
  {
    id: 'run',
    label: 'Run Single',
    icon: <PlayCircle className="h-4 w-4" />,
    description: 'Run the full Amy loop on one ASIN',
  },
  {
    id: 'bulk',
    label: 'Bulk Run',
    icon: <Upload className="h-4 w-4" />,
    description: 'Enqueue many ASINs at once',
  },
  {
    id: 'legacy',
    label: 'Legacy Jobs',
    icon: <Activity className="h-4 w-4" />,
    description: 'Old auto-chips / manual extension jobs',
  },
]

export function RufusQnAPageClient({ countries, miRecords }: RufusQnAPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('review')

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Rufus Q&A</h1>
          <p className="text-sm text-muted-foreground">
            Capture how Amazon Rufus sees every product · synthesize listing improvements · review product-by-product.
          </p>
        </div>
      </div>

      {/* Pipeline status banner */}
      <RufusDashboardWidget />

      {/* Tabs */}
      <div className="border-b border-gray-200 flex items-end gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 -mb-px text-sm font-medium border-b-2 transition flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
            title={t.description}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'review' && <AsinReviewTab countries={countries} />}
      {activeTab === 'run' && <AmyLoopRunner countries={countries} />}
      {activeTab === 'bulk' && <BulkEnqueueTab countries={countries} />}
      {activeTab === 'legacy' && (
        <LegacyJobsTab countries={countries} miRecords={miRecords} />
      )}
    </div>
  )
}

// ============================================================================
// Legacy Jobs tab — preserves old auto-chips / manual extension flow
// (was the main UI before Session 126 — kept for back-compat / debugging)
// ============================================================================
function LegacyJobsTab({
  countries,
  miRecords,
}: {
  countries: Country[]
  miRecords: MIRecord[]
}) {
  const [selectedCountryId, setSelectedCountryId] = useState(countries[0]?.id || '')
  const [inputMode, setInputMode] = useState<'manual' | 'mi'>('manual')
  const [asinInput, setAsinInput] = useState('')
  const [selectedMiId, setSelectedMiId] = useState('')
  const [creating, setCreating] = useState(false)

  const [jobs, setJobs] = useState<JobWithItems[]>([])
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [expandedAsin, setExpandedAsin] = useState<{ asin: string; countryId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/rufus-qna/jobs')
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchJobDetails = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/rufus-qna/jobs/${jobId}`)
      if (res.ok) {
        const data = await res.json()
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, items: data.items } : j))
        )
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === 'queued' || j.status === 'processing'
    )
    if (hasActive) {
      pollRef.current = setInterval(() => {
        fetchJobs()
        if (expandedJobId) fetchJobDetails(expandedJobId)
      }, 5000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs, expandedJobId, fetchJobs, fetchJobDetails])

  const handleCreateJob = async () => {
    setCreating(true)
    try {
      let body: Record<string, unknown>
      if (inputMode === 'mi') {
        if (!selectedMiId) return
        body = { source: 'market_intelligence', market_intelligence_id: selectedMiId }
      } else {
        const asins = asinInput
          .split(/[\n,;]+/)
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z0-9]{10}$/.test(s))
        if (asins.length === 0) return
        body = { source: 'manual', country_id: selectedCountryId, asins }
      }
      const res = await fetch('/api/rufus-qna/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setAsinInput('')
        setSelectedMiId('')
        await fetchJobs()
      }
    } finally {
      setCreating(false)
    }
  }

  const handleCancelJob = async (jobId: string) => {
    const res = await fetch(`/api/rufus-qna/jobs/${jobId}`, { method: 'DELETE' })
    if (res.ok) await fetchJobs()
  }

  const handleToggleJob = (jobId: string) => {
    if (expandedJobId === jobId) setExpandedJobId(null)
    else {
      setExpandedJobId(jobId)
      fetchJobDetails(jobId)
    }
  }

  const handleCopyPending = (job: JobWithItems) => {
    const pending = (job.items || [])
      .filter((item) => item.status === 'pending')
      .map((item) => item.asin)
    if (pending.length > 0) navigator.clipboard.writeText(pending.join('\n'))
  }

  const getCountry = (countryId: string) => countries.find((c) => c.id === countryId)
  const getMiLabel = (mi: MIRecord) => {
    const country = getCountry(mi.country_id)
    const flag = country?.flag_emoji || ''
    const kw = mi.keywords?.join(', ') || mi.keyword
    const count = mi.selected_asins?.length || 0
    return `${flag} ${kw} (${count} ASINs)`
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      queued: { color: 'bg-gray-100 text-gray-700', icon: <Clock className="h-3 w-3" />, label: 'Queued' },
      processing: { color: 'bg-yellow-100 text-yellow-800', icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Processing' },
      completed: { color: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Completed' },
      completed_partial: { color: 'bg-orange-100 text-orange-800', icon: <AlertTriangle className="h-3 w-3" />, label: 'Partial' },
      failed: { color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" />, label: 'Failed' },
      cancelled: { color: 'bg-gray-100 text-gray-500', icon: <XCircle className="h-3 w-3" />, label: 'Cancelled' },
    }
    const c = config[status] || config.queued
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.color}`}>
        {c.icon} {c.label}
      </span>
    )
  }

  const ItemStatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'processing':
        return <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'skipped':
        return <XCircle className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Create Job</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setInputMode('manual')}
              className={`flex-1 text-xs py-1.5 rounded border ${
                inputMode === 'manual'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-accent'
              }`}
            >
              Manual ASINs
            </button>
            <button
              onClick={() => setInputMode('mi')}
              className={`flex-1 text-xs py-1.5 rounded border ${
                inputMode === 'mi'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-accent'
              }`}
            >
              From MI
            </button>
          </div>

          {inputMode === 'manual' ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Country</label>
                <select
                  value={selectedCountryId}
                  onChange={(e) => setSelectedCountryId(e.target.value)}
                  className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.flag_emoji} {c.name} ({c.amazon_domain})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">ASINs (one per line)</label>
                <textarea
                  value={asinInput}
                  onChange={(e) => setAsinInput(e.target.value)}
                  placeholder="B0XXXXXXXXX&#10;B0YYYYYYYYY"
                  rows={5}
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Select MI Report</label>
                <select
                  value={selectedMiId}
                  onChange={(e) => setSelectedMiId(e.target.value)}
                  className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="">Choose a completed MI report...</option>
                  {miRecords.map((mi) => (
                    <option key={mi.id} value={mi.id}>
                      {getMiLabel(mi)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedMiId && (
                <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                  {(() => {
                    const mi = miRecords.find((m) => m.id === selectedMiId)
                    if (!mi) return null
                    return (
                      <div>
                        <div className="font-medium mb-1">{mi.selected_asins?.length} ASINs:</div>
                        <div className="font-mono text-[10px] max-h-24 overflow-y-auto">
                          {mi.selected_asins?.join(', ')}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}

          <button
            onClick={handleCreateJob}
            disabled={creating || (inputMode === 'manual' ? !asinInput.trim() : !selectedMiId)}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Job
          </button>

          <p className="text-[11px] text-gray-500 italic pt-2 border-t">
            Note: Legacy jobs use auto-chips mode. For full Amy loop with synthesis, use the "Run Single" or "Bulk Run" tabs above.
          </p>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Jobs</h2>
            <button onClick={fetchJobs} className="text-xs text-muted-foreground hover:text-foreground">
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No jobs yet.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const country = getCountry(job.country_id)
                const progress = job.total_asins > 0
                  ? ((job.completed_asins + job.failed_asins) / job.total_asins) * 100
                  : 0
                const isExpanded = expandedJobId === job.id
                const isActive = job.status === 'queued' || job.status === 'processing'

                return (
                  <div key={job.id} className="border rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
                      onClick={() => handleToggleJob(job.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {country?.flag_emoji}{' '}
                            {job.source === 'market_intelligence'
                              ? 'MI Import'
                              : (job.source as string) === 'amy_loop'
                                ? 'Amy Loop'
                                : 'Manual'}
                          </span>
                          <StatusBadge status={job.status} />
                          <span className="text-xs text-muted-foreground">{job.marketplace_domain}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{job.total_asins} ASINs</span>
                          <span>{job.completed_asins} done</span>
                          {job.failed_asins > 0 && (
                            <span className="text-red-600">{job.failed_asins} failed</span>
                          )}
                          <span>{new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isActive && (
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {isActive && (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t px-3 py-2 bg-muted/30">
                        {!job.items ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            {job.items.some((i) => i.status === 'pending') && (
                              <button
                                onClick={() => handleCopyPending(job)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mb-2 px-2 py-1 rounded bg-blue-50"
                              >
                                <Copy className="h-3 w-3" />
                                Copy pending ASINs
                              </button>
                            )}
                            <div className="space-y-1">
                              {job.items.map((item) => (
                                <div key={item.id}>
                                  <div
                                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50 cursor-pointer text-sm"
                                    onClick={() =>
                                      setExpandedAsin(
                                        expandedAsin?.asin === item.asin
                                          ? null
                                          : { asin: item.asin, countryId: job.country_id }
                                      )
                                    }
                                  >
                                    <ItemStatusIcon status={item.status} />
                                    <span className="font-mono text-xs">{item.asin}</span>
                                    {item.status === 'completed' && item.questions_found > 0 && (
                                      <span className="text-xs text-green-600">
                                        {item.questions_found} Q&A
                                      </span>
                                    )}
                                    {item.status === 'failed' && item.error_message && (
                                      <span className="text-xs text-red-600 truncate max-w-[200px]" title={item.error_message}>
                                        {item.error_message}
                                      </span>
                                    )}
                                  </div>
                                  {expandedAsin?.asin === item.asin && item.status === 'completed' && (
                                    <QnADetailPanel asin={item.asin} countryId={job.country_id} />
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
