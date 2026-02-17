'use client'

import { useState, useEffect, useCallback } from 'react'
import { MainImageSection } from '@/components/listings/images/MainImageSection'
import { SecondaryImageSection } from '@/components/listings/images/SecondaryImageSection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImageIcon, ArrowRight, X } from 'lucide-react'
import type { LbCategory, LbCountry, LbImageWorkshop, LbImageGeneration } from '@/types/database'

interface ListingOption {
  id: string
  title: string | null
  generation_context: Record<string, unknown>
  country_id: string
  product_type: { name: string; asin: string | null; category_id: string } | null
}

interface ImageBuilderClientProps {
  listings: ListingOption[]
  categories: LbCategory[]
  countries: LbCountry[]
}

type Tab = 'main' | 'secondary'
type ContextMode = 'listing' | 'research' | null

interface ResolvedContext {
  listingId: string | null
  categoryId: string
  countryId: string
  productName: string
  brand: string
}

export function ImageBuilderClient({
  listings,
  categories,
  countries,
}: ImageBuilderClientProps) {
  // Context picker state
  const [contextMode, setContextMode] = useState<ContextMode>(null)
  const [selectedListingId, setSelectedListingId] = useState<string>('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedCountryId, setSelectedCountryId] = useState<string>('')
  const [productName, setProductName] = useState('')
  const [brandName, setBrandName] = useState('')

  // Resolved context (locked in after selection)
  const [resolvedContext, setResolvedContext] = useState<ResolvedContext | null>(null)

  // Tab + data
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [workshops, setWorkshops] = useState<LbImageWorkshop[]>([])
  const [images, setImages] = useState<LbImageGeneration[]>([])
  const [isLoadingWorkshops, setIsLoadingWorkshops] = useState(false)

  // Fetch workshops for the resolved context
  const fetchWorkshops = useCallback(async (ctx: ResolvedContext) => {
    setIsLoadingWorkshops(true)
    try {
      const params = new URLSearchParams()
      if (ctx.listingId) params.set('listing_id', ctx.listingId)
      else {
        params.set('category_id', ctx.categoryId)
        params.set('country_id', ctx.countryId)
      }

      const res = await fetch(`/api/images/workshop?${params.toString()}`)
      const json = await res.json()
      if (res.ok && json.data) {
        const ws = json.data.workshops || []
        const imgs = json.data.images || []
        setWorkshops(ws)
        setImages(imgs)
      }
    } catch {
      // If API doesn't support GET yet, start fresh
      setWorkshops([])
      setImages([])
    } finally {
      setIsLoadingWorkshops(false)
    }
  }, [])

  // When context is resolved, fetch existing workshops
  useEffect(() => {
    if (resolvedContext) {
      fetchWorkshops(resolvedContext)
    }
  }, [resolvedContext, fetchWorkshops])

  // --- Context picker handlers ---

  const handleSelectListing = (listingId: string) => {
    setSelectedListingId(listingId)
    const listing = listings.find((l) => l.id === listingId)
    if (listing) {
      const ctx: ResolvedContext = {
        listingId: listing.id,
        categoryId: listing.product_type?.category_id || '',
        countryId: listing.country_id,
        productName: listing.product_type?.name ||
          (listing.generation_context?.productName as string) || 'Product',
        brand: (listing.generation_context?.brand as string) || '',
      }
      // Auto-fill brand from category if not in generation_context
      if (!ctx.brand && listing.product_type?.category_id) {
        const cat = categories.find((c) => c.id === listing.product_type?.category_id)
        if (cat) ctx.brand = cat.brand || ''
      }
      setResolvedContext(ctx)
    }
  }

  const handleResearchGo = () => {
    if (!selectedCategoryId || !selectedCountryId || !productName.trim()) return
    const cat = categories.find((c) => c.id === selectedCategoryId)
    setResolvedContext({
      listingId: null,
      categoryId: selectedCategoryId,
      countryId: selectedCountryId,
      productName: productName.trim(),
      brand: brandName.trim() || cat?.brand || '',
    })
  }

  const handleChangeContext = () => {
    setResolvedContext(null)
    setWorkshops([])
    setImages([])
    setSelectedListingId('')
    setContextMode(null)
  }

  const getListingLabel = (l: ListingOption) => {
    const name = l.product_type?.name || (l.generation_context?.productName as string) || 'Untitled'
    const asin = l.product_type?.asin
    return asin ? `${name} (${asin})` : name
  }

  // --- Render ---

  // Context not yet resolved — show picker
  if (!resolvedContext) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Image Builder</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Generate main and secondary product images powered by AI and your research data.
          </p>
        </div>

        {/* Mode selection */}
        {!contextMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setContextMode('listing')}
              className="p-6 border rounded-lg hover:border-primary hover:bg-muted/30 transition-colors text-left"
            >
              <h3 className="font-semibold mb-1">From a Listing</h3>
              <p className="text-sm text-muted-foreground">
                Select an existing listing. Product info, research, and context are auto-filled.
              </p>
            </button>
            <button
              onClick={() => setContextMode('research')}
              className="p-6 border rounded-lg hover:border-primary hover:bg-muted/30 transition-colors text-left"
            >
              <h3 className="font-semibold mb-1">From Research</h3>
              <p className="text-sm text-muted-foreground">
                Pick a category and country. AI uses your research data to generate image concepts.
              </p>
            </button>
          </div>
        )}

        {/* Listing picker */}
        {contextMode === 'listing' && (
          <div className="space-y-4 border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Select a Listing</h3>
              <Button variant="ghost" size="sm" onClick={() => setContextMode(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Select value={selectedListingId} onValueChange={handleSelectListing}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a listing..." />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {getListingLabel(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {listings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No listings found. Create a listing first.
              </p>
            )}
          </div>
        )}

        {/* Research picker */}
        {contextMode === 'research' && (
          <div className="space-y-4 border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Select Research Context</h3>
              <Button variant="ghost" size="sm" onClick={() => setContextMode(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.brand})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Select value={selectedCountryId} onValueChange={setSelectedCountryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country..." />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.flag_emoji} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Product Name</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Acrylic Paint Markers"
                />
              </div>
              <div>
                <Label className="text-xs">Brand (optional)</Label>
                <Input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Auto-filled from category"
                />
              </div>
            </div>
            <Button
              onClick={handleResearchGo}
              disabled={!selectedCategoryId || !selectedCountryId || !productName.trim()}
              className="w-full gap-2"
            >
              <ArrowRight className="h-4 w-4" />
              Start Image Builder
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Context is resolved — show tabs + image sections
  const selectedListing = selectedListingId
    ? listings.find((l) => l.id === selectedListingId)
    : null
  const selectedCategory = categories.find((c) => c.id === resolvedContext.categoryId)
  const selectedCountry = countries.find((c) => c.id === resolvedContext.countryId)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'main', label: 'Main Image' },
    { key: 'secondary', label: 'Secondary Images' },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Image Builder</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="font-medium">
              {resolvedContext.productName}
            </Badge>
            {resolvedContext.brand && (
              <Badge variant="outline">{resolvedContext.brand}</Badge>
            )}
            {selectedCategory && (
              <Badge variant="outline">{selectedCategory.name}</Badge>
            )}
            {selectedCountry && (
              <Badge variant="outline">
                {selectedCountry.flag_emoji} {selectedCountry.name}
              </Badge>
            )}
            {selectedListing?.product_type?.asin && (
              <Badge variant="outline" className="font-mono text-xs">
                {selectedListing.product_type.asin}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleChangeContext}>
          Change Context
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoadingWorkshops ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-muted-foreground">Loading workshops...</p>
        </div>
      ) : (
        <>
          {activeTab === 'main' && (
            <MainImageSection
              listingId={resolvedContext.listingId}
              categoryId={resolvedContext.categoryId}
              countryId={resolvedContext.countryId}
              productName={resolvedContext.productName}
              brand={resolvedContext.brand}
              workshops={workshops}
              images={images}
            />
          )}

          {activeTab === 'secondary' && (
            <SecondaryImageSection
              listingId={resolvedContext.listingId}
              categoryId={resolvedContext.categoryId}
              countryId={resolvedContext.countryId}
              productName={resolvedContext.productName}
              brand={resolvedContext.brand}
              workshops={workshops}
              images={images}
            />
          )}
        </>
      )}
    </div>
  )
}
