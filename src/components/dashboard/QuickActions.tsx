'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, Upload, Zap } from 'lucide-react'

const actions = [
  {
    label: 'New Listing',
    description: 'Generate a single listing',
    icon: Plus,
    href: '/listings/new',
    disabled: true,
  },
  {
    label: 'Upload Research',
    description: 'Upload CSV research files',
    icon: Upload,
    href: '/research',
    disabled: true,
  },
  {
    label: 'Speed Mode',
    description: 'Batch generate listings',
    icon: Zap,
    href: '/listings/speed',
    disabled: true,
  },
]

export function QuickActions() {
  const router = useRouter()

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Quick Actions</h3>
      </div>
      <div className="p-4 space-y-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="w-full justify-start h-auto py-3 px-4"
            disabled={action.disabled}
            onClick={() => router.push(action.href)}
          >
            <action.icon className="h-4 w-4 mr-3 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-medium">{action.label}</div>
              <div className="text-xs text-muted-foreground">
                {action.description}
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  )
}
