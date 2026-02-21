'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useBatchStore } from '@/stores/batch-store'
import { ProductTable } from './ProductTable'
import { BatchProgress } from './BatchProgress'
import { BatchReview } from './BatchReview'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Check,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import type { LbCategory, LbCountry } from '@/types/database'
import type { BatchListingWithSections } from '@/stores/batch-store'
import { ANALYSIS_TYPES } from '@/lib/constants'
import toast from 'react-hot-toast'

const STEPS = [
  { label: 'Category & Country', shortLabel: 'Category' },
  { label: 'Products', shortLabel: 'Products' },
  { label: 'Generate', shortLabel: 'Generate' },
  { label: 'Review & Export', shortLabel: 'Review' },
]

const ANALYSIS_LABELS: Record<string, string> = {
  keyword_analysis: 'Keyword Analysis',
  review_analysis: 'Review Analysis',
  qna_analysis: 'Q&A Analysis',
  market_intelligence: 'Market Intelligence',
}

interface SpeedModeClientProps {
  categories: LbCategory[]
  countries: LbCountry[]
}

export function SpeedModeClient({ categories, countries }: SpeedModeClientProps) {
  const currentStep = useBatchStore((s) => s.currentStep)
  const setStep = useBatchStore((s) => s.setStep)
  const resetBatch = useBatchStore((s) => s.resetBatch)

  // Step 0 state
  const categoryId = useBatchStore((s) => s.categoryId)
  const countryId = useBatchStore((s) => s.countryId)
  const setCategoryCountry = useBatchStore((s) => s.setCategoryCountry)
  const analysisAvailability = useBatchStore((s) => s.analysisAvailability)
  const setAnalysisAvailability = useBatchStore((s) => s.setAnalysisAvailability)

  // Step 1 state
  const products = useBatchStore((s) => s.products)

  // Step 2 state
  const batchJobId = useBatchStore((s) => s.batchJobId)
  const batchStatus = useBatchStore((s) => s.batchStatus)
  const isGenerating = useBatchStore((s) => s.isGenerating)
  const setBatchJob = useBatchStore((s) => s.setBatchJob)
  const updateProgress = useBatchStore((s) => s.updateProgress)
  const setGenerationError = useBatchStore((s) => s.setGenerationError)
  const setGeneratedListings = useBatchStore((s) => s.setGeneratedListings)

  // Local state for step 0
  const [selectedCatId, setSelectedCatId] = useState(categoryId || '')
  const [selectedCountryId, setSelectedCountryId] = useState(countryId || '')
  const [isCheckingAnalysis, setIsCheckingAnalysis] = useState(false)

  // Polling ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollFailCountRef = useRef(0)

  // Check analysis availability
  const checkAnalysis = useCallback(
    async (catId: string, cntryId: string) => {
      if (!catId || !cntryId) return
      setIsCheckingAnalysis(true)
      try {
        const res = await fetch(
          `/api/research/analysis?category_id=${catId}&country_id=${cntryId}`
        )
        const json = await res.json()
        const analyses = json.data || []

        const map: Record<string, 'completed' | 'missing'> = {}
        for (const type of ANALYSIS_TYPES) {
          const found = analyses.find(
            (a: Record<string, string>) =>
              a.analysis_type === type && a.status === 'completed'
          )
          map[type] = found ? 'completed' : 'missing'
        }
        setAnalysisAvailability(map)
      } catch {
        // Silent fail
      } finally {
        setIsCheckingAnalysis(false)
      }
    },
    [setAnalysisAvailability]
  )

  // When category/country selections change, update store
  useEffect(() => {
    if (selectedCatId && selectedCountryId) {
      const cat = categories.find((c) => c.id === selectedCatId)
      const country = countries.find((c) => c.id === selectedCountryId)
      if (cat && country) {
        setCategoryCountry(
          selectedCatId,
          selectedCountryId,
          cat.name,
          country.name,
          country.language,
          cat.brand,
          {
            title: country.title_limit,
            bullet: country.bullet_limit,
            bulletCount: country.bullet_count,
            description: country.description_limit,
            searchTerms: country.search_terms_limit,
          }
        )
        checkAnalysis(selectedCatId, selectedCountryId)
      }
    }
  }, [selectedCatId, selectedCountryId, categories, countries, setCategoryCountry, checkAnalysis])

  // Fetch all listings with sections for batch review
  const fetchAllListings = useCallback(async (jobId: string) => {
    try {
      // Get listing IDs from batch
      const batchRes = await fetch(`/api/batch/${jobId}`)
      const batchJson = await batchRes.json()
      const listingSummaries = batchJson.data?.listings || []

      // Fetch each listing with sections
      const listingsWithSections: BatchListingWithSections[] = []

      for (const summary of listingSummaries) {
        const listingRes = await fetch(`/api/listings/${summary.id}`)
        if (!listingRes.ok) continue
        const listingJson = await listingRes.json()
        if (listingJson.data) {
          listingsWithSections.push({
            listing: listingJson.data.listing,
            sections: listingJson.data.sections || [],
          })
        }
      }

      setGeneratedListings(listingsWithSections)
    } catch {
      toast.error('Failed to load generated listings')
    }
  }, [setGeneratedListings])

  // Polling logic for batch status
  const startPolling = useCallback(
    (jobId: string) => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollFailCountRef.current = 0

      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/batch/${jobId}`)
          if (!res.ok) throw new Error('Poll failed')
          const json = await res.json()
          const { batch_job } = json.data

          updateProgress(
            batch_job.completed_listings,
            batch_job.status,
            batch_job.failed_products
          )
          pollFailCountRef.current = 0

          // If done, stop polling and fetch full listings
          if (batch_job.status === 'completed' || batch_job.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null

            if (batch_job.status === 'completed' && batch_job.completed_listings > 0) {
              await fetchAllListings(jobId)
            }
          }
        } catch {
          pollFailCountRef.current++
          if (pollFailCountRef.current >= 3) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
            setGenerationError('Lost connection to server. Check batch status manually.')
          }
        }
      }, 2500)
    },
    [updateProgress, setGenerationError, fetchAllListings]
  )

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Handle batch generation
  const handleGenerate = async () => {
    const validProducts = products.filter((p) => p.product_name.trim().length >= 3)
    if (validProducts.length === 0) {
      toast.error('No valid products to generate')
      return
    }

    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          country_id: countryId,
          products: validProducts.map((p) => ({
            product_name: p.product_name.trim(),
            asin: p.asin?.trim() || undefined,
            brand: p.brand,
            attributes: p.attributes,
            product_type_name: p.product_type_name?.trim() || undefined,
          })),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create batch')
      }

      const { batch_job, failed_products } = json.data
      setBatchJob(batch_job.id, batch_job.total_listings)

      if (failed_products && failed_products.length > 0) {
        updateProgress(
          batch_job.completed_listings || 0,
          batch_job.status,
          failed_products
        )
      }

      // Start polling if the batch is processing
      if (batch_job.status === 'processing') {
        startPolling(batch_job.id)
      } else if (batch_job.status === 'completed') {
        // Already done (e.g. all failed instantly)
        updateProgress(
          batch_job.completed_listings || 0,
          batch_job.status,
          failed_products
        )
        if (batch_job.completed_listings > 0) {
          await fetchAllListings(batch_job.id)
        }
      }

      // Advance to Step 2
      setStep(2)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start batch generation'
      setGenerationError(message)
      toast.error(message)
    }
  }

  // Step validation
  const canAdvance = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!categoryId && !!countryId
      case 1:
        return products.some((p) => p.product_name.trim().length >= 3)
      case 2:
        return batchStatus === 'completed'
      default:
        return true
    }
  }

  const handleNext = () => {
    if (currentStep === 1) {
      // Step 1 → 2: trigger generation
      handleGenerate()
      return
    }
    if (currentStep < 3 && canAdvance(currentStep)) {
      setStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setStep(currentStep - 1)
    }
  }

  const handleContinueToReview = async () => {
    // Fetch listings if not already fetched
    if (batchJobId && useBatchStore.getState().generatedListings.length === 0) {
      await fetchAllListings(batchJobId)
    }
    setStep(3)
  }

  const completedCount = Object.values(analysisAvailability).filter(
    (v) => v === 'completed'
  ).length
  const hasAnyAnalysis = completedCount > 0

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Speed Mode</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Generate listings for multiple products at once using shared category research
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetBatch}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Start Over
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={index} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                    index < currentStep
                      ? 'bg-primary border-primary text-primary-foreground'
                      : index === currentStep
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    index <= currentStep
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-3 mt-[-1.5rem]',
                    index < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {/* Step 0: Category & Country */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Select Category & Country</h2>
              <p className="text-sm text-muted-foreground">
                Choose the category and marketplace. All products in this batch will share the
                same research analysis.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="batch-category">Product Category</Label>
                <select
                  id="batch-category"
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a category...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.brand})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-country">Target Marketplace</Label>
                <select
                  id="batch-country"
                  value={selectedCountryId}
                  onChange={(e) => setSelectedCountryId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a marketplace...</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.flag_emoji} {c.name} ({c.code}) — {c.language}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Analysis Availability */}
            {selectedCatId && selectedCountryId && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Research Analysis Status</h3>
                  {isCheckingAnalysis && (
                    <span className="text-xs text-muted-foreground">Checking...</span>
                  )}
                </div>

                {!isCheckingAnalysis && Object.keys(analysisAvailability).length > 0 && (
                  <>
                    <div className="space-y-2">
                      {ANALYSIS_TYPES.map((type) => (
                        <div key={type} className="flex items-center gap-3">
                          {analysisAvailability[type] === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                          )}
                          <span className="text-sm">
                            {ANALYSIS_LABELS[type] || type}
                          </span>
                          <Badge
                            variant={
                              analysisAvailability[type] === 'completed'
                                ? 'default'
                                : 'secondary'
                            }
                            className="ml-auto text-xs"
                          >
                            {analysisAvailability[type] === 'completed'
                              ? 'Available'
                              : 'Missing'}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {!hasAnyAnalysis && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3 mt-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-yellow-800 dark:text-yellow-200">
                              No research analysis available
                            </p>
                            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                              You can still generate listings, but they won&apos;t be optimized
                              with keyword and review data.{' '}
                              <Link
                                href={`/research?category=${selectedCatId}&country=${selectedCountryId}`}
                                className="underline inline-flex items-center gap-1"
                              >
                                Upload research files
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasAnyAnalysis && completedCount < 3 && (
                      <p className="text-xs text-muted-foreground">
                        {completedCount}/3 analysis types available. Listings will be generated
                        with available data.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Products */}
        {currentStep === 1 && <ProductTable />}

        {/* Step 2: Generation Progress */}
        {currentStep === 2 && (
          <BatchProgress onContinueToReview={handleContinueToReview} />
        )}

        {/* Step 3: Review & Export */}
        {currentStep === 3 && <BatchReview />}
      </div>

      {/* Navigation Buttons */}
      {currentStep < 2 && (
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          {currentStep === 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance(1) || isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Generate {products.filter((p) => p.product_name.trim().length >= 3).length} Listings
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canAdvance(currentStep)}>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
