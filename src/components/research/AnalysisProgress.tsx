'use client'

import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface AnalysisProgressProps {
  analysisType: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | null
  errorMessage?: string | null
}

const ANALYSIS_LABELS: Record<string, string> = {
  keyword_analysis: 'Keyword Analysis',
  review_analysis: 'Review Analysis',
  qna_analysis: 'Q&A Analysis',
}

export function AnalysisProgress({ analysisType, status, errorMessage }: AnalysisProgressProps) {
  const label = ANALYSIS_LABELS[analysisType] || analysisType

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {status === 'processing' && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
        {status === 'completed' && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        {status === 'failed' && (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        {(status === 'pending' || !status) && (
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>

      {status === 'processing' && (
        <Badge variant="secondary" className="text-xs">
          Analyzing...
        </Badge>
      )}
      {status === 'completed' && (
        <Badge variant="success" className="text-xs">
          Complete
        </Badge>
      )}
      {status === 'failed' && (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs">
            Failed
          </Badge>
          {errorMessage && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {errorMessage}
            </span>
          )}
        </div>
      )}
      {!status && (
        <Badge variant="outline" className="text-xs">
          Not run
        </Badge>
      )}
    </div>
  )
}

interface AnalysisStatusPanelProps {
  analyses: Array<{
    analysis_type: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    error_message?: string | null
    tokens_used?: number | null
    model_used?: string | null
    updated_at?: string
  }>
  availableFileTypes: string[]
  isRunning: boolean
  onTrigger: (analysisType: string) => void
}

const FILE_TYPE_TO_ANALYSIS: Record<string, string> = {
  keywords: 'keyword_analysis',
  reviews: 'review_analysis',
  qna: 'qna_analysis',
  rufus_qna: 'qna_analysis',
}

export function AnalysisStatusPanel({
  analyses,
  availableFileTypes,
  isRunning,
  onTrigger,
}: AnalysisStatusPanelProps) {
  // Determine which analysis types are possible based on available files
  const possibleAnalyses = new Set<string>()
  for (const ft of availableFileTypes) {
    const at = FILE_TYPE_TO_ANALYSIS[ft]
    if (at) possibleAnalyses.add(at)
  }

  const analysisMap = new Map(analyses.map((a) => [a.analysis_type, a]))

  const orderedTypes = ['keyword_analysis', 'review_analysis', 'qna_analysis']

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Analysis Status</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Run AI analysis on uploaded research files
        </p>
      </div>
      <div className="p-4 space-y-3">
        {orderedTypes.map((at) => {
          const existing = analysisMap.get(at)
          const hasSources = possibleAnalyses.has(at)
          const canRun = hasSources && !isRunning && existing?.status !== 'processing'
          const isComplete = existing?.status === 'completed'

          return (
            <div key={at} className="flex items-center justify-between">
              <AnalysisProgress
                analysisType={at}
                status={existing?.status ?? null}
                errorMessage={existing?.error_message}
              />
              <div className="flex items-center gap-2">
                {isComplete && existing?.tokens_used && (
                  <span className="text-xs text-muted-foreground">
                    {existing.tokens_used.toLocaleString()} tokens
                  </span>
                )}
                {hasSources ? (
                  <button
                    onClick={() => onTrigger(at)}
                    disabled={!canRun}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {existing?.status === 'processing'
                      ? 'Running...'
                      : isComplete
                        ? 'Re-analyze'
                        : 'Analyze'}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No files uploaded
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
