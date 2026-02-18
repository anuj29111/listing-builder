'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import type { BulletPlanningMatrixEntry } from '@/types/database'

interface BulletPlanningMatrixProps {
  matrix: BulletPlanningMatrixEntry[]
}

export function BulletPlanningMatrix({ matrix }: BulletPlanningMatrixProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (!matrix || matrix.length === 0) return null

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <Target className="h-4 w-4 text-blue-500" />
          <h3 className="font-medium">Bullet Planning Matrix</h3>
          <Badge variant="outline" className="text-xs">
            {matrix.length} bullets planned
          </Badge>
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">#</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Primary Focus</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Keywords</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Q&A Gaps</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Review Themes</th>
                  <th className="py-2 font-medium text-muted-foreground">Rufus Qs</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((entry) => (
                  <tr key={entry.bulletNumber} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-muted-foreground">
                      {entry.bulletNumber}
                    </td>
                    <td className="py-2.5 pr-3 font-medium">
                      {entry.primaryFocus}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {(entry.priorityKeywords || []).slice(0, 4).map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {(entry.qnaGapsAddressed || []).slice(0, 2).map((gap, i) => (
                          <span key={i} className="text-xs text-muted-foreground">
                            {gap}{i < Math.min((entry.qnaGapsAddressed || []).length, 2) - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {(entry.reviewThemes || []).slice(0, 2).map((theme, i) => (
                          <span key={i} className="text-xs text-muted-foreground">
                            {theme}{i < Math.min((entry.reviewThemes || []).length, 2) - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(entry.rufusQuestionTypes || []).slice(0, 2).map((q, i) => (
                          <span key={i} className="text-xs text-muted-foreground">
                            {q}{i < Math.min((entry.rufusQuestionTypes || []).length, 2) - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
