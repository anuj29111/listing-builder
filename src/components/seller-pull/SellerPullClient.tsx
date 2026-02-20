'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
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
  Plus,
  DollarSign,
  Globe,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Types ──────────────────────────────────────────

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
  has_sales: boolean
  exists_in_system: boolean
  suggested_category: string | null
}

interface PullSummary {
  total: number
  bundles: number
  bundles_with_sales: number
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

interface ConfiguredCountry {
  country_id: string
  seller_id: string
  country: Country
}

interface CountryPullData {
  products: PulledProduct[]
  summary: PullSummary | null
  sellerId: string
  selectedAsins: Set<string>
  productCategories: Map<string, string>
  importResult: { imported: number; skipped: number } | null
  scrapeResults: ScrapeResult[]
  scrapeProgress: { current: number; total: number }
  variationResults: VariationResult[]
  selectedVariations: Set<string>
  currentStep: Step
}

type Step = 'pull' | 'import' | 'scrape' | 'variations' | 'done'

function createDefaultPullData(): CountryPullData {
  return {
    products: [],
    summary: null,
    sellerId: '',
    selectedAsins: new Set(),
    productCategories: new Map(),
    importResult: null,
    scrapeResults: [],
    scrapeProgress: { current: 0, total: 0 },
    variationResults: [],
    selectedVariations: new Set(),
    currentStep: 'pull',
  }
}

interface SellerPullClientProps {
  countries: Country[]
}

// ─── Main Component ─────────────────────────────────

export function SellerPullClient({ countries }: SellerPullClientProps) {
  // Config
  const [configuredCountries, setConfiguredCountries] = useState<ConfiguredCountry[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [activeCountryId, setActiveCountryId] = useState<string>('')

  // Per-country data
  const [countryData, setCountryData] = useState<Record<string, CountryPullData>>({})

  // Global categories (shared across all countries from lb_products)
  const [categories, setCategories] = useState<string[]>([])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // Filters
  const [hideBundles, setHideBundles] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  // Loading states (global — one operation at a time)
  const [pulling, setPulling] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [discoveringVariations, setDiscoveringVariations] = useState(false)

  // Active country data
  const activeData = useMemo(
    () => countryData[activeCountryId] || createDefaultPullData(),
    [countryData, activeCountryId]
  )

  const updateActiveData = useCallback(
    (updater: (prev: CountryPullData) => CountryPullData) => {
      setCountryData((prev) => ({
        ...prev,
        [activeCountryId]: updater(prev[activeCountryId] || createDefaultPullData()),
      }))
    },
    [activeCountryId]
  )

  // Fetch configured seller IDs on mount
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/settings')
        const json = await res.json()
        const setting = (json.data || []).find(
          (s: { key: string }) => s.key === 'seller_ids'
        )

        if (setting?.value) {
          const parsed = JSON.parse(setting.value) as Record<string, string>
          const configured = Object.entries(parsed)
            .map(([countryId, sellerId]) => {
              const country = countries.find((c) => c.id === countryId)
              return country && sellerId
                ? { country_id: countryId, seller_id: sellerId, country }
                : null
            })
            .filter(Boolean) as ConfiguredCountry[]

          setConfiguredCountries(configured)
          if (configured.length > 0) {
            setActiveCountryId(configured[0].country_id)
          }
        }
      } catch {
        toast.error('Failed to load seller configuration')
      } finally {
        setLoadingConfig(false)
      }
    }
    fetchConfig()
  }, [countries])

  // Derived
  const filteredProducts = useMemo(() => {
    let filtered = activeData.products
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
  }, [activeData.products, hideBundles, searchFilter])

  // ─── PULL ─────────────────────────────────────────
  const handlePull = useCallback(async () => {
    if (!activeCountryId) return
    setPulling(true)
    updateActiveData(() => createDefaultPullData())

    try {
      const res = await fetch('/api/seller-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_id: activeCountryId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Pull failed')

      const pulledProducts: PulledProduct[] = json.products
      const apiCategories: string[] = json.categories || []

      // Merge categories globally
      setCategories((prev) => {
        const merged = new Set([...prev, ...apiCategories])
        return Array.from(merged).sort()
      })

      // Auto-select non-bundle new products
      const newNonBundles = pulledProducts
        .filter((p) => !p.is_bundle && !p.exists_in_system)
        .map((p) => p.asin)

      // Build per-product categories from suggestions
      const catMap = new Map<string, string>()
      for (const p of pulledProducts) {
        if (p.suggested_category) {
          catMap.set(p.asin, p.suggested_category)
        }
      }

      updateActiveData(() => ({
        ...createDefaultPullData(),
        products: pulledProducts,
        summary: json.summary,
        sellerId: json.seller_id,
        selectedAsins: new Set(newNonBundles),
        productCategories: catMap,
      }))

      toast.success(
        `Pulled ${json.summary.total} products (${json.summary.non_bundles} non-bundles, ${json.summary.new} new)`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pull failed')
    } finally {
      setPulling(false)
    }
  }, [activeCountryId, updateActiveData])

  // ─── CATEGORY MANAGEMENT ──────────────────────────
  const setProductCategory = useCallback(
    (asin: string, category: string) => {
      updateActiveData((prev) => {
        const newCats = new Map(prev.productCategories)
        newCats.set(asin, category)
        return { ...prev, productCategories: newCats }
      })
    },
    [updateActiveData]
  )

  const addNewCategory = useCallback(() => {
    const name = newCategoryName.trim()
    if (!name) return
    if (categories.includes(name)) {
      toast.error('Category already exists')
      return
    }
    setCategories((prev) => [...prev, name].sort())
    setNewCategoryName('')
    setShowNewCategory(false)
    toast.success(`Category "${name}" added`)
  }, [newCategoryName, categories])

  // ─── IMPORT ───────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (activeData.selectedAsins.size === 0) {
      toast.error('No products selected')
      return
    }

    setImporting(true)
    try {
      const selectedProducts = activeData.products
        .filter((p) => activeData.selectedAsins.has(p.asin))
        .map((p) => ({
          asin: p.asin,
          title: p.title,
          brand: p.manufacturer || undefined,
          category: activeData.productCategories.get(p.asin) || 'Uncategorized',
        }))

      const res = await fetch('/api/seller-pull/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      updateActiveData((prev) => ({
        ...prev,
        importResult: { imported: json.imported, skipped: json.skipped },
        currentStep: 'scrape',
        products: prev.products.map((p) =>
          prev.selectedAsins.has(p.asin) ? { ...p, exists_in_system: true } : p
        ),
      }))

      toast.success(`Imported ${json.imported} products`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [activeData, updateActiveData])

  // ─── SCRAPE ───────────────────────────────────────
  const handleScrape = useCallback(async () => {
    const asinsToScrape = Array.from(activeData.selectedAsins)
    if (asinsToScrape.length === 0) {
      toast.error('No products to scrape')
      return
    }

    setScraping(true)
    updateActiveData((prev) => ({
      ...prev,
      scrapeProgress: { current: 0, total: asinsToScrape.length },
      scrapeResults: [],
    }))

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
            country_id: activeCountryId,
          }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Scrape failed')

        allResults.push(...(json.results || []))
        updateActiveData((prev) => ({
          ...prev,
          scrapeProgress: { current: i + batch.length, total: asinsToScrape.length },
          scrapeResults: [...allResults],
        }))
      } catch (err) {
        for (const asin of batch) {
          allResults.push({
            asin,
            success: false,
            error: err instanceof Error ? err.message : 'Request failed',
          })
        }
        updateActiveData((prev) => ({
          ...prev,
          scrapeResults: [...allResults],
        }))
      }
    }

    const successful = allResults.filter((r) => r.success)
    const parentAsins = Array.from(
      new Set(successful.map((r) => r.parent_asin).filter((pa): pa is string => !!pa))
    )

    if (parentAsins.length > 0) {
      updateActiveData((prev) => ({ ...prev, currentStep: 'variations' }))
      toast.success(
        `Scraped ${successful.length}/${asinsToScrape.length}. Found ${parentAsins.length} parent ASINs.`
      )
    } else {
      updateActiveData((prev) => ({ ...prev, currentStep: 'done' }))
      toast.success(`Scraped ${successful.length}/${asinsToScrape.length} products.`)
    }

    setScraping(false)
  }, [activeData.selectedAsins, activeCountryId, updateActiveData])

  // ─── VARIATIONS ───────────────────────────────────
  const handleDiscoverVariations = useCallback(async () => {
    const parentAsins = Array.from(
      new Set(
        activeData.scrapeResults
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
          country_id: activeCountryId,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Variation discovery failed')

      const variations: VariationResult[] = json.variations || []
      const newOnes = variations.filter((v) => v.is_new)

      updateActiveData((prev) => ({
        ...prev,
        variationResults: variations,
        selectedVariations: new Set(newOnes.map((v) => v.asin)),
      }))

      if (newOnes.length > 0) {
        toast.success(`Found ${newOnes.length} new variation siblings!`)
      } else {
        updateActiveData((prev) => ({ ...prev, currentStep: 'done' }))
        toast.success('All variation siblings are already in your system.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Variation discovery failed')
    } finally {
      setDiscoveringVariations(false)
    }
  }, [activeData.scrapeResults, activeCountryId, updateActiveData])

  // ─── IMPORT VARIATIONS ────────────────────────────
  const handleImportVariations = useCallback(async () => {
    const toImport = activeData.variationResults.filter(
      (v) => v.is_new && activeData.selectedVariations.has(v.asin)
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
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      toast.success(`Imported ${json.imported} variation siblings`)
      updateActiveData((prev) => ({ ...prev, currentStep: 'done' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }, [activeData.variationResults, activeData.selectedVariations, updateActiveData])

  // ─── SELECTION HELPERS ────────────────────────────
  const toggleAsin = (asin: string) => {
    updateActiveData((prev) => {
      const next = new Set(prev.selectedAsins)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return { ...prev, selectedAsins: next }
    })
  }

  const selectAllVisible = () => {
    const visibleAsins = filteredProducts
      .filter((p) => !p.exists_in_system)
      .map((p) => p.asin)
    updateActiveData((prev) => ({
      ...prev,
      selectedAsins: new Set(visibleAsins),
    }))
  }

  const deselectAll = () => {
    updateActiveData((prev) => ({
      ...prev,
      selectedAsins: new Set(),
    }))
  }

  // ─── LOADING / EMPTY STATES ───────────────────────
  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (configuredCountries.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Seller Product Pull</h1>
          <p className="text-muted-foreground mt-1">
            Pull your product catalog from Amazon.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-8 text-center">
          <Store className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold">No Seller IDs Configured</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Go to{' '}
            <a href="/settings" className="text-primary underline">
              Settings &rarr; Admin &rarr; Amazon Seller IDs
            </a>{' '}
            to configure your seller IDs per marketplace.
          </p>
        </div>
      </div>
    )
  }

  const activeConfig = configuredCountries.find((c) => c.country_id === activeCountryId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Seller Product Pull</h1>
        <p className="text-muted-foreground mt-1">
          Pull your product catalog from Amazon, filter out bundles, and import to your system.
        </p>
      </div>

      {/* Country Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {configuredCountries.map((cc) => {
            const isActive = cc.country_id === activeCountryId
            const data = countryData[cc.country_id]
            const hasPulled = !!data?.products.length
            return (
              <button
                key={cc.country_id}
                onClick={() => {
                  setActiveCountryId(cc.country_id)
                  setSearchFilter('')
                }}
                disabled={pulling || importing || scraping || discoveringVariations}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-50 ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
              >
                <span>{cc.country.flag_emoji}</span>
                <span>{cc.country.name}</span>
                {hasPulled && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {data?.summary?.non_bundles || 0}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pull Controls */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm">
              <span className="font-medium">
                {activeConfig?.country.flag_emoji} {activeConfig?.country.name}
              </span>
              <span className="text-muted-foreground ml-2 font-mono text-xs">
                Seller: {activeConfig?.seller_id}
              </span>
            </span>
          </div>
          <Button
            onClick={handlePull}
            disabled={pulling || importing || scraping || discoveringVariations}
            className="gap-2"
          >
            {pulling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : activeData.products.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {pulling ? 'Pulling...' : activeData.products.length > 0 ? 'Re-Pull' : 'Pull Products'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {activeData.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Found" value={activeData.summary.total} icon={Store} />
          <SummaryCard
            label="Bundles"
            value={activeData.summary.bundles}
            icon={Package}
            muted
            subtitle={`${activeData.summary.bundles_with_sales} with sales`}
          />
          <SummaryCard
            label="Non-Bundles"
            value={activeData.summary.non_bundles}
            icon={ScanSearch}
          />
          <SummaryCard
            label="Already Imported"
            value={activeData.summary.already_in_system}
            icon={Check}
            muted
          />
          <SummaryCard
            label="New Products"
            value={activeData.summary.new}
            icon={AlertCircle}
            highlight
          />
          <SummaryCard
            label="Pages Scraped"
            value={activeData.summary.pages_scraped}
            icon={Globe}
            muted
            subtitle={`of ${activeData.summary.total_pages}`}
          />
        </div>
      )}

      {/* Products Table */}
      {activeData.products.length > 0 && (
        <div className="rounded-lg border bg-card">
          {/* Table Header Controls */}
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setHideBundles(!hideBundles)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  hideBundles
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-accent'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                {hideBundles ? 'Bundles Hidden' : 'Showing All'}
                <span className="text-xs opacity-75">
                  ({activeData.summary?.bundles || 0})
                </span>
              </button>

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
              {/* New Category Button */}
              {showNewCategory ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="w-36 h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addNewCategory()
                      if (e.key === 'Escape') {
                        setShowNewCategory(false)
                        setNewCategoryName('')
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={addNewCategory}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setShowNewCategory(false)
                      setNewCategoryName('')
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewCategory(true)}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  New Category
                </Button>
              )}

              <div className="h-4 w-px bg-border" />

              <span className="text-sm text-muted-foreground">
                {activeData.selectedAsins.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllVisible}
                className="h-7 text-xs"
              >
                Select All New
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deselectAll}
                className="h-7 text-xs"
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.filter((p) => !p.exists_in_system).length > 0 &&
                        filteredProducts
                          .filter((p) => !p.exists_in_system)
                          .every((p) => activeData.selectedAsins.has(p.asin))
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
                  <th className="px-3 py-2 text-left w-40">Category</th>
                  <th className="px-3 py-2 text-right w-20">Price</th>
                  <th className="px-3 py-2 text-right w-16">Rating</th>
                  <th className="px-3 py-2 text-right w-20">Reviews</th>
                  <th className="px-3 py-2 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProducts.map((product) => {
                  const productCategory =
                    activeData.productCategories.get(product.asin) || ''
                  return (
                    <tr
                      key={product.asin}
                      className={`hover:bg-muted/30 ${
                        product.exists_in_system ? 'opacity-50' : ''
                      } ${activeData.selectedAsins.has(product.asin) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={activeData.selectedAsins.has(product.asin)}
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
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {product.manufacturer && (
                            <span className="text-xs text-muted-foreground">
                              {product.manufacturer}
                            </span>
                          )}
                          {product.is_bundle && (
                            <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded">
                              Bundle
                            </span>
                          )}
                          {product.is_bundle && product.has_sales && (
                            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                              <DollarSign className="h-3 w-3" />
                              Has Sales
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={productCategory}
                          onChange={(e) =>
                            setProductCategory(product.asin, e.target.value)
                          }
                          className={`w-full rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                            !productCategory && !product.exists_in_system
                              ? 'border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400'
                              : 'border-input text-foreground'
                          }`}
                          disabled={product.exists_in_system}
                        >
                          <option value="">— Select —</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        {!productCategory && !product.exists_in_system && (
                          <span className="text-[10px] text-orange-500 mt-0.5 block">
                            Needs category
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.price ? `$${product.price}` : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.rating ? `${product.rating}` : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.reviews_count
                          ? product.reviews_count.toLocaleString()
                          : '\u2014'}
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
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="p-4 border-t bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {activeData.selectedAsins.size} products selected for import
            </div>
            <div className="flex items-center gap-2">
              {activeData.currentStep === 'pull' && (
                <Button
                  onClick={handleImport}
                  disabled={importing || activeData.selectedAsins.size === 0}
                  className="gap-2"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {importing
                    ? 'Importing...'
                    : `Import ${activeData.selectedAsins.size} Products`}
                </Button>
              )}

              {(activeData.currentStep === 'scrape' ||
                activeData.currentStep === 'pull') &&
                activeData.importResult && (
                  <Button
                    onClick={handleScrape}
                    disabled={scraping || activeData.selectedAsins.size === 0}
                    variant="outline"
                    className="gap-2"
                  >
                    {scraping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanSearch className="h-4 w-4" />
                    )}
                    {scraping
                      ? `Scraping ${activeData.scrapeProgress.current}/${activeData.scrapeProgress.total}...`
                      : `Scrape Details (${activeData.selectedAsins.size})`}
                  </Button>
                )}

              {activeData.currentStep === 'variations' && (
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
      {activeData.importResult && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            <span className="font-medium">
              Import Complete: {activeData.importResult.imported} imported
              {activeData.importResult.skipped > 0 &&
                `, ${activeData.importResult.skipped} skipped`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Products are now in your system. Use &quot;Scrape Details&quot; to fetch full
            Amazon data for each product.
          </p>
        </div>
      )}

      {/* Scrape Results */}
      {activeData.scrapeResults.length > 0 && (
        <ScrapeResultsPanel results={activeData.scrapeResults} />
      )}

      {/* Variation Discovery Results */}
      {activeData.variationResults.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Discovered Variation Siblings</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Child ASINs under the same parent that aren&apos;t yet in your system.
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
                        activeData.variationResults.filter((v) => v.is_new).length > 0 &&
                        activeData.variationResults
                          .filter((v) => v.is_new)
                          .every((v) => activeData.selectedVariations.has(v.asin))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateActiveData((prev) => ({
                            ...prev,
                            selectedVariations: new Set(
                              prev.variationResults
                                .filter((v) => v.is_new)
                                .map((v) => v.asin)
                            ),
                          }))
                        } else {
                          updateActiveData((prev) => ({
                            ...prev,
                            selectedVariations: new Set(),
                          }))
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
                {activeData.variationResults.map((v) => (
                  <tr
                    key={v.asin}
                    className={`hover:bg-muted/30 ${!v.is_new ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={activeData.selectedVariations.has(v.asin)}
                        onChange={() => {
                          updateActiveData((prev) => {
                            const next = new Set(prev.selectedVariations)
                            if (next.has(v.asin)) next.delete(v.asin)
                            else next.add(v.asin)
                            return { ...prev, selectedVariations: next }
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
                        : '\u2014'}
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
              {activeData.selectedVariations.size} new variations selected
            </span>
            <Button
              onClick={handleImportVariations}
              disabled={importing || activeData.selectedVariations.size === 0}
              className="gap-2"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Import {activeData.selectedVariations.size} Variations
            </Button>
          </div>
        </div>
      )}

      {/* Done State */}
      {activeData.currentStep === 'done' && (
        <div className="rounded-lg border bg-card p-6 text-center">
          <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <h3 className="font-semibold text-lg">All Done!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Products have been imported. Visit the{' '}
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
  subtitle,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  muted?: boolean
  highlight?: boolean
  subtitle?: string
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
            muted
              ? 'text-muted-foreground'
              : highlight
                ? 'text-blue-500'
                : 'text-foreground'
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
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
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
                    &rarr; parent: {r.parent_asin}
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
