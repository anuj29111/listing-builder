'use client'

import { AlertTriangle } from 'lucide-react'

interface PainPointsSectionProps {
  painPoints: Array<{ title: string; description: string; impactPercentage: number }>
}

export function PainPointsSection({ painPoints }: PainPointsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        Top Customer Pain Points
      </h3>
      <div className="space-y-3">
        {painPoints.map((pp, i) => (
          <div key={i} className="rounded-lg border-l-4 border-l-red-400 bg-red-50/50 dark:bg-red-950/20 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-red-700 dark:text-red-400">{pp.title}</h4>
                <p className="text-sm text-red-600/80 dark:text-red-300/80 mt-0.5">{pp.description}</p>
                <p className="text-xs text-red-500 mt-1 font-medium">Impact: ~{pp.impactPercentage}% of reviews</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
