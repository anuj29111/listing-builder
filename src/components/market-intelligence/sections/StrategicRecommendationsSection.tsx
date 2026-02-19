'use client'

import { Sparkles } from 'lucide-react'

interface StrategicRecommendationsSectionProps {
  recommendations: {
    pricing: string[]
    product: string[]
    marketing: string[]
    operations: string[]
  }
}

export function StrategicRecommendationsSection({ recommendations }: StrategicRecommendationsSectionProps) {
  const panels = [
    { title: 'Pricing Strategy', items: recommendations.pricing, color: 'border-violet-200 bg-violet-50/50 dark:bg-violet-950/20' },
    { title: 'Product Strategy', items: recommendations.product, color: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20' },
    { title: 'Marketing Strategy', items: recommendations.marketing, color: 'border-green-200 bg-green-50/50 dark:bg-green-950/20' },
    { title: 'Operations Strategy', items: recommendations.operations, color: 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' },
  ]

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        Strategic Recommendations
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {panels.map((panel) => (
          <div key={panel.title} className={`rounded-lg border p-5 ${panel.color}`}>
            <h4 className="font-semibold text-sm mb-3">{panel.title}</h4>
            <ul className="space-y-2">
              {panel.items.map((item, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
