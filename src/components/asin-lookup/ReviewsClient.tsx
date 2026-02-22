'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Search,
  Star,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  ThumbsUp,
  MessageSquare as MessageSquareIcon,
  ImageIcon,
  Sparkles,
  Download,
  X,
  Eye,
  Minus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbCountry, LbAsinReview } from '@/types'
import { TagBadge } from '@/components/shared/TagInput'
import { NotesIndicator } from '@/components/shared/NotesEditor'
import { QuickActions } from '@/components/shared/QuickActions'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { useCollectionStore } from '@/stores/collection-store'

interface ReviewsClientProps {
  countries: LbCountry[]
  initialReviews: Partial<LbAsinReview>[]
}

interface ReviewItem {
  id: string
  title: string
  author: string
  rating: number
  content: string
  timestamp: string
  is_verified: boolean
  helpful_count: number
  product_attributes: string | null
  images: string[]
}

interface ApifyExtras {
  customersSay: string | null
  reviewAspects: Array<{
    aspect: string
    positive: number
    negative: number
    mixed?: number
    total?: number
  }> | null
  computeUnits: number
  durationMs: number
  runId: string
}

interface ReviewsData {
  id?: string
  asin: string
  marketplace: string
  total_reviews: number | null
  overall_rating: number | null
  rating_stars_distribution: Array<{ rating: number; percentage: string }> | null
  total_pages_available: number
  reviews_fetched: number
  reviews: ReviewItem[]
  sort_by: string
  source?: 'amazon_reviews' | 'amazon_product' | 'apify'
  fallback_reason?: string | null
  apify?: ApifyExtras
  maxReviewsRequested?: number | string | null
}

