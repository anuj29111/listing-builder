'use client'

import { useBatchStore } from '@/stores/batch-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react'

interface BatchProgressProps {
  onContinueToReview: () => void
}

export function BatchProgress({ onContinueToReview }: BatchProgressProps) {
  const batchStatus = useBatchStore((s) => s.batchStatus)
  const totalListings = useBatchStore((s) => s.totalListings)
  const completedListings = useBatchStore((s) => s.completedListings)
  const failedProducts = useBatchStore((s) => s.failedProducts)
  const generationError = useBatchStore((s) => s.generationError)

  const progressPercent =
    totalListings > 0 ? Math.round((completedListings / totalListings) * 100) : 0
  const isProcessing = batchStatus === 'processing'
  const isCompleted = batchStatus === 'completed'
  const isFailed = batchStatus === 'failed'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Generating Listings</h2>
        <p className="text-sm text-muted-foreground">
          {isProcessing
            ? 'Claude is generating listings for each product...'
            : isCompleted
              ? 'All listings have been generated!'
              : isFailed
                ? 'Batch generation failed.'
                : 'Preparing to generate...'}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isFailed && <XCircle className="h-5 w-5 text-destructive" />}
            <span className="font-medium">
              {isProcessing
                ? `Generating ${completedListings + 1} of ${totalListings}...`
                : isCompleted
                  ? `${completedListings} of ${totalListings} listings generated`
                  : isFailed
                    ? 'Generation failed'
                    : 'Starting...'}
            </span>
          </div>
          <Badge variant={isCompleted ? 'default' : isFailed ? 'destructive' : 'secondary'}>
            {progressPercent}%
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFailed
                ? 'bg-destructive'
                : isCompleted
                  ? 'bg-green-500'
                  : 'bg-primary'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">{totalListings}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed: </span>
            <span className="font-medium text-green-600">{completedListings}</span>
          </div>
          {failedProducts.length > 0 && (
            <div>
              <span className="text-muted-foreground">Failed: </span>
              <span className="font-medium text-destructive">{failedProducts.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {generationError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Error</p>
              <p className="text-destructive/80 mt-1">{generationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Failed products list */}
      {failedProducts.length > 0 && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {failedProducts.length} product{failedProducts.length > 1 ? 's' : ''} failed
            </span>
          </div>
          <ul className="space-y-1">
            {failedProducts.map((fp, i) => (
              <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300">
                <span className="font-medium">{fp.product_name}</span>: {fp.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Continue button */}
      {isCompleted && completedListings > 0 && (
        <div className="flex justify-center">
          <Button onClick={onContinueToReview} size="lg">
            Continue to Review ({completedListings} listings)
          </Button>
        </div>
      )}
    </div>
  )
}
