'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Clock, ChevronRight, Loader2, ArrowLeft, Sparkles, Check, X, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { LbCountry, LbMarketIntelligence } from '@/types'
import type { MarketIntelligenceResult } from '@/types/market-intelligence'
import { MarketIntelligenceReport } from './MarketIntelligenceReport'
import toast from 'react-hot-toast'
import { TagBadge, TagInput } from '@/components/shared/TagInput'
import { NotesEditor, NotesIndicator } from '@/components/shared/NotesEditor'
import { CollectionPicker } from '@/components/shared/CollectionPicker'
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
  const [expandedMetaId, setExpandedMetaId] = useState<string | null>(null)
  const fetchAllTags = useCollectionStore((s) => s.fetchAllTags)

  // Progress state
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<LbMarketIntelligence['progress']>({})
  const [progressStatus, setProgressStatus] = useState<string>('')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Product selection state
  const [selectionProducts, setSelectionProducts] = useState<Array<Record<string, unknown>>>([])
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set())

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
        setSelectedAsins(new Set(validProducts.map(p => p.asin as string)))
        setView('product_selection')
        toast.success(`Found ${validProducts.length} products. Select which to analyze.`)
      } else if (data.status === 'collected') {
        // Auto-trigger analysis (from selection confirmation)
        stopPolling()
        setProgressData({ step: 'phase_1', current: 0, total: 4, message: 'Starting AI analysis (Phase 1)...' })
        try {
          await fetch(`/api/market-intelligence/${recordId}/analyze`, { method: 'POST' })
        } catch {
          // Analyze route handles its own status updates
        }
        pollRef.current = setInterval(() => pollForProgress(recordId), POLL_INTERVAL)
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
    setProgressData({ step: 'phase_1', current: 0, total: 4, message: 'Confirming selection...' })

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

      // Start polling for analysis progress
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
    } else if (record.status && ['pending', 'collecting', 'analyzing'].includes(record.status) && record.id) {
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
          setSelectedAsins(new Set(validProducts.map((p: Record<string, unknown>) => p.asin as string)))
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
  }

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

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/market-intelligence/${id}`, { method: 'DELETE' })
      setHistory(prev => prev.filter(h => h.id !== id))
      toast.success('Report deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  // Filter history by search term
  const filteredHistory = historyFilter.trim()
    ? history.filter(h => {
        const kw = (h.keyword || '').toLowerCase()
        const keywords = (h as Record<string, unknown>).keywords as string[] | undefined
        const filter = historyFilter.toLowerCase()
        return kw.includes(filter) || (keywords || []).some(k => k.includes(filter))
      })
    : history

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

            <div className="grid gap-2">
              {filteredHistory.map((record) => {
                const country = countries.find(c => c.id === record.country_id)
                const keywords = (record as Record<string, unknown>).keywords as string[] | undefined
                const statusColor = record.status === 'completed' ? 'text-green-600 bg-green-50' :
                  record.status === 'failed' ? 'text-red-600 bg-red-50' :
                  record.status === 'awaiting_selection' ? 'text-blue-600 bg-blue-50' :
                  'text-yellow-600 bg-yellow-50'

                const isMetaExpanded = expandedMetaId === record.id

                return (
                  <div
                    key={record.id}
                    className="rounded-lg border bg-card hover:bg-muted/30 transition-colors group"
                  >
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
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
                            {record.top_asins && record.top_asins.length > 0 && (
                              <span>{record.top_asins.length} ASINs</span>
                            )}
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
                        <button
                          type="button"
                          onClick={() => setExpandedMetaId(isMetaExpanded ? null : record.id || null)}
                          className="p-1 hover:bg-muted rounded"
                          title="Tags, notes & collections"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
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
                        {record.status === 'failed' && (
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(record.id!)} className="text-xs text-destructive">
                            Delete
                          </Button>
                        )}
                        {record.status && ['pending', 'collecting', 'analyzing'].includes(record.status) && (
                          <Button size="sm" variant="outline" onClick={() => handleViewBrief(record)} className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            View Progress
                          </Button>
                        )}
                      </div>
                    </div>
                    {isMetaExpanded && record.id && (
                      <div className="px-3 pb-3 border-t bg-muted/20 pt-2">
                        <div className="flex flex-wrap items-start gap-4">
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
                            <TagInput
                              tags={(record.tags as string[]) || []}
                              onTagsChange={(tags) => handleUpdateTagsNotes(record.id!, { tags })}
                              compact
                            />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                            <NotesEditor
                              notes={(record.notes as string | null) ?? null}
                              onSave={(notes) => handleUpdateTagsNotes(record.id!, { notes })}
                              compact
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Collections</p>
                            <CollectionPicker entityType="market_intelligence" entityId={record.id} compact />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredHistory.length === 0 && historyFilter && (
                <p className="text-xs text-muted-foreground text-center py-4">No matching reports found.</p>
              )}
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
    const step = progressData?.step || ''
    const message = progressData?.message || 'Starting...'

    const steps = [
      { id: 'keyword_search', label: 'Searching keywords' },
      { id: 'asin_lookup', label: 'Fetching products' },
      { id: 'review_fetch', label: 'Fetching reviews' },
      { id: 'qna_fetch', label: 'Fetching Q&A' },
      { id: 'awaiting_selection', label: 'Product selection' },
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
            <h2 className="text-lg font-semibold">Generating Market Intelligence</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
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
          <Button variant="outline" size="sm" onClick={() => setSelectedAsins(new Set(selectionProducts.map(p => p.asin as string)))}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedAsins(new Set())}>
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

            return (
              <div
                key={i}
                className={`rounded-lg border p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                  isSelected ? 'bg-card border-primary/50' : 'bg-muted/20 opacity-60'
                }`}
                onClick={() => {
                  const next = new Set(selectedAsins)
                  if (next.has(asin)) next.delete(asin)
                  else next.add(asin)
                  setSelectedAsins(next)
                }}
              >
                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>

                {images[0] && (
                  <div className="w-12 h-12 flex-shrink-0 rounded bg-white overflow-hidden">
                    <img src={images[0]} alt={title} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {brand && <span>{brand}</span>}
                    <span className="font-mono text-[10px]">{asin}</span>
                    {isOurProduct && (
                      <Badge className="text-[9px] bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 px-1 py-0">Our Product</Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                  {price != null && <span className="font-semibold text-foreground">{currency}{price.toFixed(2)}</span>}
                  <span>{rating.toFixed(1)}★</span>
                  <span>{reviewsCount.toLocaleString()} rev</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={handleBack}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button onClick={handleConfirmSelection} disabled={selectedAsins.size === 0 || loading}>
            <Sparkles className="h-4 w-4 mr-1" />
            Confirm & Analyze ({selectedAsins.size} products)
          </Button>
        </div>
      </div>
    )
  }

  // --- REPORT VIEW ---
  if (view === 'report' && reportData) {
    const country = countries.find(c => c.id === reportData.country_id)
    const keywords = (reportData as unknown as Record<string, unknown>).keywords as string[] | undefined

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
            {country?.flag_emoji} Market Intelligence: &ldquo;{keywords && keywords.length > 1 ? keywords.join(', ') : reportData.keyword}&rdquo;
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
        />
      </div>
    )
  }

  return null
}
