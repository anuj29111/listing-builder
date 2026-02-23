'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, Plus, Download, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Copy } from 'lucide-react'
import type { LbRufusJob, LbRufusJobItem } from '@/types'
import { QnADetailPanel } from './QnADetailPanel'

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

export function RufusQnAPageClient({ countries, miRecords }: RufusQnAPageClientProps) {
  // Create job state
  const [selectedCountryId, setSelectedCountryId] = useState(countries[0]?.id || '')
  const [inputMode, setInputMode] = useState<'manual' | 'mi'>('manual')
  const [asinInput, setAsinInput] = useState('')
  const [selectedMiId, setSelectedMiId] = useState('')
  const [creating, setCreating] = useState(false)

  // Jobs state
  const [jobs, setJobs] = useState<JobWithItems[]>([])
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [expandedAsin, setExpandedAsin] = useState<{ asin: string; countryId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/rufus-qna/jobs')
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch job details (items)
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
      // Silently fail
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Poll active jobs every 5s
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'processing')
    if (hasActive) {
      pollRef.current = setInterval(() => {
        fetchJobs()
        // Also refresh expanded job details
        if (expandedJobId) {
          fetchJobDetails(expandedJobId)
        }
      }, 5000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs, expandedJobId, fetchJobs, fetchJobDetails])

  // Create job
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

  // Cancel job
  const handleCancelJob = async (jobId: string) => {
    const res = await fetch(`/api/rufus-qna/jobs/${jobId}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchJobs()
    }
  }

  // Toggle expand job
  const handleToggleJob = (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
    } else {
      setExpandedJobId(jobId)
      fetchJobDetails(jobId)
    }
  }

  // Copy pending ASINs from a job
  const handleCopyPending = (job: JobWithItems) => {
    const pending = (job.items || [])
      .filter((item) => item.status === 'pending')
      .map((item) => item.asin)
    if (pending.length > 0) {
      navigator.clipboard.writeText(pending.join('\n'))
    }
  }

  // Get country info
  const getCountry = (countryId: string) => countries.find((c) => c.id === countryId)

  // Get MI display label
  const getMiLabel = (mi: MIRecord) => {
    const country = getCountry(mi.country_id)
    const flag = country?.flag_emoji || ''
    const kw = mi.keywords?.join(', ') || mi.keyword
    const count = mi.selected_asins?.length || 0
    return `${flag} ${kw} (${count} ASINs)`
  }

  // Status badge
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

  // Item status icon
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
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Rufus Q&A</h1>
          <p className="text-sm text-muted-foreground">
            Queue ASINs for Rufus Q&A extraction. Enable &quot;Auto-process&quot; in the Chrome extension to start.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Create Job */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Create Job</h2>

            {/* Input mode toggle */}
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
                {/* Country selector */}
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

                {/* ASIN input */}
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
                {/* MI selector */}
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
                          <div className="font-medium mb-1">{mi.selected_asins?.length} ASINs selected:</div>
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
          </div>
        </div>

        {/* Right: Jobs List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Jobs</h2>
              <button
                onClick={fetchJobs}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No jobs yet. Create one to get started.
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
                      {/* Job Header */}
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
                        onClick={() => handleToggleJob(job.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {country?.flag_emoji} {job.source === 'market_intelligence' ? 'MI Import' : 'Manual'}
                            </span>
                            <StatusBadge status={job.status} />
                            <span className="text-xs text-muted-foreground">
                              {job.marketplace_domain}
                            </span>
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

                        {/* Progress bar */}
                        {isActive && (
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}

                        {/* Actions */}
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

                      {/* Expanded: Item List */}
                      {isExpanded && (
                        <div className="border-t px-3 py-2 bg-muted/30">
                          {!job.items ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <>
                              {/* Copy pending ASINs button */}
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
                                        <span className="text-xs text-green-600">{item.questions_found} Q&A</span>
                                      )}
                                      {item.status === 'failed' && item.error_message && (
                                        <span className="text-xs text-red-600 truncate max-w-[200px]" title={item.error_message}>
                                          {item.error_message}
                                        </span>
                                      )}
                                    </div>

                                    {/* Expanded Q&A Detail */}
                                    {expandedAsin?.asin === item.asin && item.status === 'completed' && (
                                      <QnADetailPanel
                                        asin={item.asin}
                                        countryId={job.country_id}
                                      />
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
    </div>
  )
}
