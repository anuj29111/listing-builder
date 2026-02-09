'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Plus, Eye, Trash2, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { ListingWithJoins } from '@/types/api'

interface ListingsHistoryClientProps {
  listings: ListingWithJoins[]
}

export function ListingsHistoryClient({ listings: initialListings }: ListingsHistoryClientProps) {
  const router = useRouter()
  const [listings, setListings] = useState(initialListings)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/listings/${deleteId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Delete failed')

      setListings((prev) => prev.filter((l) => l.id !== deleteId))
      toast.success('Listing deleted')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      toast.error(message)
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage your generated Amazon listings
          </p>
        </div>
        <Button onClick={() => router.push('/listings/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Listing
        </Button>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No listings yet"
          description="Create your first listing using the AI-powered wizard"
          action={{
            label: 'Create New Listing',
            onClick: () => router.push('/listings/new'),
          }}
        />
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-3">Product</th>
                  <th className="text-left font-medium px-4 py-3">Country</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Created</th>
                  <th className="text-left font-medium px-4 py-3">Created By</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium truncate max-w-[250px]">
                          {listing.title || listing.product_type?.name || 'Untitled Listing'}
                        </p>
                        {listing.product_type?.asin && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {listing.product_type.asin}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {listing.country ? (
                        <Badge variant="outline" className="gap-1">
                          {listing.country.flag_emoji} {listing.country.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={listing.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(listing.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {listing.creator?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/listings/new?edit=${listing.id}`)}
                          title="View / Edit"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(listing.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Listing"
        description="Are you sure you want to delete this listing? This action cannot be undone."
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
