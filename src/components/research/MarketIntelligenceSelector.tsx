'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronDown,
  ChevronRight,
  BarChart3,
  Link2,
  Unlink,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface MiOption {
  id: string
  keyword: string
  keywords: string[] | null
  selected_asins: string[] | null
  top_asins: string[] | null
  created_at: string
}

interface MarketIntelligenceSelectorProps {
  categoryId: string
  countryId: string
  linkedMiId: string | null
  onLinkChange?: () => void
}

export function MarketIntelligenceSelector({
  categoryId,
  countryId,
  linkedMiId,
  onLinkChange,
}: MarketIntelligenceSelectorProps) {
  const [isCollapsed, setIsCollapsed] = useState(!linkedMiId)
  const [options, setOptions] = useState<MiOption[]>([])
  const [selectedMiId, setSelectedMiId] = useState<string>('')
  const [linking, setLinking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)

  // The currently linked MI details
  const linkedMi = linkedMiId ? options.find((o) => o.id === linkedMiId) : null

  const fetchOptions = useCallback(async () => {
    if (!countryId) return
    setLoadingOptions(true)
    try {
      const res = await fetch(`/api/research/market-intelligence?country_id=${countryId}`)
      const json = await res.json()
      if (res.ok) {
        setOptions(json.data || [])
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingOptions(false)
    }
  }, [countryId])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  // Auto-expand if already linked
  useEffect(() => {
    if (linkedMiId) setIsCollapsed(false)
  }, [linkedMiId])

  const handleLink = async () => {
    if (!selectedMiId) {
      toast.error('Select a Market Intelligence report first')
      return
    }
    setLinking(true)
    try {
      const res = await fetch('/api/research/market-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          country_id: countryId,
          market_intelligence_id: selectedMiId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to link')
      toast.success('Market Intelligence linked!')
      setSelectedMiId('')
      onLinkChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      const res = await fetch(
        `/api/research/market-intelligence?category_id=${categoryId}&country_id=${countryId}`,
        { method: 'DELETE' }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to unlink')
      toast.success('Market Intelligence unlinked')
      onLinkChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink')
    } finally {
      setUnlinking(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatKeywords = (mi: MiOption) => {
    const kws = mi.keywords?.length ? mi.keywords : [mi.keyword]
    return kws.join(', ')
  }

  const getProductCount = (mi: MiOption) => {
    // selected_asins is set for multi-keyword MI with explicit product selection
    // top_asins is set for single-keyword MI where all discovered products are analyzed
    return mi.selected_asins?.length || mi.top_asins?.length || 0
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <BarChart3 className="h-4 w-4 text-blue-500" />
          <h3 className="font-medium">Market Intelligence</h3>
          {linkedMiId ? (
            <Badge variant="success" className="text-xs">Linked</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Not linked</Badge>
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4">
          {linkedMi ? (
            // ── Linked state ──
            <div className="rounded-md border bg-green-50/50 dark:bg-green-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Linked Report</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open('/asin-lookup?tab=market-intelligence', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Full Report
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={handleUnlink}
                    disabled={unlinking}
                  >
                    {unlinking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlink className="h-3 w-3" />
                    )}
                    Unlink
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Keywords:</span>{' '}
                  {formatKeywords(linkedMi)}
                </p>
                <p>
                  <span className="font-medium text-foreground">Competitors:</span>{' '}
                  {getProductCount(linkedMi)} products analyzed
                </p>
                <p>
                  <span className="font-medium text-foreground">Date:</span>{' '}
                  {formatDate(linkedMi.created_at)}
                </p>
              </div>
            </div>
          ) : (
            // ── Unlinked state ──
            <>
              <p className="text-sm text-muted-foreground">
                Link a completed Market Intelligence report to use its competitive data for listing and image generation.
              </p>

              {loadingOptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading available reports...
                </div>
              ) : options.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No completed Market Intelligence reports for this marketplace yet.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => window.open('/asin-lookup?tab=market-intelligence', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Start New in ASIN Lookup
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-medium">Select Report</label>
                    <Select value={selectedMiId} onValueChange={setSelectedMiId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a Market Intelligence report..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((mi) => (
                          <SelectItem key={mi.id} value={mi.id}>
                            {formatKeywords(mi)} — {getProductCount(mi)} products — {formatDate(mi.created_at)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleLink}
                    disabled={linking || !selectedMiId}
                    className="gap-1"
                  >
                    {linking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    Link
                  </Button>
                </div>
              )}

              {options.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs gap-1"
                    onClick={() => window.open('/asin-lookup?tab=market-intelligence', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Start New MI in ASIN Lookup
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
