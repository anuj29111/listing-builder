'use client'

import { Users, Check } from 'lucide-react'

interface CustomerSegmentsSectionProps {
  segments: Array<{ name: string; ageRange: string; occupation: string; traits: string[] }>
}

export function CustomerSegmentsSection({ segments }: CustomerSegmentsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Users className="h-5 w-5 text-purple-500" />
        Secondary Customer Segments
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {segments.map((seg, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">{seg.name}</h4>
                <p className="text-xs text-muted-foreground">Age {seg.ageRange}, {seg.occupation}</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {seg.traits.map((trait, j) => (
                <li key={j} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  {trait}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
