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
            <span className="text-xs text-muted-foreground truncate max-w-[300px]" title={errorMessage}>
              {errorMessage.includes('prompt is too long')
                ? 'File too large — will be auto-sampled on retry'
                : errorMessage.length > 60
                  ? errorMessage.slice(0, 60) + '...'
                  : errorMessage}
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

// Maps analysis type → which pre-analyzed file type to check for
const ANALYSIS_TO_PRE_ANALYZED: Record<string, string> = {
  keyword_analysis: 'keywords_analysis',
  review_analysis: 'reviews_analysis',
  qna_analysis: 'qna_analysis',
}

// Maps analysis type → which raw file types feed into it
const ANALYSIS_TO_RAW: Record<string, string[]> = {
  keyword_analysis: ['keywords'],
  review_analysis: ['reviews'],
  qna_analysis: ['qna', 'rufus_qna'],
}

function getAnalysisSubtitle(analysisType: string, fileTypes: string[]): string | null {
  const preAnalyzedType = ANALYSIS_TO_PRE_ANALYZED[analysisType]
  const hasPreAnalyzed = preAnalyzedType && fileTypes.includes(preAnalyzedType)
  const rawTypes = ANALYSIS_TO_RAW[analysisType] || []
  const hasRaw = rawTypes.some((rt) => fileTypes.includes(rt))

  // Both pre-analyzed AND raw CSV exist → will merge
  if (hasPreAnalyzed && hasRaw) {
    return 'Will merge: analysis file + raw CSV data (AI-powered merge)'
  }

  // Only pre-analyzed file
  if (hasPreAnalyzed) {
    return 'Will use: uploaded analysis file (low/no AI cost)'
  }

  // Special case for QnA with multiple sources
  if (analysisType === 'qna_analysis') {
    const hasQna = fileTypes.includes('qna')
    const hasRufus = fileTypes.includes('rufus_qna')
    if (hasQna && hasRufus) return 'Combines: Q&A + Rufus Q&A files'
    if (hasRufus) return 'Source: Rufus Q&A'
  }

  return null
}

const FILE_TYPE_TO_ANALYSIS: Record<string, string> = {
  keywords: 'keyword_analysis',
  reviews: 'review_analysis',
  qna: 'qna_analysis',
  rufus_qna: 'qna_analysis',
  keywords_analysis: 'keyword_analysis',
  reviews_analysis: 'review_analysis',
  qna_analysis: 'qna_analysis',
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

          // Detect stale processing — if stuck for > 5 minutes, allow re-triggering
          const isStaleProcessing =
            existing?.status === 'processing' &&
            existing?.updated_at &&
            Date.now() - new Date(existing.updated_at).getTime() > 5 * 60 * 1000

          const canRun = hasSources && !isRunning && (existing?.status !== 'processing' || isStaleProcessing)
          const isComplete = existing?.status === 'completed'

          const subtitle = getAnalysisSubtitle(at, availableFileTypes)
          const hasPreAnalyzedFile = !!ANALYSIS_TO_PRE_ANALYZED[at] && availableFileTypes.includes(ANALYSIS_TO_PRE_ANALYZED[at])
          const rawTypes = ANALYSIS_TO_RAW[at] || []
          const hasRawFile = rawTypes.some((rt) => availableFileTypes.includes(rt))
          const hasBothSources = hasPreAnalyzedFile && hasRawFile

          return (
            <div key={at} className="flex items-center justify-between">
              <div>
                <AnalysisProgress
                  analysisType={at}
                  status={existing?.status ?? null}
                  errorMessage={existing?.error_message}
                />
                {subtitle && (
                  <p className="text-[11px] text-muted-foreground ml-6 mt-0.5">{subtitle}</p>
                )}
              </div>
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
                    {isStaleProcessing
                      ? 'Stuck — Retry'
                      : existing?.status === 'processing'
                        ? 'Running...'
                        : isComplete
                          ? (hasBothSources ? 'Re-merge' : hasPreAnalyzedFile ? 'Re-import' : 'Re-analyze')
                          : (hasBothSources ? 'Merge' : hasPreAnalyzedFile ? 'Import' : 'Analyze')}
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
