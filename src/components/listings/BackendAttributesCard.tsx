'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Database } from 'lucide-react'

interface BackendAttributesCardProps {
  attributes: Record<string, string[]> | null
}

export function BackendAttributesCard({ attributes }: BackendAttributesCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (!attributes || Object.keys(attributes).length === 0) return null

  const entries = Object.entries(attributes)

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
          <Database className="h-4 w-4 text-purple-500" />
          <h3 className="font-medium">Backend Attributes</h3>
          <Badge variant="outline" className="text-xs">
            {entries.length} fields
          </Badge>
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Recommended values for Amazon Seller Central backend fields
          </p>
          {entries.map(([key, values]) => (
            <div key={key} className="space-y-1">
              <p className="text-sm font-medium capitalize">
                {key.replace(/_/g, ' ')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(values || []).map((val, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-normal">
                    {val}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
