'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { APLUS_TEMPLATE_LABELS } from '@/lib/constants'
import { Edit2, Trash2, CheckCircle2, Eye } from 'lucide-react'
import type { LbAPlusModule } from '@/types/database'

interface ModuleCardProps {
  module: LbAPlusModule
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: string) => void
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
}

export function ModuleCard({ module, onEdit, onDelete, onStatusChange }: ModuleCardProps) {
  const content = module.content as Record<string, unknown>
  const hasContent = Object.keys(content).length > 0

  const getPreview = (): string => {
    if (!hasContent) return 'No content generated yet'

    if (content.headline) return content.headline as string
    if (content.features && Array.isArray(content.features)) {
      return `${(content.features as unknown[]).length} features`
    }
    if (content.specs && Array.isArray(content.specs)) {
      return `${(content.specs as unknown[]).length} specifications`
    }
    if (content.scenarios && Array.isArray(content.scenarios)) {
      return `${(content.scenarios as unknown[]).length} scenarios`
    }
    if (content.columns && Array.isArray(content.columns)) {
      return `${(content.columns as unknown[]).length} columns`
    }
    return 'Content generated'
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {APLUS_TEMPLATE_LABELS[module.template_type] || module.template_type}
            </Badge>
            <Badge variant="outline" className={`text-xs ${statusColors[module.status]}`}>
              {module.status}
            </Badge>
          </div>
          <h3 className="font-medium text-sm">{module.title || 'Untitled Module'}</h3>
          <p className="text-xs text-muted-foreground">{getPreview()}</p>
        </div>

        <div className="flex items-center gap-1 ml-4">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          {module.status === 'draft' && hasContent && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-yellow-600" onClick={() => onStatusChange('review')}>
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {module.status === 'review' && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600" onClick={() => onStatusChange('approved')}>
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