export function ReviewsClient({
  countries,
  initialReviews,
}: ReviewsClientProps) {
  const [asin, setAsin] = useState('')
  const [countryId, setCountryId] = useState(
    countries.find((c) => c.code === 'US')?.id || countries[0]?.id || ''
  )
  const [pages, setPages] = useState(10)
  const [sortBy, setSortBy] = useState('recent')
  const [provider, setProvider] = useState<'oxylabs' | 'apify'>('apify')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ReviewsData | null>(null)
  const [reviews, setReviews] = useState<Partial<LbAsinReview>[]>(initialReviews)
  const [historySearch, setHistorySearch] = useState('')
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)
  const [expandedReviewData, setExpandedReviewData] = useState<ReviewsData | null>(null)
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdx = useRef<number>(-1)
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())
  const fetchingIdsRef = useRef<Set<string>>(new Set())
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const [existingReviewInfo, setExistingReviewInfo] = useState<{
    id: string; asin: string; total_reviews: number | null; overall_rating: number | null
    updated_at: string; reviews_count: number
  } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  const [expandedPage, setExpandedPage] = useState(1)

  const selectedCountry = countries.find((c) => c.id === countryId)
  const fetchAllTags = useCollectionStore((s) => s.fetchAllTags)

  // Keep ref in sync with state (fixes stale closure in polling)
  useEffect(() => {
    fetchingIdsRef.current = fetchingIds
  }, [fetchingIds])

  // --- Polling for background Apify fetches ---

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const toggleSelect = (id: string, idx: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdx.current >= 0) {
        const start = Math.min(lastClickedIdx.current, idx)
        const end = Math.max(lastClickedIdx.current, idx)
        for (let i = start; i <= end; i++) {
          const lid = reviews[i]?.id
          if (lid) next.add(lid)
        }
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      lastClickedIdx.current = idx
      return next
    })
  }

  const toggleSelectAll = () => {
    const allIds = reviews.map((r) => r.id).filter(Boolean) as string[]
    setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleFetch = async (forceRefetch = false) => {
    const trimmed = asin.trim().toUpperCase()
    if (!trimmed) {
      toast.error('Enter an ASIN')
      return
    }
    if (!/^[A-Z0-9]{10}$/.test(trimmed)) {
      toast.error('Invalid ASIN format')
      return
    }

    setLoading(true)
    if (forceRefetch) {
      setResults(null)
    }
    setRatingFilter(null)

    try {
      const res = await fetch('/api/asin-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: trimmed,
          country_id: countryId,
          pages,
          sort_by: sortBy,
          provider,
          force: forceRefetch,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch reviews')
      }

      // Apify: existing completed reviews found — show confirmation dialog
      if (json.status === 'exists' && json.id) {
        setExistingReviewInfo({
          id: json.id,
          asin: json.asin,
          total_reviews: json.total_reviews,
          overall_rating: json.overall_rating,
          updated_at: json.updated_at,
          reviews_count: json.reviews_count || json.total_reviews || 0,
        })
        setLoading(false)
        return
      }

      // Apify returns immediately with status='pending' (background mode)
      if (json.status === 'pending' && json.id) {
        setFetchingIds((prev) => {
          const next = new Set(prev)
          next.add(json.id)
          return next
        })
        startPollingRef.current()
        toast.success('Review fetch started in background — you can navigate away')
        refreshHistory()
        setLoading(false)
        return
      }

      // Oxylabs returns full data synchronously
      setResults(json as ReviewsData)
      toast.success(
        `Fetched ${json.reviews_fetched} reviews` +
          (json.total_reviews ? ` out of ${json.total_reviews.toLocaleString()} total` : '')
      )
      refreshHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Placeholder — actual startPolling defined after refreshHistory
  const startPollingRef = useRef<() => void>(() => {})

  // --- Export reviews as CSV ---

  const handleExportReviews = useCallback(() => {
    if (!results?.reviews?.length) return

    const escape = (val: string) =>
      `"${(val || '').replace(/"/g, '""')}"`

    const rows = [
      'ASIN,Rating,Title,Content,Author,Verified,Helpful Count,Date,Variant,Image Count,Image URLs',
    ]

    for (const rev of results.reviews) {
      rows.push(
        [
          results.asin,
          rev.rating || 0,
          escape(rev.title || ''),
          escape(rev.content || ''),
          escape(rev.author || ''),
          rev.is_verified ? 'Yes' : 'No',
          rev.helpful_count || 0,
          escape(rev.timestamp || ''),
          escape(rev.product_attributes || ''),
          rev.images?.length || 0,
          escape(rev.images?.join(' | ') || ''),
        ].join(',')
      )
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reviews-${results.asin}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [results])

  // Load full review data from history item into main results view
  const loadFullResults = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/asin-reviews/${id}`)
      const json = await res.json()
      if (res.ok && json.data) {
        const d = json.data as LbAsinReview
        const raw = d.raw_response as Record<string, unknown> | null
        const reviewsData: ReviewsData = {
          id: d.id,
          asin: d.asin,
          marketplace: d.marketplace_domain,
          total_reviews: d.total_reviews,
          overall_rating: d.overall_rating,
          rating_stars_distribution: d.rating_stars_distribution,
          total_pages_available: d.total_pages_fetched,
          reviews_fetched: d.reviews?.length || 0,
          reviews: (d.reviews || []) as ReviewItem[],
          sort_by: d.sort_by,
          source: raw?.provider === 'apify' ? 'apify' : undefined,
          apify: raw?.provider === 'apify'
            ? {
                customersSay: (raw?.customersSay as string) || null,
                reviewAspects: (raw?.reviewAspects as ApifyExtras['reviewAspects']) || null,
                computeUnits: (raw?.computeUnits as number) || 0,
                durationMs: (raw?.durationMs as number) || 0,
                runId: (raw?.runId as string) || '',
              }
            : undefined,
          maxReviewsRequested: raw?.maxReviewsRequested as number | string | null ?? null,
        }
        setResults(reviewsData)
        setRatingFilter(null)
        setExpandedReviewId(null)
        setExpandedReviewData(null)
        // Scroll to top of results
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      toast.error('Failed to load reviews')
    }
  }, [])

  // Export reviews from a history item as CSV
  const handleExportHistoryReviews = useCallback(
    (data: ReviewsData) => {
      if (!data?.reviews?.length) return

      const escape = (val: string) =>
        `"${(val || '').replace(/"/g, '""')}"`

      const rows = [
        'ASIN,Rating,Title,Content,Author,Verified,Helpful Count,Date,Variant,Image Count,Image URLs',
      ]

      for (const rev of data.reviews) {
        rows.push(
          [
            data.asin,
            rev.rating || 0,
            escape(rev.title || ''),
            escape(rev.content || ''),
            escape(rev.author || ''),
            rev.is_verified ? 'Yes' : 'No',
            rev.helpful_count || 0,
            escape(rev.timestamp || ''),
            escape(rev.product_attributes || ''),
            rev.images?.length || 0,
            escape(rev.images?.join(' | ') || ''),
          ].join(',')
        )
      }

      const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reviews-${data.asin}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    []
  )

  const refreshHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (historySearch) params.set('search', historySearch)

      const res = await fetch(`/api/asin-reviews?${params}`)
      const json = await res.json()
      if (res.ok) {
        setReviews(json.data || [])
      }
    } catch {
      // silent
    }
  }, [historySearch])

  // --- Polling for background Apify fetches (defined after refreshHistory) ---

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      let changed = false
      // Use ref to avoid stale closure — fetchingIds state may be stale inside setInterval
      const stillFetching = new Set(fetchingIdsRef.current)

      if (stillFetching.size === 0) {
        stopPolling()
        return
      }

      for (const id of Array.from(stillFetching)) {
        try {
          const res = await fetch(`/api/asin-reviews/${id}`)
          if (!res.ok) continue
          const { data } = await res.json()

          if (data.status === 'completed') {
            stillFetching.delete(id)
            changed = true
            toast.success(
              `Reviews fetched for ${data.asin} (${data.reviews?.length || 0} reviews)`
            )
            // Auto-load completed results into main view
            loadFullResults(id)
          } else if (data.status === 'failed') {
            stillFetching.delete(id)
            changed = true
            toast.error(
              `Review fetch failed for ${data.asin}: ${data.error_message || 'Unknown error'}`
            )
          }
        } catch {
          // network error, keep polling
        }
      }

      if (changed) {
        setFetchingIds(new Set(stillFetching))
        refreshHistory()
      }

      if (stillFetching.size === 0) {
        stopPolling()
      }
    }, 3000)
  }, [stopPolling, refreshHistory, loadFullResults])

  // Keep the ref in sync
  startPollingRef.current = startPolling

  // Auto-resume polling on mount for in-progress fetches
  useEffect(() => {
    const inProgress = initialReviews.filter(
      (r) => r.status === 'fetching' || r.status === 'pending'
    )
    if (inProgress.length > 0) {
      const ids = new Set(
        inProgress.map((r) => r.id).filter(Boolean) as string[]
      )
      setFetchingIds(ids)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh history on mount to replace stale server data after navigation
  useEffect(() => {
    refreshHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start/restart polling when fetchingIds changes
  useEffect(() => {
    if (fetchingIds.size > 0 && !pollRef.current) {
      startPolling()
    }
  }, [fetchingIds, startPolling])

  const handleUpdateTagsNotes = async (id: string, updates: { tags?: string[]; notes?: string }) => {
    try {
      const res = await fetch(`/api/asin-reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
        fetchAllTags()
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  const toggleHistoryItem = async (itemId: string) => {
    if (expandedReviewId === itemId) {
      setExpandedReviewId(null)
      setExpandedReviewData(null)
      return
    }

    setExpandedReviewId(itemId)
    setExpandedReviewData(null)
    setExpandedPage(1)
    setLoadingHistoryId(itemId)

    try {
      const res = await fetch(`/api/asin-reviews/${itemId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        const d = json.data as LbAsinReview
        const rawExp = d.raw_response as Record<string, unknown> | null
        setExpandedReviewData({
          asin: d.asin,
          marketplace: d.marketplace_domain,
          total_reviews: d.total_reviews,
          overall_rating: d.overall_rating,
          rating_stars_distribution: d.rating_stars_distribution,
          total_pages_available: 0,
          reviews_fetched: d.reviews?.length || 0,
          reviews: (d.reviews || []) as ReviewItem[],
          sort_by: d.sort_by,
          source: rawExp?.provider === 'apify' ? 'apify' : undefined,
          apify: rawExp?.provider === 'apify'
            ? {
                customersSay: (rawExp?.customersSay as string) || null,
                reviewAspects: (rawExp?.reviewAspects as ApifyExtras['reviewAspects']) || null,
                computeUnits: (rawExp?.computeUnits as number) || 0,
                durationMs: (rawExp?.durationMs as number) || 0,
                runId: (rawExp?.runId as string) || '',
              }
            : undefined,
          maxReviewsRequested: rawExp?.maxReviewsRequested as number | string | null ?? null,
        })
      }
    } catch {
      // silent
    } finally {
      setLoadingHistoryId(null)
    }
  }

  const REVIEWS_PER_PAGE = 25

  const getFilteredReviews = (data: ReviewsData | null): ReviewItem[] => {
    if (!data) return []
    if (ratingFilter === null) return data.reviews
    return data.reviews.filter((r) => r.rating === ratingFilter)
  }

  const displayedReviews = getFilteredReviews(results)
  const totalPages = Math.ceil(displayedReviews.length / REVIEWS_PER_PAGE)
  const paginatedReviews = displayedReviews.slice(
    (currentPage - 1) * REVIEWS_PER_PAGE,
    currentPage * REVIEWS_PER_PAGE
  )

  const expandedReviews = expandedReviewData?.reviews || []
  const expandedTotalPages = Math.ceil(expandedReviews.length / REVIEWS_PER_PAGE)
  const expandedPaginatedReviews = expandedReviews.slice(
    (expandedPage - 1) * REVIEWS_PER_PAGE,
    expandedPage * REVIEWS_PER_PAGE
  )

  // Reset page when results or filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentPage(1) }, [results, ratingFilter])

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px_120px_120px_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium mb-1.5 block">ASIN</label>
            <Input
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleFetch()}
              placeholder="B0DLQ7D59R"
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Marketplace</label>
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
            <label className="text-sm font-medium mb-1.5 block">Reviews</label>
            <Select value={String(pages)} onValueChange={(v) => setPages(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">~50</SelectItem>
                <SelectItem value="10">~100</SelectItem>
                <SelectItem value="25">~250</SelectItem>
                <SelectItem value="50">~500</SelectItem>
                <SelectItem value="100">~1,000</SelectItem>
                <SelectItem value="300">~3,000</SelectItem>
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Sort</label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="helpful">Helpful</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Provider</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as 'oxylabs' | 'apify')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oxylabs">Oxylabs</SelectItem>
                <SelectItem value="apify">Apify</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => handleFetch()}
            disabled={loading || !asin.trim()}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquareIcon className="h-4 w-4" />
            )}
            {loading ? 'Fetching...' : 'Fetch Reviews'}
          </Button>
        </div>
        {asin.trim() && selectedCountry && (
          <p className="text-xs text-muted-foreground mt-2">
            Fetching reviews for {asin.trim().toUpperCase()} on{' '}
            {selectedCountry.amazon_domain} via {provider === 'apify' ? 'Apify' : 'Oxylabs'} ({pages === 0 ? 'all reviews' : `~${pages * 10} reviews max`}, sorted by {sortBy})
            {provider === 'apify' && <span className="ml-1 text-blue-600 dark:text-blue-400">— Apify runs may take 1-5 min</span>}
            {pages >= 100 && provider !== 'apify' && <span className="ml-1 text-amber-600 dark:text-amber-400">— large fetch, may take a while</span>}
          </p>
        )}
      </div>

      {/* Existing Reviews Confirmation Dialog */}
      <Dialog open={!!existingReviewInfo} onOpenChange={() => setExistingReviewInfo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reviews Already Exist</DialogTitle>
            <DialogDescription>
              Reviews for <span className="font-mono font-semibold">{existingReviewInfo?.asin}</span> have already been fetched.
            </DialogDescription>
          </DialogHeader>
          {existingReviewInfo && (
            <div className="space-y-2 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Fetched on</div>
                <div className="font-medium">
                  {new Date(existingReviewInfo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-muted-foreground">Reviews</div>
                <div className="font-medium">{existingReviewInfo.reviews_count.toLocaleString()}</div>
                {existingReviewInfo.overall_rating != null && (
                  <>
                    <div className="text-muted-foreground">Rating</div>
                    <div className="font-medium flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {existingReviewInfo.overall_rating}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => {
                if (existingReviewInfo) loadFullResults(existingReviewInfo.id)
                setExistingReviewInfo(null)
              }}
            >
              <Eye className="h-4 w-4" />
              View Existing
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={() => {
                setExistingReviewInfo(null)
                handleFetch(true)
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Re-fetch Reviews
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results */}
      {results && (
        <div>
          {/* Summary header */}
          <div className="rounded-lg border bg-card p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold">Reviews for {results.asin}</h2>
                  {results.source === 'apify' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      <Sparkles className="h-3 w-3" />
                      Apify
                    </Badge>
                  )}
                  {results.reviews.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportReviews}
                      className="gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV ({results.reviews.length})
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAsin(results.asin)
                      handleFetch(true)
                    }}
                    disabled={loading}
                    className="gap-1"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Re-fetch
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {results.reviews_fetched} reviews fetched on {results.marketplace}
                  {results.maxReviewsRequested != null && (
                    <span className="ml-1">
                      (requested: {results.maxReviewsRequested === 'all' || results.maxReviewsRequested === 0 ? 'all' : results.maxReviewsRequested})
                    </span>
                  )}
                  {results.source === 'amazon_product' && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      (top reviews only — enable amazon_reviews on Oxylabs for full pagination)
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {results.overall_rating != null && (
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-2xl font-bold">
                      <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
                      {results.overall_rating}
                    </div>
                    <p className="text-xs text-muted-foreground">overall rating</p>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setResultsCollapsed(!resultsCollapsed)}
                  className="h-8 w-8"
                  title={resultsCollapsed ? 'Expand results' : 'Collapse results'}
                >
                  {resultsCollapsed ? <ChevronDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {!resultsCollapsed && (
              <>
                {/* Apify AI Summary */}
                {results.apify?.customersSay && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3 mt-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Customers Say (AI Summary)
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">
                      {results.apify.customersSay}
                    </p>
                  </div>
                )}

                {/* Apify Review Aspects */}
                {results.apify?.reviewAspects && results.apify.reviewAspects.length > 0 && (
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3 mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Review Aspects (AI Analysis)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {results.apify.reviewAspects.map((aspect, i) => (
                        <div
                          key={i}
                          className="inline-flex items-center gap-1.5 text-xs rounded-md border bg-card px-2 py-1"
                        >
                          <span className="font-medium">{aspect.aspect}</span>
                          {aspect.positive > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              +{aspect.positive}
                            </span>
                          )}
                          {aspect.negative > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              -{aspect.negative}
                            </span>
                          )}
                          {aspect.mixed != null && aspect.mixed > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              ~{aspect.mixed}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apify run stats */}
                {results.apify && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Apify run: {(results.apify.computeUnits || 0).toFixed(4)} CU, {Math.round((results.apify.durationMs || 0) / 1000)}s
                  </p>
                )}

                {/* Rating distribution bar */}
                {results.rating_stars_distribution &&
                  results.rating_stars_distribution.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const dist = results.rating_stars_distribution?.find(
                          (d) => d.rating === star
                        )
                        const pct = parseInt(dist?.percentage || '0', 10)
                        const isActive = ratingFilter === star
                        return (
                          <button
                            key={star}
                            onClick={() =>
                              setRatingFilter(isActive ? null : star)
                            }
                            className={`flex items-center gap-2 w-full text-left rounded px-1.5 py-0.5 transition-colors ${
                              isActive
                                ? 'bg-primary/10 ring-1 ring-primary/30'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <span className="text-xs w-10 text-muted-foreground">
                              {star} star
                            </span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-yellow-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs w-8 text-right text-muted-foreground">
                              {pct}%
                            </span>
                          </button>
                        )
                      })}
                      {ratingFilter !== null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Showing {displayedReviews.length} reviews with {ratingFilter} star
                          {ratingFilter !== 1 ? 's' : ''}.{' '}
                          <button
                            onClick={() => setRatingFilter(null)}
                            className="text-primary underline"
                          >
                            Clear filter
                          </button>
                        </p>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Reviews list — hidden when collapsed */}
          {!resultsCollapsed && (
            <>
              {paginatedReviews.length === 0 ? (
                <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  No reviews found{ratingFilter !== null ? ' for this rating' : ''}.
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedReviews.map((review, i) => (
                    <ReviewCard key={review.id || i} review={review} />
                  ))}
                </div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <p className="text-xs text-muted-foreground">
                    Showing {((currentPage - 1) * REVIEWS_PER_PAGE) + 1}–{Math.min(currentPage * REVIEWS_PER_PAGE, displayedReviews.length)} of {displayedReviews.length} reviews
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-8 gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 gap-1"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Review History
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshHistory}
            className="gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Filter by ASIN..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refreshHistory()}
            className="max-w-xs text-sm"
          />
          <Button variant="outline" size="sm" onClick={refreshHistory}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          entityType="asin_review"
          onClear={clearSelection}
          onUpdate={() => { refreshHistory(); clearSelection() }}
        />

        {reviews.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No review fetches yet. Enter an ASIN above to get started.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            <div className="px-3 py-2 flex items-center gap-3 bg-muted/30">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === reviews.filter((r) => r.id).length}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </div>
            {reviews.map((r, rIdx) => {
              const isExpanded = expandedReviewId === r.id
              const isLoading = loadingHistoryId === r.id

              return (
                <div key={r.id} className={selectedIds.has(r.id || '') ? 'bg-primary/5' : ''}>
                  <div
                    className="p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => r.id && toggleHistoryItem(r.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id || '')}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (r.id) toggleSelect(r.id, rIdx, e.shiftKey)
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium font-mono">
                        {r.asin}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{r.marketplace_domain}</span>
                        {r.overall_rating != null && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {r.overall_rating}
                          </span>
                        )}
                        {r.total_reviews != null && (
                          <span>
                            {r.total_reviews.toLocaleString()} reviews
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0"
                        >
                          {r.sort_by}
                        </Badge>
                        {r.status === 'fetching' && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            Fetching...
                          </Badge>
                        )}
                        {r.status === 'pending' && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Pending
                          </Badge>
                        )}
                        {r.status === 'failed' && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">
                            Failed
                          </Badge>
                        )}
                        {(r.tags as string[] | undefined)?.map((tag) => (
                          <TagBadge key={tag} tag={tag} compact />
                        ))}
                        <NotesIndicator notes={(r.notes as string | null) ?? null} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(r.updated_at || r.created_at || '')}
                      </span>
                      {r.id && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <QuickActions
                            entityId={r.id}
                            entityType="asin_review"
                            tags={(r.tags as string[]) || []}
                            notes={(r.notes as string | null) ?? null}
                            onTagsChange={(tags) => handleUpdateTagsNotes(r.id!, { tags })}
                            onNotesChange={(notes) => handleUpdateTagsNotes(r.id!, { notes })}
                          />
                        </div>
                      )}
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded reviews */}
                  {isExpanded && expandedReviewData && (
                    <div className="border-t bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          <p>{expandedReviewData.reviews_fetched} reviews loaded
                            {expandedReviewData.maxReviewsRequested != null && (
                              <span className="ml-1">(requested: {expandedReviewData.maxReviewsRequested === 'all' || expandedReviewData.maxReviewsRequested === 0 ? 'all' : expandedReviewData.maxReviewsRequested})</span>
                            )}
                          </p>
                          {r.status === 'failed' && r.error_message && (
                            <p className="text-destructive mt-0.5">Error: {r.error_message as string}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {expandedReviewData.reviews.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleExportHistoryReviews(expandedReviewData)
                              }}
                            >
                              <Download className="h-3 w-3" />
                              Export CSV
                            </Button>
                          )}
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1 h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              loadFullResults(r.id!)
                            }}
                          >
                            View All {expandedReviewData.reviews_fetched} Reviews
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {expandedPaginatedReviews.map((review, i) => (
                          <ReviewCard key={review.id || i} review={review} />
                        ))}
                      </div>
                      {expandedTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 px-1">
                          <p className="text-xs text-muted-foreground">
                            Showing {((expandedPage - 1) * REVIEWS_PER_PAGE) + 1}&ndash;{Math.min(expandedPage * REVIEWS_PER_PAGE, expandedReviews.length)} of {expandedReviews.length} reviews
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={expandedPage <= 1}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedPage((p) => Math.max(1, p - 1))
                              }}
                              className="h-8 gap-1"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {expandedPage} of {expandedTotalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={expandedPage >= expandedTotalPages}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedPage((p) => Math.min(expandedTotalPages, p + 1))
                              }}
                              className="h-8 gap-1"
                            >
                              Next
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
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
  )
}

function ReviewCard({
  review,
  compact,
}: {
  review: ReviewItem
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const contentPreview = review.content?.length > 300 && !expanded
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const allImages = review.images || []

  return (
    <div
      className={`rounded-lg border bg-card ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Stars + title */}
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3.5 w-3.5 ${
                    i < review.rating
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'fill-muted text-muted'
                  }`}
                />
              ))}
            </div>
            <p
              className={`font-medium ${
                compact ? 'text-xs' : 'text-sm'
              } line-clamp-1`}
            >
              {review.title?.replace(/^\d+(\.\d+)?\s+out\s+of\s+\d+\s+stars?\s*/i, '') || 'No title'}
            </p>
          </div>

          {/* Author + metadata */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
            <span>{review.author || 'Anonymous'}</span>
            {review.timestamp && (
              <span>{review.timestamp.replace(/^Reviewed\s+in\s+/i, '')}</span>
            )}
            {review.is_verified && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1 py-0 gap-0.5"
              >
                <CheckCircle className="h-2.5 w-2.5" />
                Verified
              </Badge>
            )}
            {review.helpful_count > 0 && (
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" />
                {review.helpful_count}
              </span>
            )}
            {review.images && review.images.length > 0 && (
              <span className="flex items-center gap-0.5">
                <ImageIcon className="h-3 w-3" />
                {review.images.length}
              </span>
            )}
          </div>

          {/* Product attributes */}
          {review.product_attributes && (
            <p className="text-[10px] text-muted-foreground mb-1.5">
              {review.product_attributes}
            </p>
          )}

          {/* Content */}
          {review.content && (
            <div>
              <p className="text-sm leading-relaxed">
                {contentPreview
                  ? review.content.slice(0, 300) + '...'
                  : review.content}
              </p>
              {review.content.length > 300 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* Review images */}
          {allImages.length > 0 && !compact && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setLightboxImage(img)
                    setLightboxIndex(i)
                  }}
                  className="w-16 h-16 rounded overflow-hidden bg-muted flex-shrink-0 hover:opacity-80 hover:ring-2 hover:ring-primary/50 transition-all"
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-3xl p-0 bg-black/95 border-none [&>button]:hidden">
          <div className="relative flex items-center justify-center min-h-[400px]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
              onClick={() => setLightboxImage(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            {allImages.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() => {
                    const prev =
                      (lightboxIndex - 1 + allImages.length) % allImages.length
                    setLightboxIndex(prev)
                    setLightboxImage(allImages[prev])
                  }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() => {
                    const next = (lightboxIndex + 1) % allImages.length
                    setLightboxIndex(next)
                    setLightboxImage(allImages[next])
                  }}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
            {lightboxImage && (
              <img
                src={lightboxImage}
                alt="Review image"
                className="max-h-[80vh] max-w-full object-contain p-8"
              />
            )}
            {allImages.length > 1 && (
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-xs">
                {lightboxIndex + 1} / {allImages.length}
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
