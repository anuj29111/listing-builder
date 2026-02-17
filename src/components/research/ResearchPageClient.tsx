'use client'

import { useState, useRef, useCallback } from 'react'
import { ResearchStatusMatrix } from '@/components/dashboard/ResearchStatusMatrix'
import { ResearchClient } from '@/components/research/ResearchClient'
import type { LbCategory, LbCountry } from '@/types'

interface ResearchFileWithJoins {
  id: string
  file_name: string
  file_type: string
  file_size_bytes: number | null
  row_count: number | null
  created_at: string
  category?: { name: string; slug: string; brand: string } | null
  country?: { name: string; code: string; flag_emoji: string | null } | null
  uploader?: { full_name: string | null } | null
}

interface ResearchPageClientProps {
  categories: LbCategory[]
  countries: LbCountry[]
  coverage: Record<string, string[]>
  initialFiles: ResearchFileWithJoins[]
  defaultCategoryId: string | null
  defaultCountryId: string | null
}

export function ResearchPageClient({
  categories,
  countries,
  coverage,
  initialFiles,
  defaultCategoryId,
  defaultCountryId,
}: ResearchPageClientProps) {
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId)
  const [countryId, setCountryId] = useState<string | null>(defaultCountryId)
  const researchRef = useRef<HTMLDivElement>(null)

  const handleCellClick = useCallback((catId: string, ctryId: string) => {
    setCategoryId(catId)
    setCountryId(ctryId)

    // Scroll to the research section
    setTimeout(() => {
      researchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const handleSelectionChange = useCallback((catId: string | null, ctryId: string | null) => {
    setCategoryId(catId)
    setCountryId(ctryId)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Research Management</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage CSV research files organized by category and
          marketplace.
        </p>
      </div>

      <ResearchStatusMatrix
        categories={categories}
        countries={countries}
        coverage={coverage}
        activeCategoryId={categoryId}
        activeCountryId={countryId}
        onCellClick={handleCellClick}
      />

      <div ref={researchRef}>
        <ResearchClient
          categories={categories}
          countries={countries}
          initialFiles={initialFiles as never[]}
          defaultCategoryId={defaultCategoryId}
          defaultCountryId={defaultCountryId}
          externalCategoryId={categoryId}
          externalCountryId={countryId}
          onSelectionChange={handleSelectionChange}
        />
      </div>
    </div>
  )
}
