'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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
import type {
  LbSellerPullJob,
  SellerPullProduct,
  SellerPullSummary,
  SellerPullScrapeResult,
  SellerPullVariationResult,
} from '@/types'

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

interface ConfiguredCountry {
  country_id: string
  seller_id: string
  country: Country
}

interface CountryJobState {
  jobId: string | null
  job: LbSellerPullJob | null
  // Local selection overrides (null = use job values)
  localSelectedAsins: Set<string> | null
  localProductCategories: Map<string, string> | null
  localSelectedVariations: Set<string> | null
}

function createDefaultJobState(): CountryJobState {
  return {
    jobId: null,
    job: null,
    localSelectedAsins: null,
    localProductCategories: null,
    localSelectedVariations: null,
  }
}

const POLL_INTERVAL = 3000
const BACKGROUND_STATES = ['pulling', 'scraping', 'discovering_variations', 'importing', 'importing_variations']

interface SellerPullClientProps {
  countries: Country[]
}

// ─── Main Component ─────────────────────────────────

export function SellerPullClient({ countries }: SellerPullClientProps) {
  // Config
  const [configuredCountries, setConfiguredCountries] = useState<ConfiguredCountry[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [activeCountryId, setActiveCountryId] = useState<string>('')

  // Per-country job state
  const [countryJobs, setCountryJobs] = useState<Record<string, CountryJobState>>({})

  // Global categories (shared across all countries from lb_products)
  const [categories, setCategories] = useState<string[]>([])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // Filters
  const [hideBundles, setHideBundles] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')

  // Loading flag for quick actions (import)
  const [actionLoading, setActionLoading] = useState(false)

  // Polling
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  // Active country job state
  const activeJobState = useMemo(
    () => countryJobs[activeCountryId] || createDefaultJobState(),
    [countryJobs, activeCountryId]
  )

  const activeJob = activeJobState.job

  const updateCountryJob = useCallback(
    (countryId: string, updater: (prev: CountryJobState) => CountryJobState) => {
      setCountryJobs((prev) => ({
        ...prev,
        [countryId]: updater(prev[countryId] || createDefaultJobState()),
      }))
    },
    []
  )

  // Effective selections: local overrides > job values
  const effectiveSelectedAsins = useMemo(() => {
    if (activeJobState.localSelectedAsins) return activeJobState.localSelectedAsins
    if (activeJob?.selected_asins) return new Set(activeJob.selected_asins)
    return new Set<string>()
  }, [activeJobState.localSelectedAsins, activeJob?.selected_asins])

  const effectiveProductCategories = useMemo(() => {
    if (activeJobState.localProductCategories) return activeJobState.localProductCategories
    if (activeJob?.product_categories) return new Map(Object.entries(activeJob.product_categories))
    return new Map<string, string>()
  }, [activeJobState.localProductCategories, activeJob?.product_categories])

  const effectiveSelectedVariations = useMemo(() => {
    if (activeJobState.localSelectedVariations) return activeJobState.localSelectedVariations
    if (activeJob?.selected_variations) return new Set(activeJob.selected_variations)
    return new Set<string>()
  }, [activeJobState.localSelectedVariations, activeJob?.selected_variations])

  // Derived data from job
  const products: SellerPullProduct[] = activeJob?.pull_result?.products || []
  const summary: SellerPullSummary | null = activeJob?.pull_result?.summary || null
  const scrapeResults: SellerPullScrapeResult[] = activeJob?.scrape_results || []
  const variationResults: SellerPullVariationResult[] = activeJob?.variation_results || []
  const scrapeProgress = activeJob?.scrape_progress || { current: 0, total: 0 }
  const importResult = activeJob?.import_result || null
  const jobStatus = activeJob?.status || null

  const isBackgroundRunning = jobStatus ? BACKGROUND_STATES.includes(jobStatus) : false

  // Filtered products
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

  // ─── POLLING ──────────────────────────────────────

  const pollForJob = useCallback(
    async (jobId: string, countryId: string) => {
      try {
        const res = await fetch(`/api/seller-pull/jobs/${jobId}`)
        if (!res.ok) return
        const job: LbSellerPullJob = await res.json()

        updateCountryJob(countryId, (prev) => ({ ...prev, job }))

        // Merge categories from pull_result
        if (job.pull_result?.categories) {
          setCategories((prev) => {
            const merged = new Set([...prev, ...job.pull_result!.categories])
            return Array.from(merged).sort()
          })
        }

        // Stop polling on terminal/pause states
        if (!BACKGROUND_STATES.includes(job.status)) {
          stopPolling()

          if (job.status === 'pulled') {
            toast.success(
              `Pulled ${job.pull_result?.summary.total || 0} products (${job.pull_result?.summary.new || 0} new)`
            )
          } else if (job.status === 'done') {
            toast.success('Seller pull complete!')
          } else if (job.status === 'awaiting_variation_selection') {
            const newVars = (job.variation_results || []).filter((v) => v.is_new)
            toast.success(`Found ${newVars.length} new variation siblings!`)
          } else if (job.status === 'failed') {
            toast.error(job.error || 'Job failed')
          }
        }
      } catch {
        // Network error, keep polling
      }
    },
    [updateCountryJob, stopPolling]
  )

  const startPolling = useCallback(
    (jobId: string, countryId: string) => {
      stopPolling()
      // Immediate first poll
      pollForJob(jobId, countryId)
      pollRef.current = setInterval(() => pollForJob(jobId, countryId), POLL_INTERVAL)
    },
    [stopPolling, pollForJob]
  )

  // ─── FETCH CONFIG + RESTORE JOBS ON MOUNT ──────────

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

          let firstActiveCountry = ''
          const restoredJobs: Record<string, CountryJobState> = {}

          // Restore active jobs for each configured country
          for (const cc of configured) {
            try {
              const jobsRes = await fetch(`/api/seller-pull/jobs?country_id=${cc.country_id}`)
              const jobsJson = await jobsRes.json()
              const recentJobs = jobsJson.jobs || []

              // Find the most recent non-done/non-failed job, or the most recent job
              const activeRecentJob = recentJobs.find(
                (j: { status: string }) => !['done', 'failed'].includes(j.status)
              )
              const latestJob = recentJobs[0]

              const jobToRestore = activeRecentJob || (latestJob?.status === 'done' ? latestJob : null)

              if (jobToRestore) {
                const fullRes = await fetch(`/api/seller-pull/jobs/${jobToRestore.id}`)
                const fullJob: LbSellerPullJob = await fullRes.json()

                restoredJobs[cc.country_id] = {
                  jobId: fullJob.id,
                  job: fullJob,
                  localSelectedAsins: null,
                  localProductCategories: null,
                  localSelectedVariations: null,
                }

                if (activeRecentJob && !firstActiveCountry) {
                  firstActiveCountry = cc.country_id
                }

                // Merge categories
                if (fullJob.pull_result?.categories) {
                  setCategories((prev) => {
                    const merged = new Set([...prev, ...fullJob.pull_result!.categories])
                    return Array.from(merged).sort()
                  })
                }
              }
            } catch {
              // Failed to fetch jobs for this country, skip
            }
          }

          setCountryJobs(restoredJobs)
          const initialCountry = firstActiveCountry || configured[0]?.country_id || ''
          setActiveCountryId(initialCountry)
        }
      } catch {
        toast.error('Failed to load seller configuration')
      } finally {
        setLoadingConfig(false)
      }
    }
    fetchConfig()
  }, [countries])

  // Resume polling when active country changes if job is in background state
  useEffect(() => {
    if (!activeCountryId) return
    const jobState = countryJobs[activeCountryId]
    if (jobState?.jobId && jobState.job && BACKGROUND_STATES.includes(jobState.job.status)) {
      startPolling(jobState.jobId, activeCountryId)
    } else {
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCountryId])

  // ─── PULL ─────────────────────────────────────────

  const handlePull = useCallback(async () => {
    if (!activeCountryId) return

    try {
      const res = await fetch('/api/seller-pull/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_id: activeCountryId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to start pull')

      const jobId = json.job_id

      updateCountryJob(activeCountryId, () => ({
        jobId,
        job: json.existing
          ? countryJobs[activeCountryId]?.job || null
          : {
              id: jobId,
              country_id: activeCountryId,
              seller_id: '',
              status: 'pulling' as const,
              pull_result: null,
              selected_asins: [],
              product_categories: {},
              import_result: null,
              scrape_results: [],
              scrape_progress: { current: 0, total: 0 },
              variation_results: [],
              selected_variations: [],
              variation_import_result: null,
              error: null,
              created_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
        localSelectedAsins: null,
        localProductCategories: null,
        localSelectedVariations: null,
      }))

      if (json.existing) {
        toast('Resuming existing pull job...')
      } else {
        toast.success('Pull started! You can navigate away — it runs in the background.')
      }

      startPolling(jobId, activeCountryId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pull failed')
    }
  }, [activeCountryId, updateCountryJob, countryJobs, startPolling])

  // ─── IMPORT ───────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!activeJobState.jobId || effectiveSelectedAsins.size === 0) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/seller-pull/jobs/${activeJobState.jobId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_asins: Array.from(effectiveSelectedAsins),
          product_categories: Object.fromEntries(effectiveProductCategories),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      toast.success(`Imported ${json.import_result.imported} products. Scraping details in background...`)

      // Clear local overrides, start polling for scrape
      updateCountryJob(activeCountryId, (prev) => ({
        ...prev,
        localSelectedAsins: null,
        localProductCategories: null,
      }))

      startPolling(activeJobState.jobId, activeCountryId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setActionLoading(false)
    }
  }, [activeJobState.jobId, effectiveSelectedAsins, effectiveProductCategories, activeCountryId, updateCountryJob, startPolling])

  // ─── IMPORT VARIATIONS ────────────────────────────

  const handleImportVariations = useCallback(async () => {
    if (!activeJobState.jobId || effectiveSelectedVariations.size === 0) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/seller-pull/jobs/${activeJobState.jobId}/import-variations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_variations: Array.from(effectiveSelectedVariations),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')

      toast.success(`Imported ${json.variation_import_result.imported} variation siblings`)

      updateCountryJob(activeCountryId, (prev) => ({
        ...prev,
        localSelectedVariations: null,
        job: prev.job ? { ...prev.job, status: 'done' as const, variation_import_result: json.variation_import_result } : null,
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setActionLoading(false)
    }
  }, [activeJobState.jobId, effectiveSelectedVariations, activeCountryId, updateCountryJob])

  // ─── CATEGORY MANAGEMENT ──────────────────────────

  const setProductCategory = useCallback(
    (asin: string, category: string) => {
      updateCountryJob(activeCountryId, (prev) => {
        const current = prev.localProductCategories || new Map(
          Object.entries(prev.job?.product_categories || {})
        )
        const newCats = new Map(current)
        newCats.set(asin, category)
        return { ...prev, localProductCategories: newCats }
      })
    },
    [activeCountryId, updateCountryJob]
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

  // ─── SELECTION HELPERS ────────────────────────────

  const toggleAsin = (asin: string) => {
    updateCountryJob(activeCountryId, (prev) => {
      const current = prev.localSelectedAsins || new Set(prev.job?.selected_asins || [])
      const next = new Set(current)
      if (next.has(asin)) next.delete(asin)
      else next.add(asin)
      return { ...prev, localSelectedAsins: next }
    })
  }

  const selectAllVisible = () => {
    const visibleAsins = filteredProducts
      .filter((p) => !p.exists_in_system)
      .map((p) => p.asin)
    updateCountryJob(activeCountryId, (prev) => ({
      ...prev,
      localSelectedAsins: new Set(visibleAsins),
    }))
  }

  const deselectAll = () => {
    updateCountryJob(activeCountryId, (prev) => ({
      ...prev,
      localSelectedAsins: new Set(),
    }))
  }

  // ─── STATUS LABEL ─────────────────────────────────

  function getStatusLabel(status: string | null): string {
    switch (status) {
      case 'pulling': return 'Pulling products...'
      case 'pulled': return 'Ready for import'
      case 'importing': return 'Importing...'
      case 'scraping': return `Scraping details (${scrapeProgress.current}/${scrapeProgress.total})...`
      case 'discovering_variations': return 'Discovering variations...'
      case 'awaiting_variation_selection': return 'Select variations to import'
      case 'importing_variations': return 'Importing variations...'
      case 'done': return 'Complete'
      case 'failed': return 'Failed'
      default: return ''
    }
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
            const jobState = countryJobs[cc.country_id]
            const job = jobState?.job
            const hasPulled = !!job?.pull_result?.products.length
            const isRunning = job && BACKGROUND_STATES.includes(job.status)
            return (
              <button
                key={cc.country_id}
                onClick={() => {
                  setActiveCountryId(cc.country_id)
                  setSearchFilter('')
                }}
                disabled={actionLoading}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-50 ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
              >
                <span>{cc.country.flag_emoji}</span>
                <span>{cc.country.name}</span>
                {isRunning && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                )}
                {hasPulled && !isRunning && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {job?.pull_result?.summary.non_bundles || 0}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pull Controls + Status */}
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
            {jobStatus && (
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                isBackgroundRunning
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : jobStatus === 'failed'
                    ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400'
                    : jobStatus === 'done'
                      ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'
                      : 'bg-muted text-muted-foreground'
              }`}>
                {isBackgroundRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                {jobStatus === 'done' && <Check className="h-3 w-3" />}
                {jobStatus === 'failed' && <X className="h-3 w-3" />}
                {getStatusLabel(jobStatus)}
              </span>
            )}
          </div>
          <Button
            onClick={handlePull}
            disabled={isBackgroundRunning || actionLoading}
            className="gap-2"
          >
            {jobStatus === 'pulling' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : products.length > 0 ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {jobStatus === 'pulling' ? 'Pulling...' : products.length > 0 ? 'Re-Pull' : 'Pull Products'}
          </Button>
        </div>

        {/* Error display */}
        {jobStatus === 'failed' && activeJob?.error && (
          <div className="mt-3 p-3 rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {activeJob.error}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total Found" value={summary.total} icon={Store} />
          <SummaryCard
            label="Bundles"
            value={summary.bundles}
            icon={Package}
            muted
            subtitle={`${summary.bundles_with_sales} with sales`}
          />
          <SummaryCard label="Non-Bundles" value={summary.non_bundles} icon={ScanSearch} />
          <SummaryCard label="Already Imported" value={summary.already_in_system} icon={Check} muted />
          <SummaryCard label="New Products" value={summary.new} icon={AlertCircle} highlight />
          <SummaryCard
            label="Pages Scraped"
            value={summary.pages_scraped}
            icon={Globe}
            muted
            subtitle={`of ${summary.total_pages}`}
          />
        </div>
      )}

      {/* Products Table */}
      {products.length > 0 && (
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
                <span className="text-xs opacity-75">({summary?.bundles || 0})</span>
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
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={addNewCategory}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => { setShowNewCategory(false); setNewCategoryName('') }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowNewCategory(true)} className="h-7 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  New Category
                </Button>
              )}

              <div className="h-4 w-px bg-border" />

              <span className="text-sm text-muted-foreground">
                {effectiveSelectedAsins.size} selected
              </span>
              <Button size="sm" variant="outline" onClick={selectAllVisible} className="h-7 text-xs">
                Select All New
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAll} className="h-7 text-xs">
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
                          .every((p) => effectiveSelectedAsins.has(p.asin))
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
                  const productCategory = effectiveProductCategories.get(product.asin) || ''
                  return (
                    <tr
                      key={product.asin}
                      className={`hover:bg-muted/30 ${
                        product.exists_in_system ? 'opacity-50' : ''
                      } ${effectiveSelectedAsins.has(product.asin) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={effectiveSelectedAsins.has(product.asin)}
                          onChange={() => toggleAsin(product.asin)}
                          disabled={product.exists_in_system || jobStatus !== 'pulled'}
                          className="rounded border-input"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {product.url_image ? (
                          <img src={product.url_image} alt="" className="w-10 h-10 object-contain rounded" />
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
                            <span className="text-xs text-muted-foreground">{product.manufacturer}</span>
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
                          onChange={(e) => setProductCategory(product.asin, e.target.value)}
                          className={`w-full rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                            !productCategory && !product.exists_in_system
                              ? 'border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400'
                              : 'border-input text-foreground'
                          }`}
                          disabled={product.exists_in_system || jobStatus !== 'pulled'}
                        >
                          <option value="">— Select —</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        {!productCategory && !product.exists_in_system && (
                          <span className="text-[10px] text-orange-500 mt-0.5 block">Needs category</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.price ? `$${product.price}` : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.rating ? `${product.rating}` : '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {product.reviews_count ? product.reviews_count.toLocaleString() : '\u2014'}
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
              {effectiveSelectedAsins.size} products selected for import
            </div>
            <div className="flex items-center gap-2">
              {jobStatus === 'pulled' && (
                <Button
                  onClick={handleImport}
                  disabled={actionLoading || effectiveSelectedAsins.size === 0}
                  className="gap-2"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {actionLoading
                    ? 'Importing...'
                    : `Import ${effectiveSelectedAsins.size} Products`}
                </Button>
              )}

              {jobStatus === 'scraping' && (
                <Button disabled variant="outline" className="gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scraping {scrapeProgress.current}/{scrapeProgress.total}...
                </Button>
              )}

              {jobStatus === 'discovering_variations' && (
                <Button disabled variant="outline" className="gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Discovering variations...
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
          {jobStatus === 'scraping' && (
            <p className="text-sm text-muted-foreground mt-1">
              Scraping product details in the background ({scrapeProgress.current}/{scrapeProgress.total})...
              You can navigate away.
            </p>
          )}
          {jobStatus !== 'scraping' && jobStatus !== 'pulling' && (
            <p className="text-sm text-muted-foreground mt-1">
              Products are now in your system.
            </p>
          )}
        </div>
      )}

      {/* Scrape Results */}
      {scrapeResults.length > 0 && (
        <ScrapeResultsPanel results={scrapeResults} />
      )}

      {/* Variation Discovery Results */}
      {variationResults.length > 0 && jobStatus === 'awaiting_variation_selection' && (
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
                        variationResults.filter((v) => v.is_new).length > 0 &&
                        variationResults
                          .filter((v) => v.is_new)
                          .every((v) => effectiveSelectedVariations.has(v.asin))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateCountryJob(activeCountryId, (prev) => ({
                            ...prev,
                            localSelectedVariations: new Set(
                              variationResults.filter((v) => v.is_new).map((v) => v.asin)
                            ),
                          }))
                        } else {
                          updateCountryJob(activeCountryId, (prev) => ({
                            ...prev,
                            localSelectedVariations: new Set(),
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
                {variationResults.map((v) => (
                  <tr
                    key={v.asin}
                    className={`hover:bg-muted/30 ${!v.is_new ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={effectiveSelectedVariations.has(v.asin)}
                        onChange={() => {
                          updateCountryJob(activeCountryId, (prev) => {
                            const current = prev.localSelectedVariations || new Set(prev.job?.selected_variations || [])
                            const next = new Set(current)
                            if (next.has(v.asin)) next.delete(v.asin)
                            else next.add(v.asin)
                            return { ...prev, localSelectedVariations: next }
                          })
                        }}
                        disabled={!v.is_new}
                        className="rounded border-input"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{v.asin}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{v.parent_asin}</td>
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
              {effectiveSelectedVariations.size} new variations selected
            </span>
            <Button
              onClick={handleImportVariations}
              disabled={actionLoading || effectiveSelectedVariations.size === 0}
              className="gap-2"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Import {effectiveSelectedVariations.size} Variations
            </Button>
          </div>
        </div>
      )}

      {/* Done State */}
      {jobStatus === 'done' && (
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
          <Button variant="outline" onClick={handlePull} className="mt-4 gap-2">
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
      <p className={`text-2xl font-bold mt-1 ${muted ? 'text-muted-foreground' : ''}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

function ScrapeResultsPanel({ results }: { results: SellerPullScrapeResult[] }) {
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
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t p-4 max-h-64 overflow-y-auto">
          <div className="space-y-1 text-xs font-mono">
            {results.map((r) => (
              <div
                key={r.asin}
                className={`flex items-center gap-2 ${r.success ? 'text-green-600' : 'text-red-500'}`}
              >
                {r.success ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <X className="h-3 w-3 flex-shrink-0" />
                )}
                <span>{r.asin}</span>
                {r.parent_asin && (
                  <span className="text-muted-foreground">&rarr; parent: {r.parent_asin}</span>
                )}
                {r.error && <span className="text-red-400 truncate">{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
