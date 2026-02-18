'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ClipboardCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { QnACoverageResult } from '@/types/api'

interface QnAVerificationProps {
  listingId: string
}

export function QnAVerification({ listingId }: QnAVerificationProps) {
  const [result, setResult] = useState<QnACoverageResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/listings/${listingId}/verify-qa`, {
        method: 'POST',
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Verification failed')
      }

      setResult(json.data)
      setIsExpanded(true)
      toast.success('Q&A coverage verified!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 bg-green-50 dark:bg-green-900/20'
    if (score >= 6) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
    return 'text-red-600 bg-red-50 dark:bg-red-900/20'
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-4 w-4 text-blue-500" />
          <h3 className="font-medium">Q&A Coverage Verification</h3>
          {result && (
            <Badge className={getScoreColor(result.overallScore)}>
              Score: {result.overallScore}/10
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Verifying...
              </>
            ) : result ? (
              'Re-verify'
            ) : (
              'Verify Q&A Coverage'
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 pb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {result && isExpanded && (
        <div className="border-t px-4 pb-4 space-y-4">
          {/* Summary row */}
          <div className="flex items-center gap-4 pt-3 text-sm flex-wrap">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              {result.addressedCount} addressed
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              {result.partiallyAddressedCount} partial
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              {result.unaddressedCount} missing
            </span>
            <span className="text-muted-foreground">
              {result.totalQuestions} total checked
            </span>
          </div>

          {/* Coverage matrix */}
          <div className="space-y-2">
            {result.coverageMatrix.map((item, i) => (
              <div
                key={i}
                className={`rounded-md border p-3 text-sm ${
                  item.addressed
                    ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10 dark:border-green-800'
                    : item.partially
                    ? 'border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10 dark:border-yellow-800'
                    : 'border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {item.addressed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  ) : item.partially ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{item.question}</p>
                    {item.addressedIn && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Found in: <span className="font-medium">{item.addressedIn}</span>
                      </p>
                    )}
                    {item.excerpt && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        &ldquo;{item.excerpt}&rdquo;
                      </p>
                    )}
                    {item.recommendation && (
                      <p className="text-xs mt-1.5 text-orange-700 dark:text-orange-400">
                        Recommendation: {item.recommendation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
