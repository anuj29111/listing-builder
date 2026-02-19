'use client'

import { Layers, AlertCircle } from 'lucide-react'

interface CompetitorPatternsSectionProps {
  patterns: {
    titlePatterns: Array<{ pattern: string; frequency: number; example: string }>
    bulletThemes: Array<{ theme: string; frequency: number; example: string }>
    pricingRange: { min: number; max: number; average: number; median: number; currency: string }
  }
  contentGaps?: Array<{ gap: string; importance: string; recommendation: string }>
}

export function CompetitorPatternsSection({ patterns, contentGaps }: CompetitorPatternsSectionProps) {
  const importanceColor = (imp: string) => {
    if (imp === 'CRITICAL') return 'text-red-600 bg-red-50'
    if (imp === 'HIGH') return 'text-orange-600 bg-orange-50'
    return 'text-yellow-600 bg-yellow-50'
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Layers className="h-5 w-5 text-teal-500" />
        Competitor Patterns & Content Gaps
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Title Patterns */}
        {patterns.titlePatterns?.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold mb-3">Title Structure Patterns</h4>
            <div className="space-y-2">
              {patterns.titlePatterns.map((tp, i) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{tp.pattern}</span>
                    <span className="text-xs text-muted-foreground">{tp.frequency} competitors</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">e.g. &ldquo;{tp.example}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bullet Themes */}
        {patterns.bulletThemes?.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold mb-3">Common Bullet Themes</h4>
            <div className="space-y-2">
              {patterns.bulletThemes.map((bt, i) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{bt.theme}</span>
                    <span className="text-xs text-muted-foreground">{bt.frequency} competitors</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">e.g. &ldquo;{bt.example}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pricing Range */}
      <div className="rounded-lg border bg-card p-4">
        <h4 className="text-sm font-semibold mb-3">Pricing Landscape</h4>
        <div className="flex items-center gap-8 text-sm">
          <div><span className="text-muted-foreground">Min:</span> <strong>{patterns.pricingRange.currency}{patterns.pricingRange.min.toFixed(2)}</strong></div>
          <div><span className="text-muted-foreground">Avg:</span> <strong>{patterns.pricingRange.currency}{patterns.pricingRange.average.toFixed(2)}</strong></div>
          <div><span className="text-muted-foreground">Median:</span> <strong>{patterns.pricingRange.currency}{patterns.pricingRange.median.toFixed(2)}</strong></div>
          <div><span className="text-muted-foreground">Max:</span> <strong>{patterns.pricingRange.currency}{patterns.pricingRange.max.toFixed(2)}</strong></div>
        </div>
      </div>

      {/* Content Gaps */}
      {contentGaps && contentGaps.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Content Gaps Competitors Are Missing
          </h4>
          <div className="space-y-2">
            {contentGaps.map((gap, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 flex items-start gap-3">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${importanceColor(gap.importance)}`}>
                  {gap.importance}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{gap.gap}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{gap.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
