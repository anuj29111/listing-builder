'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AnalysisStatusPanel } from '@/components/research/AnalysisProgress'
import { AnalysisViewer } from '@/components/research/AnalysisViewer'
import { FILE_TYPE_SHORT_LABELS } from '@/lib/constants'
import toast from 'react-hot-toast'

// Only show raw data file types in the coverage matrix (not analysis files)
const MATRIX_FILE_TYPES = ['keywords', 'reviews', 'qna', 'rufus_qna'] as const

interface StatusMatrixProps {
  categories: Array<{
    id: string
    name: string
    slug: string
    brand: string
  }>
  countries: Array<{
    id: string
    name: string
    code: string
    flag_emoji: string | null
  }>
  coverage: Record<string, string[]>
}

interface ExpandedFile {
  id: string
  file_name: string
  file_type: string
  file_size_bytes: number | null
  row_count: number | null
  created_at: string
}

interface ExpandedAnalysis {
  id: string
  analysis_type: string
  source: string
  analysis_result: Record<string, unknown>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  model_used: string | null
  tokens_used: number | null
  updated_at: string
}

const fileTypeColors: Record<string, string> = {
  keywords: 'bg-green-500',
  reviews: 'bg-blue-500',
  qna: 'bg-orange-500',
  rufus_qna: 'bg-purple-500',
}

const brandColors: Record<string, string> = {
  Chalkola: 'bg-blue-100 text-blue-800',
  Spedalon: 'bg-green-100 text-green-800',
  Funcils: 'bg-purple-100 text-purple-800',
  Other: 'bg-gray-100 text-gray-800',
}

