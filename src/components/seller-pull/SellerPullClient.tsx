'use client'

import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Store,
  Download,
  Search,
  Loader2,
  Check,
  X,
  Package,
  AlertCircle,
  ScanSearch,
  ChevronDown,
  ChevronUp,
  Eye,
  GitBranch,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Country {
  id: string
  name: string
  code: string
  language: string
  amazon_domain: string
  flag_emoji: string | null
  is_active: boolean
}

interface PulledProduct {
  asin: string
  title: string
  price: number | null
  rating: number | null
  reviews_count: number | null
  is_prime: boolean
  url_image: string | null
  manufacturer: string | null
  sales_volume: string | null
  is_bundle: boolean
  exists_in_system: boolean
}

interface PullSummary {
  total: number
  bundles: number
  non_bundles: number
  already_in_system: number
  new: number
  pages_scraped: number
  total_pages: number
}

interface ScrapeResult {
  asin: string
  success: boolean
  error?: string
  parent_asin?: string
  title?: string
}

interface VariationResult {
  asin: string
  title: string
  parent_asin: string
  is_new: boolean
  dimensions?: Record<string, string>
}

interface SellerPullClientProps {
  countries: Country[]
}

type Step = 'pull' | 'import' | 'scrape' | 'variations' | 'done'

export function SellerPullClient({ countries }: SellerPullClientProps) {
  // State
  const [selectedCountryId, setSelectedCountryId] = useState<string>(countries[0]?.id || '')
  const [products, setProducts] = useState<PulledProduct[]>([])
  const [summary, setSummary] = useState<PullSummary | null>(null)
  const [sellerId, setSellerId] = useState<string>('')
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set())
  const [hideBundles, setHideBundles] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [defaultCategory, setDefaultCategory] = useState('')

  // Step tracking
  const [currentStep, setCurrentStep] = useState<Step>('pull')
  const [pulling, setPulling] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [discoveringVariations, setDiscoveringVariations] = useState(false)

  // Progress
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 })

  // Results
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [scrapeResults, setScrapeResults] = useState<ScrapeResult[]>([])
  const [variationResults, setVariationResults] = useState<VariationResult[]>([])
  const [selectedVariations, setSelectedVariations] = useState<Set<string>>(new Set())

  // Derived
  const selectedCountry = countries.find((c) => c.id === selectedCountryId)

  const filteredProducts = useMemo(() => {
    let filtered = products
    if (hideBundles) {
      filtered = filtered.filter((p) => !p.is_bundle)
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.asin.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          (p.manufacturer || '').toLowerCase().includes(q)
      )
    }
    return filtered
  }, [products, hideBundles, searchFilter])

  // ─── PULL ─────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (!selectedCountryId) return
    setPulling(true)
    setProducts([])
    setSummary(null)
    setSelectedAsins(new Set())
    setImportResult(null)
    setScrapeResults([])
    setVariationResults([])
    setCurrentStep('pull')

    try {
      const res = await fetch('/api/seller-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_id: selectedCountryId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Pull failed')

      setProducts(json.products)
      setSummary(json.summary)
      setSellerId(json.seller_id)

      // Auto-select all non-bundle, new products
      const newNonBundles = (json.products as PulledProduct[])
        .filter((p) => !p.is_bundle && !p.exists_in_system)
        .map((p) => p.asin)
      setSelectedAsins(new Set(newNonBundles))

      toast.success(
        `Pulled ${json.summary.total} products (${json.summary.non_bundles} non-bundles, ${json.summary.new} new)`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pull failed')
    } finally {
      setPulling(false)
    }
  }, [selectedCountryId])

  // ─── IMPORT ───────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (selectedAsins.size === 0) {
      toast.error('No products selected')
      return
    }

    setImporting(true)
    try {
      const selectedProducts = products
        .filter((p) => selectedAsins.has(p.asin))
        .map((p) => ({
          asin: p.asin,
          title: p.title,
          brand: p.manufacturer || undefined,
        }))

      const res = await fetch('/api/seller-pull/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: selectedProducts,
          default_category: defaultCategory || 'Uncategorized',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      setImportResult({ imported: json.imported, skipped: json.skipped })
      setCurrentStep('scrape')

      // Update exists_in_system for imported products
      setProducts((prev) =>
        prev.map((p) =>
          selectedAsins.has(p.asin) ? { ...p, exists_in_system: true } : p
        )
      )

      toast.success(`Imported ${json.imported} products`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [selectedAsins, products, defaultCategory])

  // ─── SCRAPE ───────────────────────────────────────
  const handleScrape = useCallback(async () => {
    const asinsToScrape = Array.from(selectedAsins)
    if (asinsToScrape.length === 0) {
      toast.error('No products to scrape')
      return
    }

    setScraping(true)
    setScrapeProgress({ current: 0, total: asinsToScrape.length })
    setScrapeResults([])

    // Process in batches of 5 to avoid timeout
    const batchSize = 5
    const allResults: ScrapeResult[] = []

    for (let i = 0; i < asinsToScrape.length; i += batchSize) {
      const batch = asinsToScrape.slice(i, i + batchSize)

      try {
        const res = await fetch('/api/seller-pull/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asins: batch,
            country_id: selectedCountryId,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Scrape failed')

        allResults.push(...(json.results || []))
        setScrapeProgress({ current: i + batch.length, total: asinsToScrape.length })
        setScrapeResults([...allResults])
      } catch (err) {
        // Add error entries for this batch
        for (const asin of batch) {
          allResults.push({
            asin,
            success: false,
            error: err instanceof Error ? err.message : 'Request failed',
          })
        }
        setScrapeResults([...allResults])
      }
    }

    const successful = allResults.filter((r) => r.success)
    const parentAsins = Array.from(
      new Set(successful.map((r) => r.parent_asin).filter((pa): pa is string => !!pa))
    )

    if (parentAsins.length > 0) {
      setCurrentStep('variations')
      toast.success(
        `Scraped ${successful.length}/${asinsToScrape.length}. Found ${parentAsins.length} parent ASINs for variation discovery.`
      )
    } else {
      setCurrentStep('done')
      toast.success(`Scraped ${successful.length}/${asinsToScrape.length} products.`)
    }

    setScraping(false)
  }, [selectedAsins, selectedCountryId])

  // ─── VARIATIONS ───────────────────────────────────
  const handleDiscoverVariations = useCallback(async () => {
    const parentAsins = Array.from(
      new Set(
        scrapeResults
          .filter((r) => r.success && r.parent_asin)
          .map((r) => r.parent_asin!)
      )
    )

    if (parentAsins.length === 0) {
      toast.error('No parent ASINs to check')
      return
    }

    setDiscoveringVariations(true)
    try {
      const res = await fetch('/api/seller-pull/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_asins: parentAsins,
          country_id: selectedCountryId,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Variation discovery failed')

      const variations: VariationResult[] = json.variations || []
      setVariationResults(variations)

      const newOnes = variations.filter((v) => v.is_new)
      setSelectedVariations(new Set(newOnes.map((v) => v.asin)))

      if (newOnes.length > 0) {
        toast.success(
          `Found ${newOnes.length} new variation siblings not yet in your system!`
        )
      } else {
        toast.success('All variation siblings are already in your system.')
        setCurrentStep('done')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Variation discovery failed')
    } finally {
      setDiscoveringVariations(false)
    }
  }, [scrapeResults, selectedCountryId])

  // ─── IMPORT VARIATIONS ────────────────────────────
  const handleImportVariations = useCallback(async () => {
    const toImport = variationResults.filter(
      (v) => v.is_new && selectedVariations.has(v.asin)
    )

    if (toImport.length === 0) {
      toast.error('No variations selected')
      return
    }

    setImporting(true)
    try {
      const res = await fetch('/api/seller-pull/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: toImport.map((v) => ({
            asin: v.asin,
            title: v.title || v.asin,
            parent_asin: v.parent_asin,
          })),
          default_category: defaultCategory || 'Uncategorized',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      toast.success(`Imported ${json.imported} variation siblings`)
      setCurrentStep('done')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [variationResults, selectedVariations, defaultCategory])

  // ─── SELECTION HELPERS ────────────────────────────
  const toggleAsin = (asin: string) => {
    setSelectedAsins((prev) => {
      const next = new Set(prev)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return next
    })
  }

  const selectAllVisible = () => {
    const visibleAsins = filteredProducts
      .filter((p) => !p.exists_in_system)
      .map((p) => p.asin)
    setSelectedAsins(new Set(visibleAsins))
  }

  const deselectAll = () => setSelectedAsins(new Set())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Seller Product Pull</h1>
        <p className="text-muted-foreground mt-1">
          Pull your product catalog from Amazon, filter out bundles, and import to your system.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Marketplace</label>
            <select
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Default Category</label>
            <Input
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
              placeholder="e.g. Chalk Markers"
              className="w-48"
            />
          </div>

          <Button
            onClick={handlePull}
            disabled={pulling || !selectedCountryId}
            className="gap-2"
          >
            {pulling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {pulling ? 'Pulling...' : 'Pull Products'}
          </Button>

          {sellerId && (
            <span className="text-xs text-muted-foreground font-mono">
              Seller: {sellerId}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Total Found" value={summary.total} icon={Store} />
          <SummaryCard
            label="Bundles"
            value={summary.bundles}
            icon={Package}
            muted
          />
          <SummaryCard
            label="Non-Bundles"
            value={summary.non_bundles}
            icon={ScanSearch}
          />
          <SummaryCard
            label="Already Imported"
            value={summary.already_in_system}
            icon={Check}
            muted
          />
          <SummaryCard
            label="New Products"
            value={summary.new}
            icon={AlertCircle}
            highlight
          />
        </div>
      )}

      {/* Products Table */}
      {products.length > 0 && (
        <div className="rounded-lg border bg-card">
          {/* Table Header */}
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideBundles}
                  onChange={(e) => setHideBundles(e.target.checked)}
                  className="rounded border-input"
                />
                Hide Bundles ({summary?.bundles || 0})
              </label>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter by ASIN or title..."
                  className="pl-8 w-64 h-8 text-sm"
                />
              </div>

              <span className="text-sm text-muted-foreground">
                Showing {filteredProducts.length} products
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedAsins.size} selected
              </span>
              <Button size="sm" variant="outline" onClick={selectAllVisible}>
                Select All New
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.filter((p) => !p.exists_in_system).length > 0 &&
                        filteredProducts
                          .filter((p) => !p.exists_in_system)
                          .every((p) => selectedAsins.has(p.asin))
                      }
                      onChange={(e) => {
                        if (e.target.checked) selectAllVisible()
                        else deselectAll()
                      }}
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-3 py-2 text-left w-16">Image</th>
                  <th className="px-3 py-2 text-left w-28">ASIN</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-right w-20">Price</th>
                  <th className="px-3 py-2 text-right w-16">Rating</th>
                  <th className="px-3 py-2 text-right w-20">Reviews</th>
                  <th className="px-3 py-2 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProducts.map((product) => (
                  <tr
                    key={product.asin}
                    className={`hover:bg-muted/30 ${
                      product.exists_in_system ? 'opacity-50' : ''
                    } ${selectedAsins.has(product.asin) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedAsins.has(product.asin)}
                        onChange={() => toggleAsin(product.asin)}
                        disabled={product.exists_in_system}
                        className="rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {product.url_image ? (
                        <img
                          src={product.url_image}
                          alt=""
                          className="w-10 h-10 object-contain rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{product.asin}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-md truncate" title={product.title}>
                        {product.title}
                      </div>
                      {product.manufacturer && (
                        <span className="text-xs text-muted-foreground">
                          {product.manufacturer}
                        </span>
                      )}
                      {product.is_bundle && (
                        <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded">
                          Bundle
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {product.price ? `$${product.price}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {product.rating ? `${product.rating}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {product.reviews_count
                        ? product.reviews_count.toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {product.exists_in_system ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
                          <Check className="h-3 w-3" />
                          Exists
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          New
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="p-4 border-t bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {selectedAsins.size} products selected for import
            </div>
            <div className="flex items-center gap-2">
              {currentStep === 'pull' && (
                <Button
                  onClick={handleImport}
                  disabled={importing || selectedAsins.size === 0}
                  className="gap-2"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {importing
                    ? 'Importing...'
                    : `Import ${selectedAsins.size} Products`}
                </Button>
              )}

              {(currentStep === 'scrape' || currentStep === 'pull') && importResult && (
                <Button
                  onClick={handleScrape}
                  disabled={scraping || selectedAsins.size === 0}
                  variant="outline"
                  className="gap-2"
                >
                  {scraping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanSearch className="h-4 w-4" />
                  )}
                  {scraping
                    ? `Scraping ${scrapeProgress.current}/${scrapeProgress.total}...`
                    : `Scrape Details (${selectedAsins.size})`}
                </Button>
              )}

              {currentStep === 'variations' && (
                <Button
                  onClick={handleDiscoverVariations}
                  disabled={discoveringVariations}
                  variant="outline"
                  className="gap-2"
                >
                  {discoveringVariations ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitBranch className="h-4 w-4" />
                  )}
                  {discoveringVariations
                    ? 'Discovering...'
                    : 'Discover Variation Siblings'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              Import Complete: {importResult.imported} imported
              {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Products are now in your system. Use &quot;Scrape Details&quot; to fetch full Amazon data
            (price, reviews, images, parent ASINs) for each product.
          </p>
        </div>
      )}

      {/* Scrape Progress */}
      {scrapeResults.length > 0 && (
        <ScrapeResultsPanel results={scrapeResults} />
      )}

      {/* Variation Discovery Results */}
      {variationResults.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Discovered Variation Siblings</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              These are child ASINs under the same parent that aren&apos;t yet in your system.
            </p>
          </div>

          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        variationResults.filter((v) => v.is_new).length > 0 &&
                        variationResults
                          .filter((v) => v.is_new)
                          .every((v) => selectedVariations.has(v.asin))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVariations(
                            new Set(
                              variationResults.filter((v) => v.is_new).map((v) => v.asin)
                            )
                          )
                        } else {
                          setSelectedVariations(new Set())
                        }
                      }}
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">ASIN</th>
                  <th className="px-3 py-2 text-left">Parent ASIN</th>
                  <th className="px-3 py-2 text-left">Dimensions</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {variationResults.map((v) => (
                  <tr
                    key={v.asin}
                    className={`hover:bg-muted/30 ${!v.is_new ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedVariations.has(v.asin)}
                        onChange={() => {
                          setSelectedVariations((prev) => {
                            const next = new Set(prev)
                            if (next.has(v.asin)) next.delete(v.asin)
                            else next.add(v.asin)
                            return next
                          })
                        }}
                        disabled={!v.is_new}
                        className="rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{v.asin}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {v.parent_asin}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {v.dimensions
                        ? Object.entries(v.dimensions)
                            .map(([k, val]) => `${k}: ${val}`)
                            .join(', ')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {v.is_new ? (
                        <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          New
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
                          Exists
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedVariations.size} new variations selected
            </span>
            <Button
              onClick={handleImportVariations}
              disabled={importing || selectedVariations.size === 0}
              className="gap-2"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Import {selectedVariations.size} Variations
            </Button>
          </div>
        </div>
      )}

      {/* Done State */}
      {currentStep === 'done' && (
        <div className="rounded-lg border bg-card p-6 text-center">
          <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <h3 className="font-semibold text-lg">All Done!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your products have been imported. Visit the{' '}
            <a href="/products" className="text-primary underline">
              Products page
            </a>{' '}
            to see them.
          </p>
          <Button
            variant="outline"
            onClick={handlePull}
            className="mt-4 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Pull Again
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  muted,
  highlight,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30'
          : 'bg-card'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${
            muted ? 'text-muted-foreground' : highlight ? 'text-blue-500' : 'text-foreground'
          }`}
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p
        className={`text-2xl font-bold mt-1 ${
          muted ? 'text-muted-foreground' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function ScrapeResultsPanel({ results }: { results: ScrapeResult[] }) {
  const [expanded, setExpanded] = useState(false)
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)
  const parentAsins = Array.from(
    new Set(successful.map((r) => r.parent_asin).filter(Boolean))
  )

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            Scrape Results: {successful.length} success, {failed.length} failed
            {parentAsins.length > 0 && ` | ${parentAsins.length} parent ASINs found`}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4 max-h-64 overflow-y-auto">
          <div className="space-y-1 text-xs font-mono">
            {results.map((r) => (
              <div
                key={r.asin}
                className={`flex items-center gap-2 ${
                  r.success ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {r.success ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <X className="h-3 w-3 flex-shrink-0" />
                )}
                <span>{r.asin}</span>
                {r.parent_asin && (
                  <span className="text-muted-foreground">
                    → parent: {r.parent_asin}
                  </span>
                )}
                {r.error && (
                  <span className="text-red-400 truncate">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
