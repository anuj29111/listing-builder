'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useListingStore } from '@/stores/listing-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  PlusCircle,
  RefreshCw,
  Copy,
  Eye,
  Trash2,
  Zap,
  Loader2,
  Search,
  AlertCircle,
  Star,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { ListingWithJoins } from '@/types/api'
import type { LbCountry } from '@/types/database'

type ListingMode = 'new' | 'optimize_existing' | 'based_on_existing'

const MODE_CARDS: {
  mode: ListingMode
  icon: typeof PlusCircle
  title: string
  description: string
}[] = [
  {
    mode: 'new',
    icon: PlusCircle,
    title: 'New Product',
    description:
      'Start from scratch. Best for brand new products that have never been listed on Amazon.',
  },
  {
    mode: 'optimize_existing',
    icon: RefreshCw,
    title: 'Optimize Existing',
    description:
      'Enter your ASIN — we scrape the current listing from Amazon and optimize it using your research.',
  },
  {
    mode: 'based_on_existing',
    icon: Copy,
    title: 'Based on Existing',
    description:
      'Launch a similar product. Pull content from an existing listing as a starting point and adapt it.',
  },
]

interface ListingsHistoryClientProps {
  listings: ListingWithJoins[]
  countries: LbCountry[]
}

export function ListingsHistoryClient({
  listings: initialListings,
  countries,
}: ListingsHistoryClientProps) {
  const router = useRouter()
  const [listings, setListings] = useState(initialListings)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Mode selection state
  const [selectedMode, setSelectedMode] = useState<ListingMode | null>(null)
  const [asinInput, setAsinInput] = useState('')
  const [selectedCountryId, setSelectedCountryId] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [scrapedPreview, setScrapedPreview] = useState<{
    title: string | null
    brand: string | null
    images: string[]
    rating: number | null
    reviews_count: number | null
    price: number | null
    currency: string | null
    bullet_count: number
    has_description: boolean
    asin: string
    bullet_points: string | null
    description: string | null
  } | null>(null)

  // Store actions
  const setOptimizationMode = useListingStore((s) => s.setOptimizationMode)
  const setModeSelected = useListingStore((s) => s.setModeSelected)
  const setScrapedData = useListingStore((s) => s.setScrapedData)
  const setScrapedAsin = useListingStore((s) => s.setScrapedAsin)
  const setScrapedCountryId = useListingStore((s) => s.setScrapedCountryId)
  const proceedFromScrape = useListingStore((s) => s.proceedFromScrape)
  const resetWizard = useListingStore((s) => s.resetWizard)

  const usCountry = countries.find((c) => c.code === 'US')

  const handleModeClick = (mode: ListingMode) => {
    if (mode === 'new') {
      // Go straight to wizard
      resetWizard()
      setOptimizationMode('new')
      setModeSelected(true)
      router.push('/listings/new')
      return
    }

    // Toggle — clicking same mode again deselects
    if (selectedMode === mode) {
      setSelectedMode(null)
      setScrapedPreview(null)
      setFetchError(null)
      setAsinInput('')
      return
    }

    setSelectedMode(mode)
    setScrapedPreview(null)
    setFetchError(null)
    if (!selectedCountryId && usCountry) {
      setSelectedCountryId(usCountry.id)
    }
  }

  const handleFetchAsin = async () => {
    const asin = asinInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      setFetchError('Invalid ASIN format. Must be 10 alphanumeric characters.')
      return
    }
    const countryId = selectedCountryId || usCountry?.id
    if (!countryId) {
      setFetchError('Please select a marketplace.')
      return
    }

    setIsFetching(true)
    setFetchError(null)

    try {
      const res = await fetch('/api/asin-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins: [asin], country_id: countryId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fetch failed')

      const result = json.results?.[0]
      if (!result?.success || !result.data) {
        throw new Error(result?.error || 'No data returned from Amazon')
      }

      const data = result.data
      const bulletText = data.bullet_points || ''
      const bulletCount = bulletText
        ? bulletText.split('\n').filter((b: string) => b.trim()).length
        : 0

      setScrapedPreview({
        title: data.title || null,
        brand: data.manufacturer || data.brand || null,
        images: data.images || [],
        rating: data.rating || null,
        reviews_count: data.reviews_count || null,
        price: data.price || data.price_buybox || null,
        currency: data.currency || null,
        bullet_count: bulletCount,
        has_description: !!(data.description && data.description.trim()),
        asin,
        bullet_points: data.bullet_points || null,
        description: data.description || null,
      })
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setIsFetching(false)
    }
  }

  const handleProceedWithScrape = () => {
    if (!scrapedPreview || !selectedMode) return

    resetWizard()
    setOptimizationMode(selectedMode)
    setScrapedData({
      title: scrapedPreview.title,
      bullet_points: scrapedPreview.bullet_points,
      description: scrapedPreview.description,
      brand: scrapedPreview.brand,
      images: scrapedPreview.images,
      rating: scrapedPreview.rating,
      reviews_count: scrapedPreview.reviews_count,
      price: scrapedPreview.price,
      currency: scrapedPreview.currency,
      asin: scrapedPreview.asin,
    })
    setScrapedAsin(scrapedPreview.asin)
    setScrapedCountryId(selectedCountryId || usCountry?.id || '')
    proceedFromScrape()
    router.push('/listings/new')
  }

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

  const needsAsinFetch =
    selectedMode === 'optimize_existing' || selectedMode === 'based_on_existing'

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage your Amazon listings
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/listings/speed')}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          Speed Mode
        </Button>
      </div>

      {/* Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {MODE_CARDS.map(({ mode, icon: Icon, title, description }) => (
          <button
            key={mode}
            onClick={() => handleModeClick(mode)}
            className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md ${
              selectedMode === mode
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border hover:border-primary/40'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`p-2 rounded-lg ${
                  selectedMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </button>
        ))}
      </div>

      {/* ASIN Fetch Panel */}
      {needsAsinFetch && (
        <div className="rounded-xl border p-5 space-y-4 bg-muted/20 mb-6">
          <div>
            <h3 className="font-semibold text-sm mb-0.5">
              {selectedMode === 'optimize_existing'
                ? 'Enter your product ASIN'
                : 'Enter the reference product ASIN'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedMode === 'optimize_existing'
                ? 'We\'ll scrape the current listing from Amazon automatically.'
                : 'Enter the ASIN of the similar product you want to base your new listing on.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="scrapeAsin" className="text-xs">
                ASIN
              </Label>
              <Input
                id="scrapeAsin"
                value={asinInput}
                onChange={(e) => setAsinInput(e.target.value.toUpperCase())}
                placeholder="B0XXXXXXXXX"
                maxLength={10}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFetchAsin()
                }}
              />
            </div>
            <div className="w-full sm:w-52 space-y-1">
              <Label htmlFor="scrapeCountry" className="text-xs">
                Marketplace
              </Label>
              <select
                id="scrapeCountry"
                value={selectedCountryId || usCountry?.id || ''}
                onChange={(e) => setSelectedCountryId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag_emoji} {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleFetchAsin}
                disabled={isFetching || !asinInput.trim()}
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Fetch
              </Button>
            </div>
          </div>

          {/* Error */}
          {fetchError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {fetchError}
            </div>
          )}

          {/* Scraped Preview */}
          {scrapedPreview && (
            <div className="rounded-lg border bg-background p-4 space-y-3">
              <div className="flex gap-4">
                {scrapedPreview.images.length > 0 && (
                  <div className="shrink-0 w-16 h-16 rounded-md border overflow-hidden bg-white">
                    <img
                      src={scrapedPreview.images[0]}
                      alt={scrapedPreview.title || 'Product'}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm line-clamp-2 mb-1">
                    {scrapedPreview.title || 'No title found'}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {scrapedPreview.brand && (
                      <span>by {scrapedPreview.brand}</span>
                    )}
                    {scrapedPreview.rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {scrapedPreview.rating}
                        {scrapedPreview.reviews_count != null && (
                          <span>
                            ({scrapedPreview.reviews_count.toLocaleString()})
                          </span>
                        )}
                      </span>
                    )}
                    {scrapedPreview.price != null && (
                      <span className="font-medium text-foreground">
                        {scrapedPreview.currency || '$'}
                        {scrapedPreview.price}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Badge
                  variant={scrapedPreview.title ? 'default' : 'secondary'}
                >
                  Title {scrapedPreview.title ? 'found' : 'missing'}
                </Badge>
                <Badge
                  variant={
                    scrapedPreview.bullet_count > 0 ? 'default' : 'secondary'
                  }
                >
                  {scrapedPreview.bullet_count > 0
                    ? `${scrapedPreview.bullet_count} bullets`
                    : 'No bullets'}
                </Badge>
                <Badge
                  variant={
                    scrapedPreview.has_description ? 'default' : 'secondary'
                  }
                >
                  Description{' '}
                  {scrapedPreview.has_description ? 'found' : 'missing'}
                </Badge>
              </div>

              <Button
                onClick={handleProceedWithScrape}
                className="w-full"
                size="lg"
              >
                Continue to Wizard
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      {listings.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Your Listings
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-lg border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium px-4 py-3">
                      Product
                    </th>
                    <th className="text-left font-medium px-4 py-3">
                      Country
                    </th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-left font-medium px-4 py-3">
                      Created
                    </th>
                    <th className="text-left font-medium px-4 py-3">
                      Created By
                    </th>
                    <th className="text-right font-medium px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => router.push(`/listings/${listing.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium truncate max-w-[250px]">
                            {listing.title ||
                              listing.product_type?.name ||
                              'Untitled Listing'}
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
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              router.push(`/listings/${listing.id}`)
                            }
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
        </>
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
