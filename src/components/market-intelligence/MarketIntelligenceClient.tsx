'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Clock, ChevronRight, Loader2, ArrowLeft, Sparkles, Check, X, ExternalLink, Trash2, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import type { LbCountry, LbMarketIntelligence } from '@/types'
import type { MarketIntelligenceResult } from '@/types/market-intelligence'
import { MarketIntelligenceReport } from './MarketIntelligenceReport'
import { generateMIReportHTML, downloadMIReport } from '@/lib/mi-pdf'
import toast from 'react-hot-toast'
import { TagBadge } from '@/components/shared/TagInput'
import { NotesIndicator } from '@/components/shared/NotesEditor'
import { QuickActions } from '@/components/shared/QuickActions'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { useCollectionStore } from '@/stores/collection-store'

interface MarketIntelligenceClientProps {
  countries: LbCountry[]
  initialIntelligence: Partial<LbMarketIntelligence>[]
}

type ViewState = 'search' | 'progress' | 'product_selection' | 'report'

const POLL_INTERVAL = 3000

export function MarketIntelligenceClient({ countries, initialIntelligence }: MarketIntelligenceClientProps) {
  const defaultCountryId = countries.find(c => c.code === 'US')?.id || countries[0]?.id || ''

  const [view, setView] = useState<ViewState>('search')
  const [keywordsInput, setKeywordsInput] = useState('')
  const [countryId, setCountryId] = useState(defaultCountryId)
  const [maxCompetitors, setMaxCompetitors] = useState('10')
  const [reviewsPerProduct, setReviewsPerProduct] = useState('200')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Partial<LbMarketIntelligence>[]>(initialIntelligence)
  const [historyFilter, setHistoryFilter] = useState('')
  const [ourAsins, setOurAsins] = useState<Set<string>>(new Set())
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdxRef = useRef<number>(-1)
  const fetchAllTags = useCollectionStore((s) => s.fetchAllTags)

  // Progress state
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<LbMarketIntelligence['progress']>({})
  const [progressStatus, setProgressStatus] = useState<string>('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Product selection state
  const [selectionProducts, setSelectionProducts] = useState<Array<Record<string, unknown>>>([])
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set())
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [selectionDomain, setSelectionDomain] = useState<string>('')

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmKeyword, setDeleteConfirmKeyword] = useState<string>('')

  // Report state
  const [reportData, setReportData] = useState<LbMarketIntelligence | null>(null)

  // Fetch our product ASINs on mount
  useEffect(() => {
    fetch('/api/products?asins_only=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.asins) setOurAsins(new Set(data.asins))
      })
      .catch(() => {})
  }, [])

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

      if (data.status === 'awaiting_selection') {
        // Show product selection UI
        stopPolling()
        setLoading(false)
        const competitors = (data.competitors_data || []) as Array<Record<string, unknown>>
        const validProducts = competitors.filter(c => !c.error)
        setSelectionProducts(validProducts)
        // Restore saved selections if available, otherwise select all
        const savedSelections = data.selected_asins as string[] | null
        if (savedSelections && savedSelections.length > 0) {
          setSelectedAsins(new Set(savedSelections))
        } else {
          setSelectedAsins(new Set(validProducts.map(p => p.asin as string)))
        }
        setSelectionDomain(data.marketplace_domain || '')
        setView('product_selection')
        toast.success(`Found ${validProducts.length} products. Select which to analyze.`)
      } else if (data.status === 'completed') {
        stopPolling()
        setReportData(data)
        setView('report')
        setLoading(false)
        refreshHistory()
        toast.success('Market intelligence report generated!')
      } else if (data.status === 'failed') {
        stopPolling()
        setView('search')
        setLoading(false)
        refreshHistory()
        toast.error(data.error_message || 'Analysis failed')
      }
      // For 'pending', 'collecting', 'analyzing' — keep polling (progress updates in real-time)
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
    const keywords = keywordsInput
      .split(/[,\n]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0)

    if (keywords.length === 0 || loading) return

    setLoading(true)
    try {
      const createRes = await fetch('/api/market-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords,
          country_id: countryId,
          max_competitors: Number(maxCompetitors),
          reviews_per_product: Number(reviewsPerProduct),
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Failed to create record')
      }

      const { id } = await createRes.json()
      setActiveRecordId(id)
      setView('progress')
      setProgressData({ step: 'keyword_search', current: 0, total: keywords.length, message: 'Starting keyword searches...' })

      fetch(`/api/market-intelligence/${id}/collect`, { method: 'POST' }).catch(() => {})
      pollRef.current = setInterval(() => pollForProgress(id), POLL_INTERVAL)
    } catch (err) {
      setLoading(false)
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  const handleConfirmSelection = async () => {
    if (!activeRecordId || selectedAsins.size === 0) return

    setLoading(true)
    setView('progress')
    setProgressData({ step: 'review_fetch', current: 0, total: selectedAsins.size, message: 'Starting review collection...' })

    try {
      const res = await fetch(`/api/market-intelligence/${activeRecordId}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_asins: Array.from(selectedAsins) }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to confirm selection')
      }

      // Background analysis started by /select — poll for progress (user can navigate away)
      toast.success('Analysis started! You can navigate away — it runs in the background.')
      pollRef.current = setInterval(() => pollForProgress(activeRecordId!), POLL_INTERVAL)
    } catch (err) {
      setLoading(false)
      setView('product_selection')
      toast.error(err instanceof Error ? err.message : 'Failed to confirm')
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
    } else if (record.status && ['pending', 'collecting', 'collected', 'analyzing'].includes(record.status) && record.id) {
      setActiveRecordId(record.id)
      setView('progress')
      setLoading(true)
      pollRef.current = setInterval(() => pollForProgress(record.id!), POLL_INTERVAL)
    } else if (record.status === 'awaiting_selection' && record.id) {
      // Resume product selection
      try {
        const res = await fetch(`/api/market-intelligence/${record.id}`)
        if (res.ok) {
          const data = await res.json()
          setActiveRecordId(record.id)
          const competitors = (data.competitors_data || []) as Array<Record<string, unknown>>
          const validProducts = competitors.filter((c: Record<string, unknown>) => !c.error)
          setSelectionProducts(validProducts)
          // Restore saved selections if available, otherwise select all
          const savedSelections = data.selected_asins as string[] | null
          if (savedSelections && savedSelections.length > 0) {
            setSelectedAsins(new Set(savedSelections))
          } else {
            setSelectedAsins(new Set(validProducts.map((p: Record<string, unknown>) => p.asin as string)))
          }
          setSelectionDomain(data.marketplace_domain || '')
          setView('product_selection')
        }
      } catch {
        toast.error('Failed to load products')
      }
    }
  }

  const handleBack = () => {
    stopPolling()
    setView('search')
    setReportData(null)
    setLoading(false)
    refreshHistory()
  }

  const handleResume = async (record: Partial<LbMarketIntelligence>) => {
    if (!record.id) return

    const completedPhases = record.progress?.completed_phases || []
    const resumePhase = completedPhases.length > 0
      ? `phase ${completedPhases.length + 1}`
      : 'the beginning'

    setActiveRecordId(record.id)
    setLoading(true)
    setView('progress')
    setProgressData({
      step: completedPhases.length > 0 ? `phase_${completedPhases.length + 1}` : 'review_fetch',
      current: completedPhases.length,
      total: 4,
      message: `Resuming from ${resumePhase}...`,
    })

    try {
      const res = await fetch(`/api/market-intelligence/${record.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_asins: record.selected_asins || [] }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to resume')
      }

      toast.success(`Resuming analysis from ${resumePhase}...`)
      pollRef.current = setInterval(() => pollForProgress(record.id!), POLL_INTERVAL)
    } catch (err) {
      setLoading(false)
      setView('search')
      toast.error(err instanceof Error ? err.message : 'Failed to resume')
    }
  }

  // Auto-resume: check for in-progress MI records on mount
  const hasAutoResumed = useRef(false)
  useEffect(() => {
    if (hasAutoResumed.current) return
    hasAutoResumed.current = true

    const activeRecord = initialIntelligence.find(r =>
      r.status && ['pending', 'collecting', 'analyzing'].includes(r.status)
    )
    const awaitingRecord = !activeRecord
      ? initialIntelligence.find(r => r.status === 'awaiting_selection')
      : null

    if (activeRecord?.id) {
      setActiveRecordId(activeRecord.id)
      setView('progress')
      setLoading(true)
      pollRef.current = setInterval(() => pollForProgress(activeRecord.id!), POLL_INTERVAL)
    } else if (awaitingRecord?.id) {
      handleViewBrief(awaitingRecord)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdateTagsNotes = async (id: string, updates: { tags?: string[]; notes?: string }) => {
    try {
      const res = await fetch(`/api/market-intelligence/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setHistory((prev) => prev.map((h) => (h.id === id ? { ...h, ...updates } : h)))
        fetchAllTags()
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return
    try {
      await fetch(`/api/market-intelligence/${deleteConfirmId}`, { method: 'DELETE' })
      setHistory(prev => prev.filter(h => h.id !== deleteConfirmId))
      toast.success('Report deleted')
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleteConfirmId(null)
      setDeleteConfirmKeyword('')
    }
  }

  // Auto-save product selections to DB (debounced)
  const saveSelectionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveSelectionsToDb = useCallback((asins: Set<string>) => {
    if (!activeRecordId || asins.size === 0) return
    if (saveSelectionTimerRef.current) clearTimeout(saveSelectionTimerRef.current)
    saveSelectionTimerRef.current = setTimeout(() => {
      fetch(`/api/market-intelligence/${activeRecordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_asins: Array.from(asins) }),
      }).catch(() => {}) // Silent save
    }, 1000)
  }, [activeRecordId])

  // Filter history by search term
  const filteredHistory = historyFilter.trim()
    ? history.filter(h => {
        const kw = (h.keyword || '').toLowerCase()
        const keywords = (h as Record<string, unknown>).keywords as string[] | undefined
        const filter = historyFilter.toLowerCase()
        return kw.includes(filter) || (keywords || []).some(k => k.includes(filter))
      })
    : history

  const toggleHistorySelect = (id: string, idx: number, shiftKey: boolean) => {
    setHistorySelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdxRef.current >= 0) {
        const start = Math.min(lastClickedIdxRef.current, idx)
        const end = Math.max(lastClickedIdxRef.current, idx)
        for (let i = start; i <= end; i++) {
          const lid = filteredHistory[i]?.id
          if (lid) next.add(lid)
        }
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      lastClickedIdxRef.current = idx
      return next
    })
  }

  const toggleHistorySelectAll = () => {
    const allIds = filteredHistory.map((h) => h.id).filter(Boolean) as string[]
    setHistorySelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  const clearHistorySelection = () => setHistorySelectedIds(new Set())

  // --- SEARCH VIEW ---
  if (view === 'search') {
    return (
      <div className="space-y-6">
        {/* Search form */}
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Keywords (one per line, or comma-separated)
                </label>
                <Textarea
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="chalk markers&#10;liquid chalk markers&#10;chalk pens"
                  disabled={loading}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="space-y-3">
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reviews per product</label>
                <Select value={reviewsPerProduct} onValueChange={setReviewsPerProduct}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100 reviews</SelectItem>
                    <SelectItem value="200">200 reviews</SelectItem>
                    <SelectItem value="300">300 reviews</SelectItem>
                    <SelectItem value="400">400 reviews</SelectItem>
                    <SelectItem value="500">500 reviews</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGenerate} disabled={loading || !keywordsInput.trim()} className="h-9">
                <Sparkles className="h-4 w-4 mr-1" />
                Generate
              </Button>
            </div>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Recent Reports
              </h3>
            </div>

            {/* Live search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder="Filter by keyword..."
                className="pl-9 h-8 text-xs"
              />
            </div>

            <BulkActionBar
              selectedIds={Array.from(historySelectedIds)}
              entityType="market_intelligence"
              onClear={clearHistorySelection}
              onUpdate={() => { refreshHistory(); clearHistorySelection() }}
            />

            {/* Select all header */}
            <div className="px-3 py-2 flex items-center gap-3 bg-muted/30 rounded-lg border">
              <input
                type="checkbox"
                checked={historySelectedIds.size > 0 && historySelectedIds.size === filteredHistory.filter((h) => h.id).length}
                onChange={toggleHistorySelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">
                {historySelectedIds.size > 0 ? `${historySelectedIds.size} selected` : 'Select all'}
              </span>
            </div>

            <div className="grid gap-2">
              {filteredHistory.map((record, recordIdx) => {
                const country = countries.find(c => c.id === record.country_id)
                const keywords = (record as Record<string, unknown>).keywords as string[] | undefined
                const statusColor = record.status === 'completed' ? 'text-green-600 bg-green-50' :
                  record.status === 'failed' ? 'text-red-600 bg-red-50' :
                  record.status === 'awaiting_selection' ? 'text-blue-600 bg-blue-50' :
                  'text-yellow-600 bg-yellow-50'

                return (
                  <div
                    key={record.id}
                    className={`rounded-lg border bg-card hover:bg-muted/30 transition-colors group ${historySelectedIds.has(record.id || '') ? 'bg-primary/5 border-primary/30' : ''}`}
                  >
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={historySelectedIds.has(record.id || '')}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (record.id) toggleHistorySelect(record.id, recordIdx, e.shiftKey)
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer flex-shrink-0"
                        />
                        <div className="flex-shrink-0 text-lg">{country?.flag_emoji || '\ud83c\udf10'}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {keywords && keywords.length > 1
                              ? keywords.join(', ')
                              : record.keyword}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor}`}>
                              {record.status}
                            </span>
                            {record.status === 'failed' && record.progress?.completed_phases && record.progress.completed_phases.length > 0 && (
                              <span className="text-[10px] text-amber-600 font-medium">
                                {record.progress.completed_phases.length}/4 phases saved
                              </span>
                            )}
                            {record.status === 'failed' && record.error_message && (
                              <span className="text-red-500 text-[10px] truncate max-w-[200px]" title={record.error_message}>
                                {record.error_message.length > 60
                                  ? record.error_message.slice(0, 60) + '...'
                                  : record.error_message}
                              </span>
                            )}
                            {record.selected_asins && record.selected_asins.length > 0 ? (
                              <span>{record.selected_asins.length} selected / {record.top_asins?.length || '?'} ASINs</span>
                            ) : record.top_asins && record.top_asins.length > 0 ? (
                              <span>{record.top_asins.length} ASINs</span>
                            ) : null}
                            {record.tokens_used && (
                              <span>{(record.tokens_used / 1000).toFixed(0)}K tokens</span>
                            )}
                            {record.created_at && (
                              <span>{new Date(record.created_at).toLocaleDateString()}</span>
                            )}
                            {(record.tags as string[] | undefined)?.map((tag) => (
                              <TagBadge key={tag} tag={tag} compact />
                            ))}
                            <NotesIndicator notes={(record.notes as string | null) ?? null} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {record.id && (
                          <QuickActions
                            entityId={record.id}
                            entityType="market_intelligence"
                            tags={(record.tags as string[]) || []}
                            notes={(record.notes as string | null) ?? null}
                            onTagsChange={(tags) => handleUpdateTagsNotes(record.id!, { tags })}
                            onNotesChange={(notes) => handleUpdateTagsNotes(record.id!, { notes })}
                          />
                        )}
                        {record.status === 'completed' && (
                          <Button size="sm" variant="outline" onClick={() => handleViewBrief(record)} className="text-xs">
                            View Brief <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                        {record.status === 'awaiting_selection' && (
                          <Button size="sm" variant="outline" onClick={() => handleViewBrief(record)} className="text-xs">
                            Select Products <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                        {record.status === 'failed' && record.selected_asins && record.selected_asins.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResume(record)}
                            className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                          >
                            Resume <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const kws = (record as Record<string, unknown>).keywords as string[] | undefined
                            setDeleteConfirmKeyword(kws && kws.length > 1 ? kws.join(', ') : (record.keyword || 'this report'))
                            setDeleteConfirmId(record.id!)
                          }}
                          className="text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        {record.status && ['pending', 'collecting', 'collected', 'analyzing'].includes(record.status) && (
                          <Button size="sm" variant="outline" onClick={() => handleViewBrief(record)} className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            View Progress
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredHistory.length === 0 && historyFilter && (
                <p className="text-xs text-muted-foreground text-center py-4">No matching reports found.</p>
              )}
            </div>
          </div>
        )}
        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => { setDeleteConfirmId(null); setDeleteConfirmKeyword('') }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Report</DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete the market intelligence report for <span className="font-medium text-foreground">&quot;{deleteConfirmKeyword}&quot;</span>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setDeleteConfirmId(null); setDeleteConfirmKeyword('') }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // --- PROGRESS VIEW ---
  if (view === 'progress') {
    const total = progressData?.total || 1
    const current = progressData?.current || 0
    const step = progressData?.step || ''
    const message = progressData?.message || 'Starting...'

    // Steps shown depend on whether we're in collect phase or analyze phase
    const isCollectPhase = ['keyword_search', 'asin_lookup'].includes(step)
    const steps = isCollectPhase ? [
      { id: 'keyword_search', label: 'Searching keywords' },
      { id: 'asin_lookup', label: 'Fetching products' },
    ] : [
      { id: 'review_fetch', label: 'Fetching reviews' },
      { id: 'qna_fetch', label: 'Fetching Q&A' },
      { id: 'phase_1', label: 'Phase 1: Review Analysis' },
      { id: 'phase_2', label: 'Phase 2: Q&A Analysis' },
      { id: 'phase_3', label: 'Phase 3: Market Analysis' },
      { id: 'phase_4', label: 'Phase 4: Strategy' },
      { id: 'completed', label: 'Complete' },
    ]

    const currentStepIdx = steps.findIndex(s => s.id === step)
    const pct = steps.length > 0 ? Math.round(((currentStepIdx >= 0 ? currentStepIdx : 0) / (steps.length - 1)) * 100) : 0

    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="max-w-lg mx-auto space-y-8 py-12">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <h2 className="text-lg font-semibold">
              {isCollectPhase ? 'Finding Products' : 'Analyzing Market Intelligence'}
            </h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            {!isCollectPhase && (
              <p className="text-xs text-muted-foreground/70">You can navigate away — this runs in the background.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-muted-foreground text-center">{pct}%</div>
          </div>

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
                  {isCurrent && (step === 'asin_lookup' || step === 'review_fetch' || step === 'qna_fetch') && (
                    <span className="text-xs text-muted-foreground">({current}/{total})</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // --- PRODUCT SELECTION VIEW ---
  if (view === 'product_selection') {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Select Products for Analysis</h2>
          <p className="text-sm text-muted-foreground">
            {selectionProducts.length} products found. Uncheck any you want to exclude.
            <span className="font-medium ml-1">{selectedAsins.size} selected</span>
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const all = new Set(selectionProducts.map(p => p.asin as string))
            setSelectedAsins(all)
            saveSelectionsToDb(all)
          }}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setSelectedAsins(new Set())
            saveSelectionsToDb(new Set())
          }}>
            Clear All
          </Button>
        </div>

        <div className="grid gap-2">
          {selectionProducts.map((prod, i) => {
            const asin = prod.asin as string
            const isSelected = selectedAsins.has(asin)
            const title = (prod.title as string) || ''
            const brand = (prod.brand as string) || ''
            const price = prod.price as number | null
            const currency = (prod.currency as string) || '$'
            const rating = (prod.rating as number) || 0
            const reviewsCount = (prod.reviews_count as number) || 0
            const images = (prod.images as string[]) || []
            const isOurProduct = ourAsins.has(asin)
            const salesVolume = (prod.sales_volume as string) || ''
            const amazonChoice = (prod.amazon_choice as boolean) || false
            const salesRank = (prod.sales_rank as Array<{ rank?: number; ladder?: Array<{ name: string }> }>) || []
            const bsr = salesRank[0]

            return (
              <div
                key={i}
                className={`rounded-lg border p-3 flex items-start gap-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-card border-primary/50' : 'bg-muted/20 opacity-60'
                }`}
                onClick={() => {
                  const next = new Set(selectedAsins)
                  if (next.has(asin)) next.delete(asin)
                  else next.add(asin)
                  setSelectedAsins(next)
                  saveSelectionsToDb(next)
                }}
              >
                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>

                {images[0] && (
                  <div
                    className="w-16 h-16 flex-shrink-0 rounded bg-white overflow-hidden cursor-zoom-in border hover:border-primary/50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightboxImage(images[0])
                    }}
                  >
                    <img src={images[0]} alt={title} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {brand && <span>{brand}</span>}
                    <span className="font-mono text-[10px]">{asin}</span>
                    {selectionDomain && (
                      <a
                        href={`https://${selectionDomain}/dp/${asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {isOurProduct && (
                      <Badge className="text-[9px] bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 px-1 py-0">Our Product</Badge>
                    )}
                    {amazonChoice && (
                      <Badge className="text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1 py-0">Amazon&apos;s Choice</Badge>
                    )}
                    {salesVolume && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">{salesVolume}</Badge>
                    )}
                  </div>
                  {bsr && bsr.rank && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium">BSR #{bsr.rank.toLocaleString()}</span>
                      {bsr.ladder && bsr.ladder.length > 0 && (
                        <span className="ml-1">in {bsr.ladder[bsr.ladder.length - 1]?.name || bsr.ladder[0]?.name}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                  {price != null && <span className="font-semibold text-foreground">{currency}{price.toFixed(2)}</span>}
                  <span>{rating.toFixed(1)}★ · {reviewsCount.toLocaleString()} rev</span>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Review collection runs in parallel via Apify and may take 15-30 minutes depending on the number of products. You can navigate away while it runs.
        </p>

        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={handleBack}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button onClick={handleConfirmSelection} disabled={selectedAsins.size === 0 || loading}>
            <Sparkles className="h-4 w-4 mr-1" />
            Confirm & Analyze ({selectedAsins.size} products)
          </Button>
        </div>

        {/* Image Lightbox Dialog */}
        <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
          <DialogContent className="max-w-2xl p-0 bg-black/95 border-none">
            <div className="relative flex items-center justify-center min-h-[400px]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
                onClick={() => setLightboxImage(null)}
              >
                <X className="h-5 w-5" />
              </Button>
              {lightboxImage && (
                <img
                  src={lightboxImage}
                  alt="Product image"
                  className="max-h-[80vh] max-w-full object-contain p-8"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // --- REPORT VIEW ---
  if (view === 'report' && reportData) {
    const country = countries.find(c => c.id === reportData.country_id)
    const keywords = (reportData as unknown as Record<string, unknown>).keywords as string[] | undefined
    const displayKeyword = keywords && keywords.length > 1 ? keywords.join(', ') : reportData.keyword

    const handleDownloadPDF = () => {
      const analysisResult = reportData.analysis_result as unknown as MarketIntelligenceResult
      if (!analysisResult) {
        toast.error('No analysis data to export')
        return
      }
      const html = generateMIReportHTML(
        analysisResult,
        (reportData.competitors_data || []) as unknown as Array<Record<string, unknown>>,
        {
          keyword: displayKeyword,
          marketplace: country?.name || 'Unknown',
          flagEmoji: country?.flag_emoji || undefined,
          date: new Date(reportData.created_at).toLocaleDateString(),
          competitorCount: reportData.selected_asins?.length || reportData.top_asins?.length || 0,
          modelUsed: reportData.model_used || undefined,
          tokensUsed: reportData.tokens_used || undefined,
          marketplaceDomain: reportData.marketplace_domain,
        },
      )
      downloadMIReport(html)
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Search
          </Button>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <FileDown className="h-4 w-4 mr-1" />
              Download PDF
            </Button>
            <div className="text-xs text-muted-foreground">
              {reportData.tokens_used && `${(reportData.tokens_used / 1000).toFixed(0)}K tokens`}
              {reportData.oxylabs_calls_used > 0 && ` · ${reportData.oxylabs_calls_used} API calls`}
              {reportData.model_used && ` · ${reportData.model_used}`}
            </div>
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">
            {country?.flag_emoji} Market Intelligence: &ldquo;{displayKeyword}&rdquo;
          </h2>
          <p className="text-sm text-muted-foreground">
            {country?.name} · {reportData.selected_asins?.length || reportData.top_asins?.length || 0} competitors analyzed · {new Date(reportData.created_at).toLocaleDateString()}
          </p>
        </div>

        <MarketIntelligenceReport
          analysisResult={reportData.analysis_result as unknown as MarketIntelligenceResult}
          competitorsData={(reportData.competitors_data || []) as unknown as Array<Record<string, unknown>>}
          marketplaceDomain={reportData.marketplace_domain}
          ourAsins={ourAsins}
          questionsData={(reportData.questions_data || {}) as Record<string, Array<Record<string, unknown>>>}
          reviewsData={((reportData as unknown as Record<string, unknown>).reviews_data || {}) as Record<string, Array<Record<string, unknown>>>}
        />
      </div>
    )
  }

  return null
}
