'use client'

import { Loader2, CheckCircle2, XCircle, AlertCircle, Merge } from 'lucide-react'
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

function StatusIcon({ status }: { status: string | null }) {
  if (status === 'processing') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
  return <AlertCircle className="h-4 w-4 text-muted-foreground" />
}

function StatusBadge({ status, errorMessage }: { status: string | null; errorMessage?: string | null }) {
  if (status === 'processing') return <Badge variant="secondary" className="text-xs">Analyzing...</Badge>
  if (status === 'completed') return <Badge variant="success" className="text-xs">Complete</Badge>
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">Failed</Badge>
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
    )
  }
  if (!status) return <Badge variant="outline" className="text-xs">Not run</Badge>
  return null
}

export function AnalysisProgress({ analysisType, status, errorMessage }: AnalysisProgressProps) {
  const label = ANALYSIS_LABELS[analysisType] || analysisType
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <StatusBadge status={status} errorMessage={errorMessage} />
    </div>
  )
}

// ── Analysis Status Panel ──

interface AnalysisRecord {
  analysis_type: string
  source?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message?: string | null
  tokens_used?: number | null
  model_used?: string | null
  updated_at?: string
}

interface AnalysisStatusPanelProps {
  analyses: AnalysisRecord[]
  availableFileTypes: string[]
  isRunning: boolean
  onTrigger: (analysisType: string, source: string) => void
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

const FILE_TYPE_TO_ANALYSIS: Record<string, string> = {
  keywords: 'keyword_analysis',
  reviews: 'review_analysis',
  qna: 'qna_analysis',
  rufus_qna: 'qna_analysis',
  keywords_analysis: 'keyword_analysis',
  reviews_analysis: 'review_analysis',
  qna_analysis: 'qna_analysis',
}

function isStale(record: AnalysisRecord): boolean {
  return (
    record.status === 'processing' &&
    !!record.updated_at &&
    Date.now() - new Date(record.updated_at).getTime() > 5 * 60 * 1000
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  disabled: boolean
  variant?: 'default' | 'outline' | 'merge'
}) {
  const base = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    merge: 'bg-violet-600 text-white hover:bg-violet-700',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]}`}>
      {label}
    </button>
  )
}

// ── Sub-row for a single source (csv or file) within a dual-source analysis ──
function SourceRow({
  label,
  record,
  isRunning,
  onTrigger,
  buttonLabel,
  reButtonLabel,
}: {
  label: string
  record: AnalysisRecord | undefined
  isRunning: boolean
  onTrigger: () => void
  buttonLabel: string
  reButtonLabel: string
}) {
  const stale = record ? isStale(record) : false
  const canRun = !isRunning && (!record || record.status !== 'processing' || stale)
  const isComplete = record?.status === 'completed'

  return (
    <div className="flex items-center justify-between pl-6 py-1">
      <div className="flex items-center gap-2">
        <StatusIcon status={record?.status ?? null} />
        <span className="text-xs text-muted-foreground">{label}</span>
        <StatusBadge status={record?.status ?? null} errorMessage={record?.error_message} />
        {isComplete && record?.tokens_used != null && (
          <span className="text-[11px] text-muted-foreground">{record.tokens_used.toLocaleString()} tokens</span>
        )}
      </div>
      <ActionButton
        label={stale ? 'Stuck — Retry' : record?.status === 'processing' ? 'Running...' : isComplete ? reButtonLabel : buttonLabel}
        onClick={onTrigger}
        disabled={!canRun}
        variant="outline"
      />
    </div>
  )
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

  // Group analyses by type and source
  const analysisMap = new Map<string, Map<string, AnalysisRecord>>()
  for (const a of analyses) {
    if (!analysisMap.has(a.analysis_type)) {
      analysisMap.set(a.analysis_type, new Map())
    }
    const source = a.source || 'primary'
    analysisMap.get(a.analysis_type)!.set(source, a)
  }

  const orderedTypes = ['keyword_analysis', 'review_analysis', 'qna_analysis']

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Analysis Status</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Run AI analysis on uploaded research files
        </p>
      </div>
      <div className="p-4 space-y-4">
        {orderedTypes.map((at) => {
          const sources = analysisMap.get(at) || new Map<string, AnalysisRecord>()
          const hasSources = possibleAnalyses.has(at)

          const hasPreAnalyzedFile = !!ANALYSIS_TO_PRE_ANALYZED[at] && availableFileTypes.includes(ANALYSIS_TO_PRE_ANALYZED[at])
          const rawTypes = ANALYSIS_TO_RAW[at] || []
          const hasRawFile = rawTypes.some((rt) => availableFileTypes.includes(rt))
          const hasBothSources = hasPreAnalyzedFile && hasRawFile

          // Get records for each source
          const primaryRecord = sources.get('primary')
          const csvRecord = sources.get('csv')
          const fileRecord = sources.get('file')
          const mergedRecord = sources.get('merged')

          // For the header status: show merged if exists, else csv/file/primary
          const displayRecord = mergedRecord || csvRecord || fileRecord || primaryRecord

          const label = ANALYSIS_LABELS[at] || at

          if (!hasSources) {
            return (
              <div key={at} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                  <Badge variant="outline" className="text-xs">Not run</Badge>
                </div>
                <span className="text-xs text-muted-foreground">No files uploaded</span>
              </div>
            )
          }

          // ── DUAL SOURCE MODE: both CSV and analysis file exist ──
          if (hasBothSources) {
            const csvDone = csvRecord?.status === 'completed'
            const fileDone = fileRecord?.status === 'completed'
            const canMerge = csvDone && fileDone && !isRunning && mergedRecord?.status !== 'processing'
            const mergeStale = mergedRecord ? isStale(mergedRecord) : false

            return (
              <div key={at} className="space-y-1">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{label}</span>
                  {mergedRecord?.status === 'completed' && (
                    <Badge variant="success" className="text-xs">Merged</Badge>
                  )}
                </div>

                {/* CSV sub-row */}
                <SourceRow
                  label="CSV Data"
                  record={csvRecord}
                  isRunning={isRunning}
                  onTrigger={() => onTrigger(at, 'csv')}
                  buttonLabel="Analyze"
                  reButtonLabel="Re-analyze"
                />

                {/* File sub-row */}
                <SourceRow
                  label="Analysis File"
                  record={fileRecord}
                  isRunning={isRunning}
                  onTrigger={() => onTrigger(at, 'file')}
                  buttonLabel="Import"
                  reButtonLabel="Re-import"
                />

                {/* Merge row */}
                <div className="flex items-center justify-between pl-6 py-1">
                  <div className="flex items-center gap-2">
                    {mergedRecord?.status === 'processing' && !mergeStale ? (
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    ) : mergedRecord?.status === 'completed' ? (
                      <Merge className="h-4 w-4 text-violet-500" />
                    ) : (
                      <Merge className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">Merged Result</span>
                    {mergedRecord?.status === 'completed' && (
                      <>
                        <Badge variant="success" className="text-xs">Complete</Badge>
                        {mergedRecord.tokens_used != null && (
                          <span className="text-[11px] text-muted-foreground">
                            {mergedRecord.tokens_used.toLocaleString()} tokens
                          </span>
                        )}
                      </>
                    )}
                    {mergedRecord?.status === 'processing' && !mergeStale && (
                      <Badge variant="secondary" className="text-xs">Merging...</Badge>
                    )}
                    {mergedRecord?.status === 'failed' && (
                      <StatusBadge status="failed" errorMessage={mergedRecord.error_message} />
                    )}
                    {!csvDone || !fileDone ? (
                      <span className="text-[11px] text-muted-foreground italic">
                        Complete both above first
                      </span>
                    ) : null}
                  </div>
                  <ActionButton
                    label={
                      mergeStale
                        ? 'Stuck — Retry'
                        : mergedRecord?.status === 'processing'
                          ? 'Merging...'
                          : mergedRecord?.status === 'completed'
                            ? 'Re-merge'
                            : 'Merge'
                    }
                    onClick={() => onTrigger(at, 'merged')}
                    disabled={!canMerge || (mergedRecord?.status === 'processing' && !mergeStale)}
                    variant="merge"
                  />
                </div>
              </div>
            )
          }

          // ── SINGLE SOURCE MODE: only CSV or only analysis file ──
          const singleRecord = primaryRecord || csvRecord || fileRecord
          const singleStale = singleRecord ? isStale(singleRecord) : false
          const canRun = !isRunning && (!singleRecord || singleRecord.status !== 'processing' || singleStale)
          const isComplete = singleRecord?.status === 'completed'

          // Determine subtitle for QnA combination
          let subtitle: string | null = null
          if (at === 'qna_analysis') {
            const hasQna = availableFileTypes.includes('qna')
            const hasRufus = availableFileTypes.includes('rufus_qna')
            if (hasQna && hasRufus) subtitle = 'Combines: Q&A + Rufus Q&A files'
            else if (hasRufus) subtitle = 'Source: Rufus Q&A'
          }

          return (
            <div key={at} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={singleRecord?.status ?? null} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <StatusBadge status={singleRecord?.status ?? null} errorMessage={singleRecord?.error_message} />
                </div>
                {subtitle && (
                  <p className="text-[11px] text-muted-foreground ml-6 mt-0.5">{subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isComplete && singleRecord?.tokens_used != null && (
                  <span className="text-xs text-muted-foreground">
                    {singleRecord.tokens_used.toLocaleString()} tokens
                  </span>
                )}
                <ActionButton
                  label={
                    singleStale
                      ? 'Stuck — Retry'
                      : singleRecord?.status === 'processing'
                        ? 'Running...'
                        : isComplete
                          ? (hasPreAnalyzedFile ? 'Re-import' : 'Re-analyze')
                          : (hasPreAnalyzedFile ? 'Import' : 'Analyze')
                  }
                  onClick={() => onTrigger(at, 'primary')}
                  disabled={!canRun}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
