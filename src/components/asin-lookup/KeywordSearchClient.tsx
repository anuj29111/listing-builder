'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Search, Star, TrendingUp, Crown, Clock, RefreshCw, ExternalLink, Megaphone, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbCountry, LbKeywordSearch } from '@/types'
import type { OxylabsSearchResultItem } from '@/lib/oxylabs'

interface KeywordSearchClientProps {
  countries: LbCountry[]
  initialSearches: Partial<LbKeywordSearch>[]
}

interface SearchResultsData {
  keyword: string
  marketplace: string
  total_results_count: number | null
  organic: OxylabsSearchResultItem[]
  sponsored: OxylabsSearchResultItem[]
  amazons_choices: OxylabsSearchResultItem[]
}

function toAbsoluteAmazonUrl(url: string, marketplace: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  const domain = marketplace || 'amazon.com'
  return `https://www.${domain}${url.startsWith('/') ? '' : '/'}${url}`
}

export function KeywordSearchClient({
  countries,
  initialSearches,
}: KeywordSearchClientProps) {
  const [keyword, setKeyword] = useState('')
  const [countryId, setCountryId] = useState(
    countries.find((c) => c.code === 'US')?.id || countries[0]?.id || ''
  )
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultsData | null>(null)
  const [activeTab, setActiveTab] = useState<'organic' | 'sponsored' | 'amazons_choices'>('organic')
  const [searches, setSearches] = useState<Partial<LbKeywordSearch>[]>(initialSearches)
  const [historySearch, setHistorySearch] = useState('')
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)

  const selectedCountry = countries.find((c) => c.id === countryId)

  const handleSearch = async () => {
    if (!keyword.trim()) {
      toast.error('Enter a keyword')
      return
    }

    setLoading(true)
    setResults(null)

    try {
      const res = await fetch('/api/keyword-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), country_id: countryId, pages }),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Search failed')
      }

      setResults(json as SearchResultsData)
      setActiveTab('organic')

      const totalProducts =
        (json.organic?.length || 0) +
        (json.sponsored?.length || 0) +
        (json.amazons_choices?.length || 0)
      toast.success(`Found ${totalProducts} products${json.total_results_count ? ` (${json.total_results_count.toLocaleString()} total)` : ''}`)

      refreshHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const refreshHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (historySearch) params.set('search', historySearch)

      const res = await fetch(`/api/keyword-search?${params}`)
      const json = await res.json()
      if (res.ok) {
        setSearches(json.data || [])
      }
    } catch {
      // silent
    }
  }, [historySearch])

  const loadHistoryItem = async (searchId: string, searchKeyword: string, marketplace: string) => {
    setLoadingHistoryId(searchId)

    try {
      const res = await fetch(`/api/keyword-search/${searchId}`)
      const json = await res.json()

      if (res.ok && json.data) {
        const data = json.data as LbKeywordSearch
        setResults({
          keyword: data.keyword,
          marketplace: marketplace,
          total_results_count: data.total_results_count,
          organic: (data.organic_results || []) as unknown as OxylabsSearchResultItem[],
          sponsored: (data.sponsored_results || []) as unknown as OxylabsSearchResultItem[],
          amazons_choices: (data.amazons_choices || []) as unknown as OxylabsSearchResultItem[],
        })
        setActiveTab('organic')
        setKeyword(searchKeyword)

        // Scroll to results
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        toast.error('Failed to load search results')
      }
    } catch {
      toast.error('Failed to load search results')
    } finally {
      setLoadingHistoryId(null)
    }
  }

  const getActiveResults = (): OxylabsSearchResultItem[] => {
    if (!results) return []
    switch (activeTab) {
      case 'organic': return results.organic || []
      case 'sponsored': return results.sponsored || []
      case 'amazons_choices': return results.amazons_choices || []
      default: return []
    }
  }

  const activeResults = getActiveResults()

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_100px_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Search Keyword
            </label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleSearch()}
              placeholder="chalk markers, watercolor brush pens..."
              className="text-sm"
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
                    {c.flag_emoji} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Pages</label>
            <Select value={String(pages)} onValueChange={(v) => setPages(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p} page{p > 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !keyword.trim()}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
        {keyword.trim() && selectedCountry && (
          <p className="text-xs text-muted-foreground mt-2">
            Searching &ldquo;{keyword.trim()}&rdquo; on {selectedCountry.amazon_domain} ({pages} page{pages > 1 ? 's' : ''})
          </p>
        )}
      </div>

      {/* Search Results */}
      {results && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">
                Results for &ldquo;{results.keyword}&rdquo;
              </h2>
              {results.total_results_count != null && (
                <p className="text-xs text-muted-foreground">
                  {results.total_results_count.toLocaleString()} total results on {results.marketplace}
                </p>
              )}
            </div>
          </div>

          {/* Result type tabs */}
          <div className="flex gap-1 mb-4 border-b">
            <button
              onClick={() => setActiveTab('organic')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'organic'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Organic ({results.organic?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('sponsored')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sponsored'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Megaphone className="h-3 w-3 inline mr-1" />
              Sponsored ({results.sponsored?.length || 0})
            </button>
            {results.amazons_choices && results.amazons_choices.length > 0 && (
              <button
                onClick={() => setActiveTab('amazons_choices')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'amazons_choices'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Crown className="h-3 w-3 inline mr-1" />
                Amazon&apos;s Choice ({results.amazons_choices.length})
              </button>
            )}
          </div>

          {/* Results table */}
          {activeResults.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              No {activeTab.replace('_', ' ')} results found.
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[40px_56px_1fr_90px_90px_80px_80px] gap-3 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/40">
                <span>#</span>
                <span></span>
                <span>Product</span>
                <span className="text-right">Price</span>
                <span className="text-right">Rating</span>
                <span className="text-right">Reviews</span>
                <span></span>
              </div>

              {/* Rows */}
              <div className="divide-y">
                {activeResults.map((item, i) => (
                  <div
                    key={`${item.asin}-${i}`}
                    className="grid grid-cols-[40px_56px_1fr_90px_90px_80px_80px] gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                  >
                    {/* Position */}
                    <span className="text-sm font-mono text-muted-foreground">
                      {item.pos || i + 1}
                    </span>

                    {/* Image */}
                    {item.url_image ? (
                      <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={item.url_image}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex-shrink-0" />
                    )}

                    {/* Product info */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium line-clamp-2 leading-tight">
                        {item.title || 'No title'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {item.asin}
                        </span>
                        {item.manufacturer && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {item.manufacturer}
                          </Badge>
                        )}
                        {item.is_prime && (
                          <Badge className="text-[10px] px-1 py-0 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Prime
                          </Badge>
                        )}
                        {item.is_amazons_choice && (
                          <Badge className="text-[10px] px-1 py-0 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                            Choice
                          </Badge>
                        )}
                        {item.best_seller && (
                          <Badge className="text-[10px] px-1 py-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Best Seller
                          </Badge>
                        )}
                        {item.sales_volume && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                            {item.sales_volume}
                          </span>
                        )}
                        {item.coupon_discount != null && item.coupon_discount > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-700">
                            {item.coupon_discount_type === 'percentage' ? `${item.coupon_discount}% off` : `$${item.coupon_discount} off`}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      {item.price != null ? (
                        <div>
                          <span className="text-sm font-bold">
                            {item.currency || '$'}{item.price.toFixed(2)}
                          </span>
                          {item.price_strikethrough != null && item.price_strikethrough > item.price && (
                            <span className="block text-[10px] text-muted-foreground line-through">
                              {item.currency || '$'}{item.price_strikethrough.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Rating */}
                    <div className="text-right">
                      {item.rating != null ? (
                        <span className="flex items-center justify-end gap-0.5 text-sm">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {item.rating}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>

                    {/* Reviews */}
                    <span className="text-sm text-right text-muted-foreground">
                      {item.reviews_count != null ? item.reviews_count.toLocaleString() : '-'}
                    </span>

                    {/* Link */}
                    {item.url && (
                      <a
                        href={toAbsoluteAmazonUrl(item.url, results?.marketplace || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Search History
          </h2>
          <Button variant="ghost" size="sm" onClick={refreshHistory} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Filter by keyword..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refreshHistory()}
            className="max-w-xs text-sm"
          />
          <Button variant="outline" size="sm" onClick={refreshHistory}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {searches.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No keyword searches yet. Enter a keyword above to search.
          </div>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {searches.map((s) => {
              const isLoading = loadingHistoryId === s.id
              return (
                <div
                  key={s.id}
                  className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (s.id && !isLoading) {
                      loadHistoryItem(s.id, s.keyword || '', s.marketplace_domain || '')
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">&ldquo;{s.keyword}&rdquo;</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{s.marketplace_domain}</span>
                      {s.total_results_count != null && (
                        <span className="flex items-center gap-0.5">
                          <TrendingUp className="h-3 w-3" />
                          {s.total_results_count.toLocaleString()} results
                        </span>
                      )}
                      <span>{s.pages_fetched} page{(s.pages_fetched || 1) > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(s.updated_at || s.created_at || '')}
                    </span>
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
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
