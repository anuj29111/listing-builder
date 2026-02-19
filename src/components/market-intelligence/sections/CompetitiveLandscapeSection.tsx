'use client'

import { Shield, Star } from 'lucide-react'

interface CompetitiveLandscapeSectionProps {
  landscape: Array<{
    brand: string
    avgRating: number
    reviewCount: number
    category: string
    keyFeatures: string[]
    marketShare: string
  }>
}

export function CompetitiveLandscapeSection({ landscape }: CompetitiveLandscapeSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5 text-slate-500" />
        Competitive Landscape Analysis
      </h3>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-semibold">Brand</th>
              <th className="text-left p-3 font-semibold">Avg Rating</th>
              <th className="text-right p-3 font-semibold">Review Count</th>
              <th className="text-left p-3 font-semibold">Category</th>
              <th className="text-left p-3 font-semibold">Key Features</th>
              <th className="text-right p-3 font-semibold">Market Share</th>
            </tr>
          </thead>
          <tbody>
            {landscape.map((comp, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                <td className="p-3 font-medium">{comp.brand}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    {comp.avgRating.toFixed(1)}
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  </div>
                </td>
                <td className="p-3 text-right">{comp.reviewCount.toLocaleString()}</td>
                <td className="p-3 text-muted-foreground">{comp.category}</td>
                <td className="p-3">
                  <ul className="list-disc list-inside text-xs text-muted-foreground">
                    {comp.keyFeatures.slice(0, 3).map((f, j) => (
                      <li key={j}>{f}</li>
                    ))}
                  </ul>
                </td>
                <td className="p-3 text-right font-medium">{comp.marketShare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
