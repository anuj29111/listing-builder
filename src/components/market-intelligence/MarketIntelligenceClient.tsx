'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, BarChart3, Clock, ChevronRight, Loader2, AlertTriangle, ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LbCountry, LbMarketIntelligence } from '@/types'
import type { MarketIntelligenceResult } from '@/types/market-intelligence'
import { MarketIntelligenceReport } from './MarketIntelligenceReport'
import toast from 'react-hot-toast'

interface MarketIntelligenceClientProps {
  countries: LbCountry[]
  initialIntelligence: Partial<LbMarketIntelligence>[]
}

type ViewState = 'search' | 'progress' | 'report'

const POLL_INTERVAL = 3000

export function MarketIntelligenceClient({ countries, initialIntelligence }: MarketIntelligenceClientProps) {
  const defaultCountryId = countries.find(c => c.code === 'US')?.id || countries[0]?.id || ''

  const [view, setView] = useState<ViewState>('search')
  const [keyword, setKeyword] = useState('')
  const [countryId, setCountryId] = useState(defaultCountryId)
  const [maxCompetitors, setMaxCompetitors] = useState('10')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Partial<LbMarketIntelligence>[]>(initialIntelligence)

  // Progress state
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<LbMarketIntelligence['progress']>({})
  const [progressStatus, setProgressStatus] = useState<string>('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Report state
  const [reportData, setReportData] = useState<LbMarketIntelligence | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const pollForProgress = useCallback(async (recordId: string) => {
    try {
      const res = await fetch(`/api/market-intelligence/${recordId}`)
      if (!res.ok) return

      const data = await res.json()
      setProgressData(data.progress || {})
      setProgressStatus(data.status)

      if (data.status === 'collected') {
        // Auto-trigger analysis
        stopPolling()
        setProgressData({ step: 'phase_1', current: 0, total: 2, message: 'Starting AI analysis...' })
        try {
          await fetch(`/api/market-intelligence/${recordId}/analyze`, { method: 'POST' })
        } catch {
          // Analyze route handles its own status updates; if the fetch fails, polling will catch it
        }
        // Resume polling for analysis progress
        pollRef.current = setInterval(() => pollForProgress(recordId), POLL_INTERVAL)
      } else if (data.status === 'completed') {
        stopPolling()
        setReportData(data)
        setView('report')
        setLoading(false)
        // Refresh history
        refreshHistory()
        toast.success('Market intelligence report generated!')
      } else if (data.status === 'failed') {
        stopPolling()
        setView('search')
        setLoading(false)
        toast.error(data.error_message || 'Analysis failed')
      }
    } catch {
      // Network error, keep polling
    }
  }, [stopPolling])

  const refreshHistory = async () => {
    try {
      const res = await fetch('/api/market-intelligence')
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch { /* silent */ }
  }

  const handleGenerate = async () => {
    if (!keyword.trim() || loading) return

    setLoading(true)
    try {
      // 1. Create record
      const createRes = await fetch('/api/market-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          country_id: countryId,
          max_competitors: Number(maxCompetitors),
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Failed to create record')
      }

      const { id } = await createRes.json()
      setActiveRecordId(id)
      setView('progress')
      setProgressData({ step: 'keyword_search', current: 0, total: Number(maxCompetitors) + 1, message: 'Starting...' })

      // 2. Trigger collection
      fetch(`/api/market-intelligence/${id}/collect`, { method: 'POST' }).catch(() => {})

      // 3. Start polling
      pollRef.current = setInterval(() => pollForProgress(id), POLL_INTERVAL)
    } catch (err) {
      setLoading(false)
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  const handleViewBrief = async (record: Partial<LbMarketIntelligence>) => {
    if (record.status === 'completed' && record.id) {
      try {
        const res = await fetch(`/api/market-intelligence/${record.id}`)
        if (res.ok) {
          const data = await res.json()
          setReportData(data)
          setView('report')
        }
      } catch {
        toast.error('Failed to load report')
      }
    } else if (record.status && ['pending', 'collecting', 'analyzing'].includes(record.status) && record.id) {
      // Resume watching progress
      setActiveRecordId(record.id)
      setView('progress')
      setLoading(true)
      pollRef.current = setInterval(() => pollForProgress(record.id!), POLL_INTERVAL)
    }
  }

  const handleBack = () => {
    stopPolling()
    setView('search')
    setReportData(null)
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/market-intelligence/${id}`, { method: 'DELETE' })
      setHistory(prev => prev.filter(h => h.id !== id))
      toast.success('Report deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  // --- SEARCH VIEW ---
  if (view === 'search') {
    return (
      <div className="space-y-6">
        {/* Search form */}
        <div className="rounded-lg border bg-card p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Keyword</label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleGenerate()}
                placeholder="chalk markers, watercolor brush pens..."
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Marketplace</label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select marketplace" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag_emoji} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Competitors</label>
              <Select value={maxCompetitors} onValueChange={setMaxCompetitors}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={loading || !keyword.trim()}>
              <Sparkles className="h-4 w-4 mr-1" />
              Generate
            </Button>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              Recent Reports
            </h3>
            <div className="grid gap-2">
              {history.map((record) => {
                const country = countries.find(c => c.id === record.country_id)
                const analysis = record.status === 'completed' ? (record as { analysis_result?: MarketIntelligenceResult }).analysis_result : null
                const statusColor = record.status === 'completed' ? 'text-green-600 bg-green-50' :
                  record.status === 'failed' ? 'text-red-600 bg-red-50' :
                  'text-yellow-600 bg-yellow-50'

                return (
                  <div
                    key={record.id}
                    className="rounded-lg border bg-card p-3 flex items-center justify-between hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 text-lg">{country?.flag_emoji || '🌐'}</div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{record.keyword}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor}`}>
                            {record.status}
                          </span>
                          {record.top_asins && record.top_asins.length > 0 && (
                            <span>{record.top_asins.length} ASINs</span>
                          )}
                          {record.tokens_used && (
                            <span>{(record.tokens_used / 1000).toFixed(0)}K tokens</span>
                          )}
                          {record.created_at && (
                            <span>{new Date(record.created_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewBrief(record)}
                          className="text-xs"
                        >
                          View Brief
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                      {record.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(record.id!)}
                          className="text-xs text-destructive"
                        >
                          Delete
                        </Button>
                      )}
                      {record.status && ['pending', 'collecting', 'analyzing'].includes(record.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewBrief(record)}
                          className="text-xs"
                        >
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          View Progress
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- PROGRESS VIEW ---
  if (view === 'progress') {
    const total = progressData?.total || 1
    const current = progressData?.current || 0
    const pct = Math.round((current / total) * 100)
    const step = progressData?.step || ''
    const message = progressData?.message || 'Starting...'

    const steps = [
      { id: 'keyword_search', label: 'Searching keyword' },
      { id: 'asin_lookup', label: 'Fetching products' },
      { id: 'collected', label: 'Data collected' },
      { id: 'phase_1', label: 'Phase 1: Market Analysis' },
      { id: 'phase_2', label: 'Phase 2: Customer Intelligence' },
      { id: 'completed', label: 'Complete' },
    ]

    const currentStepIdx = steps.findIndex(s => s.id === step)

    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="max-w-lg mx-auto space-y-8 py-12">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <h2 className="text-lg font-semibold">Generating Market Intelligence</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-center">{pct}%</div>
          </div>

          {/* Step indicators */}
          <div className="space-y-2">
            {steps.map((s, i) => {
              const isDone = i < currentStepIdx
              const isCurrent = i === currentStepIdx
              return (
                <div key={s.id} className={`flex items-center gap-3 text-sm ${
                  isDone ? 'text-green-600' : isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}>
                  <div className={`h-2 w-2 rounded-full ${
                    isDone ? 'bg-green-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'
                  }`} />
                  {s.label}
                  {isCurrent && step === 'asin_lookup' && (
                    <span className="text-xs text-muted-foreground">
                      ({current - 1}/{total - 1})
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // --- REPORT VIEW ---
  if (view === 'report' && reportData) {
    const country = countries.find(c => c.id === reportData.country_id)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Search
          </Button>
          <div className="text-xs text-muted-foreground">
            {reportData.tokens_used && `${(reportData.tokens_used / 1000).toFixed(0)}K tokens`}
            {reportData.oxylabs_calls_used > 0 && ` · ${reportData.oxylabs_calls_used} API calls`}
            {reportData.model_used && ` · ${reportData.model_used}`}
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">
            {country?.flag_emoji} Market Intelligence: &ldquo;{reportData.keyword}&rdquo;
          </h2>
          <p className="text-sm text-muted-foreground">
            {country?.name} · {reportData.top_asins?.length || 0} competitors analyzed · {new Date(reportData.created_at).toLocaleDateString()}
          </p>
        </div>

        <MarketIntelligenceReport
          analysisResult={reportData.analysis_result as unknown as MarketIntelligenceResult}
          competitorsData={(reportData.competitors_data || []) as unknown as Array<Record<string, unknown>>}
        />
      </div>
    )
  }

  return null
}
