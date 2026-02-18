'use client'

import { useState, useEffect, useCallback } from 'react'
import { useListingStore } from '@/stores/listing-store'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { LbCategory, LbCountry } from '@/types/database'
import { ANALYSIS_TYPES } from '@/lib/constants'

const ANALYSIS_LABELS: Record<string, string> = {
  keyword_analysis: 'Keyword Analysis',
  review_analysis: 'Review Analysis',
  qna_analysis: 'Q&A Analysis',
  competitor_analysis: 'Competitor Analysis',
}

interface StepCategoryCountryProps {
  categories: LbCategory[]
  countries: LbCountry[]
}

export function StepCategoryCountry({ categories, countries }: StepCategoryCountryProps) {
  const categoryId = useListingStore((s) => s.categoryId)
  const countryId = useListingStore((s) => s.countryId)
  const setCategoryCountry = useListingStore((s) => s.setCategoryCountry)
  const setAnalysisAvailability = useListingStore((s) => s.setAnalysisAvailability)
  const setProductDetails = useListingStore((s) => s.setProductDetails)
  const analysisAvailability = useListingStore((s) => s.analysisAvailability)

  const [selectedCatId, setSelectedCatId] = useState(categoryId || '')
  const [selectedCountryId, setSelectedCountryId] = useState(countryId || '')
  const [isChecking, setIsChecking] = useState(false)

  const checkAnalysis = useCallback(async (catId: string, cntryId: string) => {
    if (!catId || !cntryId) return
    setIsChecking(true)
    try {
      const res = await fetch(
        `/api/research/analysis?category_id=${catId}&country_id=${cntryId}`
      )
      const json = await res.json()
      const analyses = json.data || []

      const map: Record<string, 'completed' | 'missing'> = {}
      for (const type of ANALYSIS_TYPES) {
        const found = analyses.find(
          (a: Record<string, string>) => a.analysis_type === type && a.status === 'completed'
        )
        map[type] = found ? 'completed' : 'missing'
      }
      setAnalysisAvailability(map)
    } catch {
      // Silent fail — availability stays empty
    } finally {
      setIsChecking(false)
    }
  }, [setAnalysisAvailability])

  // When both selections change, update store and check analysis
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
          {
            title: country.title_limit,
            bullet: country.bullet_limit,
            bulletCount: country.bullet_count,
            description: country.description_limit,
            searchTerms: country.search_terms_limit,
          }
        )
        // Auto-fill brand from category
        setProductDetails({ brand: cat.brand })
        checkAnalysis(selectedCatId, selectedCountryId)
      }
    }
  }, [selectedCatId, selectedCountryId, categories, countries, setCategoryCountry, setProductDetails, checkAnalysis])

  const completedCount = Object.values(analysisAvailability).filter((v) => v === 'completed').length
  const hasAnyAnalysis = completedCount > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Select Category & Country</h2>
        <p className="text-sm text-muted-foreground">
          Choose the product category and target marketplace for your listing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category Select */}
        <div className="space-y-2">
          <Label htmlFor="category">Product Category</Label>
          <select
            id="category"
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

        {/* Country Select */}
        <div className="space-y-2">
          <Label htmlFor="country">Target Marketplace</Label>
          <select
            id="country"
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
            {isChecking && (
              <span className="text-xs text-muted-foreground">Checking...</span>
            )}
          </div>

          {!isChecking && Object.keys(analysisAvailability).length > 0 && (
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
                        You can still generate a listing, but it won&apos;t be optimized with keyword
                        and review data.{' '}
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
                  {completedCount}/3 analysis types available. Listing will be generated
                  with available data.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
