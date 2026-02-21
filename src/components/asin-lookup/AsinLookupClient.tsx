'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Search, Star, TrendingUp, Clock, RefreshCw, ChevronDown, ChevronUp, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbCountry, LbAsinLookup } from '@/types'
import type { OxylabsProductResult } from '@/lib/oxylabs'
import { AsinResultCard } from './AsinResultCard'
import { TagBadge } from '@/components/shared/TagInput'
import { NotesIndicator } from '@/components/shared/NotesEditor'
import { CollectionBadges } from '@/components/shared/CollectionPicker'
import { QuickActions } from '@/components/shared/QuickActions'
import { BulkActionBar } from '@/components/shared/BulkActionBar'
import { useCollectionStore } from '@/stores/collection-store'

interface AsinLookupClientProps {
  countries: LbCountry[]
  initialLookups: Partial<LbAsinLookup>[]
}

interface QnAItem {
  question: string
  answer: string
  votes: number
  author?: string
  date?: string
}

interface FetchResult {
  asin: string
  success: boolean
  error?: string
  data?: OxylabsProductResult
  saved_id?: string
  questions?: QnAItem[]
}

export function AsinLookupClient({
  countries,
  initialLookups,
}: AsinLookupClientProps) {
  const [asinInput, setAsinInput] = useState('')
  const [countryId, setCountryId] = useState(
    countries.find((c) => c.code === 'US')?.id || countries[0]?.id || ''
  )
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<FetchResult[]>([])
  const [lookups, setLookups] = useState<Partial<LbAsinLookup>[]>(initialLookups)
  const [historySearch, setHistorySearch] = useState('')
  const [historyCountry, setHistoryCountry] = useState<string>('')
  const [expandedLookupId, setExpandedLookupId] = useState<string | null>(null)
  const [expandedLookupData, setExpandedLookupData] = useState<Record<string, unknown> | null>(null)
  const [expandedLookupQuestions, setExpandedLookupQuestions] = useState<QnAItem[] | undefined>(undefined)
  const [loadingLookupId, setLoadingLookupId] = useState<string | null>(null)
  const [historyTag, setHistoryTag] = useState('')
  const [membershipsMap, setMembershipsMap] = useState<
    Record<string, Array<{ collection_id: string; name: string; color: string }>>
  >({})
  const [ownProductAsins, setOwnProductAsins] = useState<Record<string, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdx = useRef<number>(-1)

  const selectedCountry = countries.find((c) => c.id === countryId)
  const allTags = useCollectionStore((s) => s.allTags)

  // Fetch collection memberships for all displayed lookups
  const fetchMemberships = useCallback(async (lookupList: Partial<LbAsinLookup>[]) => {
    const ids = lookupList.map((l) => l.id).filter(Boolean) as string[]
    if (ids.length === 0) return
    try {
      const res = await fetch(
        `/api/collections/memberships?entity_type=asin_lookup&entity_ids=${ids.join(',')}`
      )
      const json = await res.json()
      if (json.data) {
        setMembershipsMap(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  // Fetch "own product" status for displayed lookups
  const fetchOwnProducts = useCallback(async (lookupList: Partial<LbAsinLookup>[]) => {
    const asins = lookupList.map((l) => l.asin).filter(Boolean) as string[]
    if (asins.length === 0) return
    try {
      const uniqueAsins = Array.from(new Set(asins))
      const res = await fetch(`/api/products/check-asins?asins=${uniqueAsins.join(',')}`)
      const json = await res.json()
      if (json.data) {
        setOwnProductAsins(json.data)
      }
    } catch {
      // silent
    }
  }, [])

  // Fetch memberships and own products when lookups change
  useEffect(() => {
    fetchMemberships(lookups)
    fetchOwnProducts(lookups)
  }, [lookups, fetchMemberships, fetchOwnProducts])

  const handleUpdateTagsNotes = async (id: string, updates: { tags?: string[]; notes?: string }) => {
    try {
      const res = await fetch(`/api/asin-lookup/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setLookups((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)))
      }
    } catch {
      // silent
    }
  }

  const toggleSelect = (id: string, idx: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdx.current >= 0) {
        const start = Math.min(lastClickedIdx.current, idx)
        const end = Math.max(lastClickedIdx.current, idx)
        for (let i = start; i <= end; i++) {
          const lid = lookups[i]?.id
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
    const allIds = lookups.map((l) => l.id).filter(Boolean) as string[]
    setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const parseAsins = useCallback((input: string): string[] => {
    return input
      .split(/[,\n\r]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0)
  }, [])

  const handleFetch = async () => {
    const asins = parseAsins(asinInput)
    if (asins.length === 0) {
      toast.error('Enter at least one ASIN')
      return
    }
    if (asins.length > 10) {
      toast.error('Maximum 10 ASINs at a time')
      return
    }

    setLoading(true)
    setResults([])

    try {
      const res = await fetch('/api/asin-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins, country_id: countryId }),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch')
      }

      const fetchResults = json.results as FetchResult[]
      setResults(fetchResults)

      const successCount = fetchResults.filter((r) => r.success).length
      const failCount = fetchResults.filter((r) => !r.success).length

      if (successCount > 0 && failCount === 0) {
        toast.success(`Fetched ${successCount} product${successCount > 1 ? 's' : ''}`)
      } else if (successCount > 0 && failCount > 0) {
        toast.success(`Fetched ${successCount}, ${failCount} failed`)
      } else {
        toast.error('All lookups failed')
      }

      // Refresh history
      refreshHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const refreshHistory = async () => {
    try {
      const params = new URLSearchParams()
      if (historySearch) params.set('search', historySearch)
      if (historyCountry) params.set('country_id', historyCountry)
      if (historyTag) params.set('tag', historyTag)

      const res = await fetch(`/api/asin-lookup?${params}`)
      const json = await res.json()
      if (res.ok) {
        setLookups(json.data || [])
      }
    } catch {
      // silent
    }
  }

  const handleHistorySearch = () => {
    refreshHistory()
  }

  const toggleHistoryItem = async (lookupId: string, lookupAsin?: string, lookupCountryId?: string) => {
    if (expandedLookupId === lookupId) {
      // Collapse
      setExpandedLookupId(null)
      setExpandedLookupData(null)
      setExpandedLookupQuestions(undefined)
      return
    }

    // Expand — fetch full record with raw_response + Q&A
    setExpandedLookupId(lookupId)
    setExpandedLookupData(null)
    setExpandedLookupQuestions(undefined)
    setLoadingLookupId(lookupId)

    try {
      const res = await fetch(`/api/asin-lookup/${lookupId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setExpandedLookupData(json.data.raw_response || json.data)

        // Also fetch Q&A if we have asin + country_id
        if (lookupAsin && lookupCountryId) {
          try {
            const qRes = await fetch(`/api/asin-questions?asin=${lookupAsin}&country_id=${lookupCountryId}`)
            const qJson = await qRes.json()
            if (qRes.ok && qJson.questions) {
              setExpandedLookupQuestions(qJson.questions)
            }
          } catch {
            // Q&A fetch is non-blocking
          }
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingLookupId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              ASINs{' '}
              <span className="text-muted-foreground font-normal">
                (comma or newline separated, max 10)
              </span>
            </label>
            <Textarea
              value={asinInput}
              onChange={(e) => setAsinInput(e.target.value)}
              placeholder="B08N5WRWNW, B09V3KXJPB, B07FZ8S74R..."
              rows={2}
              className="font-mono text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Marketplace
            </label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select marketplace" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji} {c.name} ({c.amazon_domain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleFetch}
            disabled={loading || !asinInput.trim()}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? 'Fetching...' : 'Fetch Data'}
          </Button>
        </div>
        {asinInput.trim() && (
          <p className="text-xs text-muted-foreground mt-2">
            {parseAsins(asinInput).length} ASIN
            {parseAsins(asinInput).length !== 1 ? 's' : ''} detected
            {selectedCountry &&
              ` \u2014 will fetch from ${selectedCountry.amazon_domain}`}
          </p>
        )}
      </div>

      {/* Active Results */}
      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Results ({results.filter((r) => r.success).length}/
            {results.length} successful)
          </h2>
          <div className="space-y-3">
            {results.map((r) =>
              r.success && r.data ? (
                <AsinResultCard
                  key={r.asin}
                  asin={r.asin}
                  data={r.data}
                  marketplace={selectedCountry?.amazon_domain || ''}
                  savedId={r.saved_id}
                  questions={r.questions}
                />
              ) : (
                <div
                  key={r.asin}
                  className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4"
                >
                  <p className="text-sm font-mono font-medium">{r.asin}</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {r.error}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Lookup History
          </h2>
          <Button variant="ghost" size="sm" onClick={refreshHistory} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* History Filters */}
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Search by ASIN, title, or brand..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleHistorySearch()}
            className="max-w-xs text-sm"
          />
          <Select
            value={historyCountry}
            onValueChange={(v) => {
              setHistoryCountry(v === 'all' ? '' : v)
              setTimeout(refreshHistory, 0)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All marketplaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All marketplaces</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select
              value={historyTag}
              onValueChange={(v) => {
                setHistoryTag(v === 'all' ? '' : v)
                setTimeout(refreshHistory, 0)
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleHistorySearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          entityType="asin_lookup"
          onClear={clearSelection}
          onUpdate={() => { refreshHistory(); clearSelection() }}
        />

        {lookups.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No lookups yet. Enter ASINs above to fetch product data.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            <div className="px-3 py-2 flex items-center gap-3 bg-muted/30">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === lookups.filter((l) => l.id).length}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </div>
            {lookups.map((lookup, lookupIdx) => {
              const firstImage = (lookup.images as string[] | undefined)?.[0]
              const bsr = (
                lookup.sales_rank as Array<{ rank: number }> | undefined
              )?.[0]
              const isExpanded = expandedLookupId === lookup.id
              const isLoading = loadingLookupId === lookup.id

              return (
                <div key={lookup.id} className={selectedIds.has(lookup.id || '') ? 'bg-primary/5' : ''}>
                  {/* Clickable row */}
                  <div
                    className="p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => lookup.id && toggleHistoryItem(lookup.id, lookup.asin, lookup.country_id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lookup.id || '')}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (lookup.id) toggleSelect(lookup.id, lookupIdx, e.shiftKey)
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer flex-shrink-0"
                    />
                    {firstImage && (
                      <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
                        <img
                          src={firstImage}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {lookup.title || lookup.asin}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{lookup.asin}</span>
                        <span>{lookup.marketplace_domain}</span>
                        {lookup.brand && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {lookup.brand}
                          </Badge>
                        )}
                        {lookup.asin && ownProductAsins[lookup.asin] && (
                          <Badge className="text-[10px] px-1 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-0.5">
                            <Package className="h-2.5 w-2.5" />
                            Own
                          </Badge>
                        )}
                        {lookup.amazon_choice && (
                          <Badge className="text-[10px] px-1 py-0 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                            Choice
                          </Badge>
                        )}
                        {(lookup.tags as string[] | undefined)?.map((tag) => (
                          <TagBadge key={tag} tag={tag} compact />
                        ))}
                        <NotesIndicator notes={(lookup.notes as string | null) ?? null} />
                        {lookup.id && membershipsMap[lookup.id] && (
                          <CollectionBadges memberships={membershipsMap[lookup.id]} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-sm">
                      {lookup.sales_volume && (
                        <span className="text-[10px] text-green-600 dark:text-green-400 font-medium hidden sm:inline">
                          {lookup.sales_volume}
                        </span>
                      )}
                      {lookup.price != null && (
                        <span className="font-medium">
                          {lookup.currency || '$'}
                          {Number(lookup.price).toFixed(2)}
                        </span>
                      )}
                      {lookup.rating != null && (
                        <span className="flex items-center gap-0.5 text-muted-foreground">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {lookup.rating}
                        </span>
                      )}
                      {bsr && (
                        <span className="flex items-center gap-0.5 text-muted-foreground hidden sm:flex">
                          <TrendingUp className="h-3 w-3" />#{bsr.rank?.toLocaleString()}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {formatTimeAgo(lookup.updated_at || lookup.created_at || '')}
                      </span>
                      {lookup.id && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <QuickActions
                            entityId={lookup.id}
                            entityType="asin_lookup"
                            tags={(lookup.tags as string[]) || []}
                            notes={(lookup.notes as string | null) ?? null}
                            onTagsChange={(tags) => handleUpdateTagsNotes(lookup.id!, { tags })}
                            onNotesChange={(notes) => handleUpdateTagsNotes(lookup.id!, { notes })}
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

                  {/* Expanded detail card */}
                  {isExpanded && expandedLookupData && (
                    <div className="border-t bg-muted/20 p-3">
                      <AsinResultCard
                        asin={lookup.asin || ''}
                        data={expandedLookupData as OxylabsProductResult}
                        marketplace={lookup.marketplace_domain || ''}
                        defaultExpanded
                        questions={expandedLookupQuestions}
                      />
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
