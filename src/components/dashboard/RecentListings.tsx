import { FileText } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'

interface RecentListingsProps {
  listings: Array<{
    id: string
    title: string | null
    status: string
    created_at: string
    country_id: string
  }>
}

export function RecentListings({ listings }: RecentListingsProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Recent Listings</h3>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No listings yet"
          description="Generated listings will appear here."
          className="py-8"
        />
      ) : (
        <div className="divide-y">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="flex items-center justify-between p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {listing.title || 'Untitled listing'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(listing.created_at)}
                </p>
              </div>
              <StatusBadge status={listing.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
