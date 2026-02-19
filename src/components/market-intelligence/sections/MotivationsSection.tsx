'use client'

import { Heart } from 'lucide-react'

interface MotivationsSectionProps {
  motivations: Array<{ title: string; description: string; frequencyDescription: string }>
}

export function MotivationsSection({ motivations }: MotivationsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Heart className="h-5 w-5 text-green-500" />
        Primary Customer Motivations
      </h3>
      <div className="space-y-3">
        {motivations.map((m, i) => (
          <div key={i} className="rounded-lg border-l-4 border-l-green-400 bg-green-50/50 dark:bg-green-950/20 p-4">
            <div className="flex items-start gap-2">
              <Heart className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-green-700 dark:text-green-400">{m.title}</h4>
                <p className="text-sm text-green-600/80 dark:text-green-300/80 mt-0.5">{m.description}</p>
                <p className="text-xs text-green-500 mt-1 font-medium">Frequency: {m.frequencyDescription}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
