'use client'

import { useState, useCallback } from 'react'
import { AnalysisStatusPanel } from '@/components/research/AnalysisProgress'
import { AnalysisViewer } from '@/components/research/AnalysisViewer'
import toast from 'react-hot-toast'

interface AnalysisRecord {
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

interface AnalysisPageClientProps {
  categoryId: string
  countryId: string
  initialAnalyses: AnalysisRecord[]
  availableFileTypes: string[]
}

export function AnalysisPageClient({
  categoryId,
  countryId,
  initialAnalyses,
  availableFileTypes,
}: AnalysisPageClientProps) {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>(initialAnalyses)
  const [isRunning, setIsRunning] = useState(false)

  const handleTriggerAnalysis = useCallback(
    async (analysisType: string, source: string) => {
      setIsRunning(true)

      // Optimistically update status to processing for this specific source
      setAnalyses((prev) => {
        const existing = prev.find((a) => a.analysis_type === analysisType && (a.source || 'primary') === source)
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

        setAnalyses((prev) =>
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
    },
    [categoryId, countryId]
  )

  return (
    <div className="space-y-6">
      <AnalysisStatusPanel
        analyses={analyses}
        availableFileTypes={availableFileTypes}
        isRunning={isRunning}
        onTrigger={handleTriggerAnalysis}
      />

      <AnalysisViewer analyses={analyses} />
    </div>
  )
}
