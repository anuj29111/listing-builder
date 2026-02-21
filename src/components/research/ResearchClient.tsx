'use client'

import { useState, useEffect, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileUploader } from '@/components/research/FileUploader'
import { FileList } from '@/components/research/FileList'
import { AnalysisStatusPanel } from '@/components/research/AnalysisProgress'
import { AnalysisViewer } from '@/components/research/AnalysisViewer'
import { MarketIntelligenceSelector } from '@/components/research/MarketIntelligenceSelector'
import { Info } from 'lucide-react'
import toast from 'react-hot-toast'
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

interface AnalysisRecord {
  id: string
  analysis_type: string
  source: string
  analysis_result: Record<string, unknown>
  market_intelligence_id?: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  model_used: string | null
  tokens_used: number | null
  updated_at: string
}

interface ResearchClientProps {
  categories: LbCategory[]
  countries: LbCountry[]
  initialFiles: ResearchFileWithJoins[]
  defaultCategoryId: string | null
  defaultCountryId: string | null
  externalCategoryId?: string | null
  externalCountryId?: string | null
  onSelectionChange?: (categoryId: string | null, countryId: string | null) => void
}

export function ResearchClient({
  categories,
  countries,
  initialFiles,
  defaultCategoryId,
  defaultCountryId,
  externalCategoryId,
  externalCountryId,
  onSelectionChange,
}: ResearchClientProps) {
  const [internalCategoryId, setInternalCategoryId] = useState<string | null>(
    defaultCategoryId
  )
  const [internalCountryId, setInternalCountryId] = useState<string | null>(defaultCountryId)

  // Use external selection if provided, otherwise internal
  const categoryId = externalCategoryId !== undefined ? externalCategoryId : internalCategoryId
  const countryId = externalCountryId !== undefined ? externalCountryId : internalCountryId

  const setCategoryId = (val: string | null) => {
    setInternalCategoryId(val)
    onSelectionChange?.(val, countryId)
  }
  const setCountryId = (val: string | null) => {
    setInternalCountryId(val)
    onSelectionChange?.(categoryId, val)
  }
  const [files, setFiles] = useState<ResearchFileWithJoins[]>(initialFiles)
  const [loading, setLoading] = useState(false)

  // Analysis state
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const fetchFiles = useCallback(async () => {
    if (!categoryId || !countryId) {
      setFiles([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('category_id', categoryId)
      params.set('country_id', countryId)

      const res = await fetch(`/api/research/files?${params.toString()}`)
      const json = await res.json()

      if (res.ok) {
        setFiles(json.data || [])
      }
    } catch {
      // Silent fail — files just won't update
    } finally {
      setLoading(false)
    }
  }, [categoryId, countryId])

  const fetchAnalyses = useCallback(async () => {
    if (!categoryId || !countryId) {
      setAnalyses([])
      return
    }

    try {
      const res = await fetch(
        `/api/research/analysis?category_id=${categoryId}&country_id=${countryId}`
      )
      const json = await res.json()
      if (res.ok) {
        setAnalyses(json.data || [])
      }
    } catch {
      // Silent fail
    }
  }, [categoryId, countryId])

  // Fetch files and analyses when category or country changes
  useEffect(() => {
    if (!categoryId || !countryId) return

    // Always fetch both — initialFiles may be stale from server cache
    fetchFiles()
    fetchAnalyses()
  }, [categoryId, countryId, fetchFiles, fetchAnalyses])

  function handleUploadComplete(newFile: unknown) {
    setFiles((prev) => [newFile as ResearchFileWithJoins, ...prev])
  }

  function handleDelete(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleTriggerAnalysis = useCallback(
    async (analysisType: string, source: string) => {
      if (!categoryId || !countryId) return
      setIsRunning(true)

      // Optimistically update status to processing for this specific source
      setAnalyses((prev) => {
        const existing = prev.find(
          (a) => a.analysis_type === analysisType && (a.source || 'csv') === source
        )
        if (existing) {
          return prev.map((a) =>
            a.analysis_type === analysisType && (a.source || 'csv') === source
              ? { ...a, status: 'processing' as const, error_message: null }
              : a
          )
        }
        return [
          ...prev,
          {
            id: 'temp-' + source,
            analysis_type: analysisType,
            source,
            analysis_result: {},
            status: 'processing' as const,
            error_message: null,
            model_used: null,
            tokens_used: null,
            updated_at: new Date().toISOString(),
          },
        ]
      })

      try {
        const res = await fetch('/api/research/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: categoryId,
            country_id: countryId,
            analysis_type: analysisType,
            source,
          }),
        })

        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Analysis failed')
        }

        // Replace with actual result
        const completed = json.data as AnalysisRecord
        setAnalyses((prev) => {
          const idx = prev.findIndex(
            (a) => a.analysis_type === analysisType && (a.source || 'csv') === source
          )
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = completed
            return updated
          }
          return [...prev, completed]
        })

        const sourceLabel = source === 'merged' ? 'Merge' : source === 'file' ? 'Import' : 'Analysis'
        toast.success(`${sourceLabel} completed successfully`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Analysis failed'

        setAnalyses((prev) =>
          prev.map((a) =>
            a.analysis_type === analysisType && (a.source || 'csv') === source
              ? { ...a, status: 'failed' as const, error_message: errorMessage }
              : a
          )
        )

        toast.error(errorMessage)
      } finally {
        setIsRunning(false)
      }
    },
    [categoryId, countryId]
  )

  const selectedCategory = categories.find((c) => c.id === categoryId)
  const selectedCountry = countries.find((c) => c.id === countryId)

  // Derive available file types from current files
  const availableFileTypes = Array.from(new Set(files.map((f) => f.file_type)))

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryId || ''}
              onValueChange={(val) => setCategoryId(val || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name} ({cat.brand})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Country / Marketplace</Label>
            <Select
              value={countryId || ''}
              onValueChange={(val) => setCountryId(val || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select marketplace" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.flag_emoji} {country.name} ({country.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedCategory && selectedCountry && (
          <p className="text-sm text-muted-foreground mt-3">
            Showing research for{' '}
            <span className="font-medium">{selectedCategory.name}</span> in{' '}
            <span className="font-medium">
              {selectedCountry.flag_emoji} {selectedCountry.name}
            </span>
          </p>
        )}
      </div>

      {categoryId && countryId ? (
        <>
          {/* Step 1: Upload Files */}
          <div>
            <h2 className="text-lg font-semibold mb-1">Step 1: Upload Research Files</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your keyword, review, and Q&A CSV files. You can also upload pre-analyzed files (MD/JSON) to skip the AI analysis step.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <FileUploader
                  categories={categories}
                  countries={countries}
                  selectedCategoryId={categoryId}
                  selectedCountryId={countryId}
                  onUploadComplete={handleUploadComplete}
                />
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-lg border bg-card">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">
                      Uploaded Files
                      {files.length > 0 && (
                        <span className="text-muted-foreground font-normal ml-2">
                          ({files.length})
                        </span>
                      )}
                    </h3>
                  </div>
                  {loading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Loading files...
                    </div>
                  ) : (
                    <FileList files={files} onDelete={handleDelete} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Market Intelligence — link a completed MI report (independent of file uploads) */}
          <MarketIntelligenceSelector
            categoryId={categoryId}
            countryId={countryId}
            linkedMiId={
              analyses.find(
                (a) => a.analysis_type === 'market_intelligence' && a.source === 'linked'
              )?.market_intelligence_id || null
            }
            onLinkChange={fetchAnalyses}
          />

          {/* Step 2: Run Analysis */}
          <div>
            <h2 className="text-lg font-semibold mb-1">Step 2: Run AI Analysis</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Once your files are uploaded, click &ldquo;Analyze&rdquo; for each type to generate insights. These will be used when creating listings.
            </p>

            {files.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span className="text-sm">Upload research files above to enable analysis.</span>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <AnalysisStatusPanel
                  analyses={analyses}
                  availableFileTypes={availableFileTypes}
                  isRunning={isRunning}
                  onTrigger={handleTriggerAnalysis}
                />

                <AnalysisViewer analyses={analyses} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Select a category and marketplace above to view and upload research
          files.
        </div>
      )}
    </div>
  )
}
