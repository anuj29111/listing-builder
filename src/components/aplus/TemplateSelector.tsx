'use client'

import { Button } from '@/components/ui/button'
import { APLUS_TEMPLATE_TYPES, APLUS_TEMPLATE_LABELS, APLUS_TEMPLATE_DESCRIPTIONS } from '@/lib/constants'
import { LayoutTemplate, BarChart3, Grid3X3, ListChecks, Users, BookOpen } from 'lucide-react'

interface TemplateSelectorProps {
  onSelect: (templateType: string) => void
}

const templateIcons: Record<string, typeof LayoutTemplate> = {
  hero_banner: LayoutTemplate,
  comparison_chart: BarChart3,
  feature_grid: Grid3X3,
  technical_specs: ListChecks,
  usage_scenarios: Users,
  brand_story: BookOpen,
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2">
      {APLUS_TEMPLATE_TYPES.map((type) => {
        const Icon = templateIcons[type] || LayoutTemplate
        return (
          <Button
            key={type}
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:bg-accent"
            onClick={() => onSelect(type)}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <span className="font-medium text-sm">{APLUS_TEMPLATE_LABELS[type]}</span>
            </div>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              {APLUS_TEMPLATE_DESCRIPTIONS[type]}
            </p>
          </Button>
        )
      })}
    </div>
  )
}
