'use client'

import { ImageIcon } from 'lucide-react'

interface ImageRecommendationsSectionProps {
  recommendations: string[]
}

export function ImageRecommendationsSection({ recommendations }: ImageRecommendationsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-violet-500" />
        Image Recommendations
      </h3>
      <div className="rounded-lg border bg-card p-5">
        <ul className="space-y-3">
          {recommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="h-2 w-2 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
              {rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
