import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  review: { label: 'Review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  exported: { label: 'Exported', variant: 'default' },
  pending: { label: 'Pending', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  preview: { label: 'Preview', variant: 'outline' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  started: { label: 'Started', variant: 'warning' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusMap[status] || { label: status, variant: 'outline' as const }
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