export function ResearchStatusMatrix({
  categories,
  countries,
  coverage,
}: StatusMatrixProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null) // "categoryId:countryId"
  const [expandLoading, setExpandLoading] = useState(false)
  const [expandFiles, setExpandFiles] = useState<ExpandedFile[]>([])
  const [expandAnalyses, setExpandAnalyses] = useState<ExpandedAnalysis[]>([])
  const [isRunning, setIsRunning] = useState(false)

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        No categories created yet. Add categories in Settings to see the
        research coverage matrix.
      </div>
    )
  }

  const expandedCategoryId = expanded?.split(':')[0] || null
  const expandedCountryId = expanded?.split(':')[1] || null

  async function handleCellClick(categoryId: string, countryId: string) {
    const key = `${categoryId}:${countryId}`

    // Toggle off if already expanded
    if (expanded === key) {
      setExpanded(null)
      return
    }

    setExpanded(key)
    setExpandLoading(true)
    setExpandFiles([])
    setExpandAnalyses([])

    try {
      const [filesRes, analysisRes] = await Promise.all([
        fetch(`/api/research/files?category_id=${categoryId}&country_id=${countryId}`),
        fetch(`/api/research/analysis?category_id=${categoryId}&country_id=${countryId}`),
      ])
      const filesJson = await filesRes.json()
      const analysisJson = await analysisRes.json()

      if (filesRes.ok) setExpandFiles(filesJson.data || [])
      if (analysisRes.ok) setExpandAnalyses(analysisJson.data || [])
    } catch {
      // Silent fail
    } finally {
      setExpandLoading(false)
    }
  }

  const handleTriggerAnalysis = async (analysisType: string, source: string) => {
    if (!expandedCategoryId || !expandedCountryId) return
    setIsRunning(true)

    // Optimistic update
    setExpandAnalyses((prev) => {
      const existing = prev.find(
        (a) => a.analysis_type === analysisType && (a.source || 'primary') === source
      )
      if (existing) {
        return prev.map((a) =>
          a.analysis_type === analysisType && (a.source || 'primary') === source
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
          category_id: expandedCategoryId,
          country_id: expandedCountryId,
          analysis_type: analysisType,
          source,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analysis failed')

      const completed = json.data as ExpandedAnalysis
      setExpandAnalyses((prev) => {
        const idx = prev.findIndex(
          (a) => a.analysis_type === analysisType && (a.source || 'primary') === source
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
      setExpandAnalyses((prev) =>
        prev.map((a) =>
          a.analysis_type === analysisType && (a.source || 'primary') === source
            ? { ...a, status: 'failed' as const, error_message: errorMessage }
            : a
        )
      )
      toast.error(errorMessage)
    } finally {
      setIsRunning(false)
    }
  }

  // Find expanded category/country details
  const expandedCategory = categories.find((c) => c.id === expandedCategoryId)
  const expandedCountry = countries.find((c) => c.id === expandedCountryId)
  const availableFileTypes = Array.from(new Set(expandFiles.map((f) => f.file_type)))

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Research Coverage</h3>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {MATRIX_FILE_TYPES.map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${fileTypeColors[key]}`}
              />
              {FILE_TYPE_SHORT_LABELS[key]}
            </div>
          ))}
          <span className="ml-auto text-[11px] italic">Click any cell to expand</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 sticky left-0 bg-muted/50 z-10 min-w-[160px]">
                Category
              </th>
              {countries.map((country) => (
                <th
                  key={country.id}
                  className="text-center font-medium p-3 min-w-[80px]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{country.flag_emoji || country.code}</span>
                    <span className="text-xs">{country.code}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const isExpRow = expandedCategoryId === category.id

              return (
                <CatBlock key={category.id}>
                  <tr className={`border-b ${isExpRow ? 'bg-muted/30' : ''}`}>
                    <td className={`p-3 sticky left-0 z-10 ${isExpRow ? 'bg-muted/30' : 'bg-card'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.name}</span>
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            brandColors[category.brand] || brandColors.Other
                          }`}
                        >
                          {category.brand}
                        </span>
                      </div>
                    </td>
                    {countries.map((country) => {
                      const key = `${category.id}:${country.id}`
                      const types = coverage[key] || []
                      const isActive = expanded === key
                      return (
                        <td
                          key={country.id}
                          className={`p-3 text-center cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-primary/10 ring-2 ring-primary/30 ring-inset'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => handleCellClick(category.id, country.id)}
                        >
                          {types.length === 0 ? (
                            <span className="text-muted-foreground/30">-</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              {Object.keys(fileTypeColors).map((ft) => (
                                <span
                                  key={ft}
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                                    types.includes(ft)
                                      ? fileTypeColors[ft]
                                      : 'bg-muted'
                                  }`}
                                  title={FILE_TYPE_SHORT_LABELS[ft]}
                                />
                              ))}
                            </div>
                          )}
                          {isActive && (
                            <ChevronDown className="h-3 w-3 mx-auto mt-1 text-primary" />
                          )}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Expanded detail panel */}
                  {isExpRow && expanded && (
                    <tr>
                      <td colSpan={countries.length + 1} className="p-0">
                        <div className="border-t border-primary/20 bg-card">
                          {/* Header */}
                          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">
                                {expandedCategory?.name}
                              </span>
                              <span className="text-sm text-muted-foreground">in</span>
                              <span className="text-sm font-semibold">
                                {expandedCountry?.flag_emoji} {expandedCountry?.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/research?category=${expandedCategoryId}&country=${expandedCountryId}`)
                                }}
                                className="text-xs text-primary hover:underline"
                              >
                                Open full view
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpanded(null)
                                }}
                                className="p-1 rounded hover:bg-muted"
                              >
                                <X className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </div>
                          </div>

                          {expandLoading ? (
                            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Loading...</span>
                            </div>
                          ) : (
                            <div className="p-4 space-y-4">
                              {/* Files summary */}
                              <div className="rounded-lg border">
                                <div className="px-4 py-2 border-b bg-muted/30">
                                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    Uploaded Files ({expandFiles.length})
                                  </h4>
                                </div>
                                {expandFiles.length === 0 ? (
                                  <div className="p-4 text-center text-xs text-muted-foreground">
                                    No files uploaded yet.{' '}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        router.push(`/research?category=${expandedCategoryId}&country=${expandedCountryId}`)
                                      }}
                                      className="text-primary hover:underline"
                                    >
                                      Upload files
                                    </button>
                                  </div>
                                ) : (
                                  <div className="p-3">
                                    <div className="flex flex-wrap gap-2">
                                      {expandFiles.map((f) => (
                                        <div
                                          key={f.id}
                                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"
                                        >
                                          <span
                                            className={`inline-block h-2 w-2 rounded-full ${
                                              fileTypeColors[f.file_type] || 'bg-gray-400'
                                            }`}
                                          />
                                          <span className="font-medium">
                                            {FILE_TYPE_SHORT_LABELS[f.file_type] || f.file_type}
                                          </span>
                                          <span className="text-muted-foreground">
                                            {f.file_name.length > 25
                                              ? f.file_name.slice(0, 22) + '...'
                                              : f.file_name}
                                          </span>
                                          {f.row_count != null && (
                                            <Badge variant="outline" className="text-[10px] py-0">
                                              {f.row_count} rows
                                            </Badge>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Analysis status */}
                              {expandFiles.length > 0 && (
                                <AnalysisStatusPanel
                                  analyses={expandAnalyses}
                                  availableFileTypes={availableFileTypes}
                                  isRunning={isRunning}
                                  onTrigger={handleTriggerAnalysis}
                                />
                              )}

                              {/* Analysis viewer */}
                              {expandAnalyses.some((a) => a.status === 'completed') && (
                                <AnalysisViewer analyses={expandAnalyses} />
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </CatBlock>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Wrapper to allow multiple <tr> in tbody for each category
function CatBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
