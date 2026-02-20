'use client'

import { useState } from 'react'
import { useListingStore } from '@/stores/listing-store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PlusCircle, RefreshCw, Copy, Loader2, Star, Search, AlertCircle } from 'lucide-react'
import type { LbCountry } from '@/types/database'

interface ListingModeSelectorProps {
  countries: LbCountry[]
}

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
      'Start from scratch. Best for brand new products that have never been listed on Amazon before. AI generates fully optimized content using your research data.',
  },
  {
    mode: 'optimize_existing',
    icon: RefreshCw,
    title: 'Optimize Existing',
    description:
      'Improve a live listing. Enter your ASIN and we\'ll scrape the current title, bullets, and description from Amazon, then optimize everything using your research.',
  },
  {
    mode: 'based_on_existing',
    icon: Copy,
    title: 'Based on Existing',
    description:
      'Launch a similar product. Pull content from an existing listing (e.g., your 10-pack) as a starting point for a new variant (e.g., 12-pack). AI adapts and improves it.',
  },
]

export function ListingModeSelector({ countries }: ListingModeSelectorProps) {
  const setOptimizationMode = useListingStore((s) => s.setOptimizationMode)
  const setModeSelected = useListingStore((s) => s.setModeSelected)
  const setScrapedData = useListingStore((s) => s.setScrapedData)
  const setScrapedAsin = useListingStore((s) => s.setScrapedAsin)
  const setScrapedCountryId = useListingStore((s) => s.setScrapedCountryId)
  const proceedFromScrape = useListingStore((s) => s.proceedFromScrape)
  const scrapedData = useListingStore((s) => s.scrapedData)
  const isFetchingAsin = useListingStore((s) => s.isFetchingAsin)
  const setFetchingAsin = useListingStore((s) => s.setFetchingAsin)
  const fetchAsinError = useListingStore((s) => s.fetchAsinError)
  const setFetchAsinError = useListingStore((s) => s.setFetchAsinError)

  const [selectedMode, setSelectedMode] = useState<ListingMode | null>(null)
  const [asinInput, setAsinInput] = useState('')
  const [selectedCountryId, setSelectedCountryId] = useState('')

  // Find default US country
  const usCountry = countries.find((c) => c.code === 'US')

  const handleModeClick = (mode: ListingMode) => {
    if (mode === 'new') {
      setOptimizationMode('new')
      setModeSelected(true)
      return
    }
    setSelectedMode(mode)
    setOptimizationMode(mode)
    // Reset any previous scrape data
    setScrapedData(null)
    setScrapedAsin(null)
    setFetchAsinError(null)
    if (!selectedCountryId && usCountry) {
      setSelectedCountryId(usCountry.id)
    }
  }

  const handleFetchAsin = async () => {
    const asin = asinInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      setFetchAsinError('Invalid ASIN format. Must be 10 alphanumeric characters (e.g., B0XXXXXXXXX).')
      return
    }

    const countryId = selectedCountryId || usCountry?.id
    if (!countryId) {
      setFetchAsinError('Please select a marketplace.')
      return
    }

    setFetchingAsin(true)

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
      setScrapedData({
        title: data.title || null,
        bullet_points: data.bullet_points || null,
        description: data.description || null,
        brand: data.manufacturer || data.brand || null,
        images: data.images || [],
        rating: data.rating || null,
        reviews_count: data.reviews_count || null,
        price: data.price || data.price_buybox || null,
        currency: data.currency || null,
        asin,
      })
      setScrapedAsin(asin)
      setScrapedCountryId(countryId)
      setFetchingAsin(false)
    } catch (err) {
      setFetchAsinError(err instanceof Error ? err.message : 'Failed to fetch ASIN data')
    }
  }

  const handleProceed = () => {
    proceedFromScrape()
  }

  const needsAsinFetch = selectedMode === 'optimize_existing' || selectedMode === 'based_on_existing'

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create New Listing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how you&apos;d like to start building your Amazon listing
        </p>
      </div>

      {/* Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {MODE_CARDS.map(({ mode, icon: Icon, title, description }) => (
          <button
            key={mode}
            onClick={() => handleModeClick(mode)}
            className={`text-left p-6 rounded-xl border-2 transition-all hover:shadow-md ${
              selectedMode === mode
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border hover:border-primary/40'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`p-2 rounded-lg ${
                  selectedMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-base">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </button>
        ))}
      </div>

      {/* ASIN Fetch Panel (for Optimize / Based On modes) */}
      {needsAsinFetch && (
        <div className="rounded-xl border p-6 space-y-5 bg-muted/20">
          <div>
            <h3 className="font-semibold text-base mb-1">
              {selectedMode === 'optimize_existing'
                ? 'Enter your product ASIN'
                : 'Enter the reference product ASIN'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedMode === 'optimize_existing'
                ? 'We\'ll scrape the current listing content from Amazon so you don\'t have to copy-paste anything.'
                : 'Enter the ASIN of the similar product you want to base your new listing on.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="scrapeAsin">ASIN</Label>
              <Input
                id="scrapeAsin"
                value={asinInput}
                onChange={(e) => setAsinInput(e.target.value.toUpperCase())}
                placeholder="B0XXXXXXXXX"
                maxLength={10}
              />
            </div>
            <div className="w-full sm:w-56 space-y-1.5">
              <Label htmlFor="scrapeCountry">Marketplace</Label>
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
                disabled={isFetchingAsin || !asinInput.trim()}
              >
                {isFetchingAsin ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Fetch
              </Button>
            </div>
          </div>

          {/* Error */}
          {fetchAsinError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {fetchAsinError}
            </div>
          )}

          {/* Scraped Data Preview */}
          {scrapedData && (
            <div className="rounded-lg border bg-background p-4 space-y-4">
              <div className="flex gap-4">
                {/* Product Image */}
                {scrapedData.images.length > 0 && (
                  <div className="shrink-0 w-20 h-20 rounded-md border overflow-hidden bg-white">
                    <img
                      src={scrapedData.images[0]}
                      alt={scrapedData.title || 'Product'}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm line-clamp-2 mb-1">
                    {scrapedData.title || 'No title found'}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {scrapedData.brand && (
                      <span>by {scrapedData.brand}</span>
                    )}
                    {scrapedData.rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {scrapedData.rating}
                        {scrapedData.reviews_count && (
                          <span>({scrapedData.reviews_count.toLocaleString()} reviews)</span>
                        )}
                      </span>
                    )}
                    {scrapedData.price && (
                      <span className="font-medium text-foreground">
                        {scrapedData.currency || '$'}{scrapedData.price}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Content Summary */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant={scrapedData.title ? 'default' : 'secondary'}>
                  Title {scrapedData.title ? 'found' : 'missing'}
                </Badge>
                <Badge variant={scrapedData.bullet_points ? 'default' : 'secondary'}>
                  {scrapedData.bullet_points
                    ? `${scrapedData.bullet_points.split('\n').filter((b) => b.trim()).length} bullets`
                    : 'No bullets'}
                </Badge>
                <Badge variant={scrapedData.description ? 'default' : 'secondary'}>
                  Description {scrapedData.description ? 'found' : 'missing'}
                </Badge>
              </div>

              {/* Proceed Button */}
              <Button onClick={handleProceed} className="w-full" size="lg">
                Continue to Wizard
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
