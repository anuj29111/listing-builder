'use client'

import { ShoppingCart } from 'lucide-react'

interface BuyingFactorsSectionProps {
  factors: Array<{ rank: number; title: string; description: string }>
}

export function BuyingFactorsSection({ factors }: BuyingFactorsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-blue-500" />
        Critical Buying Decision Factors
      </h3>
      <div className="space-y-3">
        {factors.map((f) => (
          <div key={f.rank} className="rounded-lg border-l-4 border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20 p-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300">
                {f.rank}
              </span>
              <div>
                <h4 className="font-semibold text-blue-700 dark:text-blue-400">{f.title}</h4>
                <p className="text-sm text-blue-600/80 dark:text-blue-300/80 mt-0.5">{f.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
