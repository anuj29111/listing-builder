'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { ImageStackRecommendation, ImageStackRecommendationsResult } from '@/types/api'

interface ImageStackRecommendationsProps {
  categoryId: string
  countryId: string
  onAccept?: (recommendations: ImageStackRecommendation[]) => void
}

export function ImageStackRecommendations({
  categoryId,
  countryId,
  onAccept,
}: ImageStackRecommendationsProps) {
  const [result, setResult] = useState<ImageStackRecommendationsResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleGenerate = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/images/workshop/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId, country_id: countryId }),
      })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error || 'Failed to get recommendations')

      setResult(json.data)
      setIsExpanded(true)
      toast.success('Image stack recommendations generated!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get recommendations')
    } finally {
      setIsLoading(false)
    }
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'HIGH': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'LOW': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return ''
    }
  }

  if (!result && !isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <Lightbulb className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h3 className="font-semibold mb-1">AI Image Stack Recommendations</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Get data-driven recommendations for your 9 secondary image positions based on keyword demand, review insights, and Q&A patterns.
        </p>
        <Button onClick={handleGenerate} variant="outline" className="gap-2">
          <Lightbulb className="h-4 w-4" />
          Get Recommendations
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing research data for image recommendations...</p>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="font-medium">AI Image Stack Recommendations</h3>
          <Badge variant="outline" className="text-xs">
            {result.recommendations.length} positions
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {onAccept && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onAccept(result.recommendations)
              }}
              className="gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Accept & Generate
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleGenerate()
            }}
          >
            Refresh
          </Button>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t px-4 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground pt-3">
            {result.overallStrategy}
          </p>

          <div className="space-y-2">
            {result.recommendations.map((rec) => (
              <div
                key={rec.position}
                className="rounded-md border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {rec.position}
                    </span>
                    <span className="font-medium">{rec.recommendedType}</span>
                  </div>
                  <Badge className={`text-xs ${getConfidenceColor(rec.confidence)}`}>
                    {rec.confidence}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1.5 ml-8">
                  {rec.rationale}
                </p>
                {rec.evidence.keywordSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-8">
                    {rec.evidence.keywordSignals.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-normal">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
