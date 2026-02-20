'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { MainImageSection } from '@/components/listings/images/MainImageSection'
import { SecondaryImageSection } from '@/components/listings/images/SecondaryImageSection'
import { VideoThumbnailSection } from '@/components/listings/images/VideoThumbnailSection'
import { SwatchImageSection } from '@/components/listings/images/SwatchImageSection'
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
import { HfQueuePanel } from '@/components/images/HfQueuePanel'
import { ImageIcon, ArrowRight, Clock, Palette, Video, Image, Plus } from 'lucide-react'
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

type Tab = 'main' | 'secondary' | 'video_thumbnail' | 'swatch' | 'hf_queue'

interface ResolvedContext {
  listingId: string | null
  categoryId: string
  countryId: string
  productName: string
  brand: string
}

interface DraftWorkshop {
  id: string
  name: string
  product_name: string
  brand: string
  image_type: string
  category_id: string | null
  country_id: string | null
  listing_id: string | null
  step: number
  created_at: string
  updated_at: string
}

interface DraftGroup {
  key: string
  listingId: string | null
  productName: string
  brand: string
  categoryId: string | null
  countryId: string | null
  imageTypes: string[]
  updatedAt: string
  drafts: DraftWorkshop[]
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  main: 'Main',
  secondary: 'Secondary',
  video_thumbnail: 'Thumbnail',
  swatch: 'Swatch',
}

const IMAGE_TYPE_ICONS: Record<string, typeof ImageIcon> = {
  main: Image,
  secondary: ImageIcon,
  video_thumbnail: Video,
  swatch: Palette,
}

const IMAGE_TYPE_ORDER = ['main', 'secondary', 'video_thumbnail', 'swatch']

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Group flat draft list by product context */
function groupDrafts(drafts: DraftWorkshop[]): DraftGroup[] {
  const map = new Map<string, DraftGroup>()

  for (const draft of drafts) {
    // Group key: listing_id if present, otherwise product+category+country
    const key = draft.listing_id
      || `${draft.product_name}::${draft.category_id}::${draft.country_id}`

    const existing = map.get(key)
    if (existing) {
      if (!existing.imageTypes.includes(draft.image_type)) {
        existing.imageTypes.push(draft.image_type)
      }
      existing.drafts.push(draft)
      // Track most recent update
      if (draft.updated_at > existing.updatedAt) {
        existing.updatedAt = draft.updated_at
      }
    } else {
      map.set(key, {
        key,
        listingId: draft.listing_id,
        productName: draft.product_name,
        brand: draft.brand,
        categoryId: draft.category_id,
        countryId: draft.country_id,
        imageTypes: [draft.image_type],
        updatedAt: draft.updated_at,
        drafts: [draft],
      })
    }
  }

  // Sort groups by most recent update, sort image types by standard order
  const groups = Array.from(map.values())
  groups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const g of groups) {
    g.imageTypes.sort((a, b) => IMAGE_TYPE_ORDER.indexOf(a) - IMAGE_TYPE_ORDER.indexOf(b))
  }
  return groups
}

export function ImageBuilderClient({
  listings,
  categories,
  countries,
}: ImageBuilderClientProps) {
  // Form state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedCountryId, setSelectedCountryId] = useState<string>('')
  const [productName, setProductName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [selectedListingId, setSelectedListingId] = useState<string>('')
  const [showNewForm, setShowNewForm] = useState(false)

  // Resolved context (locked in after selection)
  const [resolvedContext, setResolvedContext] = useState<ResolvedContext | null>(null)

  // Tab + data
  const [activeTab, setActiveTab] = useState<Tab>('main')
  const [workshops, setWorkshops] = useState<LbImageWorkshop[]>([])
  const [images, setImages] = useState<LbImageGeneration[]>([])
  const [isLoadingWorkshops, setIsLoadingWorkshops] = useState(false)

  // Drafts
  const [drafts, setDrafts] = useState<DraftWorkshop[]>([])
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true)

  // Grouped drafts
  const draftGroups = useMemo(() => groupDrafts(drafts), [drafts])

  // Fetch drafts on mount
  useEffect(() => {
    async function fetchDrafts() {
      try {
        const res = await fetch('/api/images/workshop')
        const json = await res.json()
        if (res.ok && json.data) {
          setDrafts(Array.isArray(json.data) ? json.data : [])
        }
      } catch {
        setDrafts([])
      } finally {
        setIsLoadingDrafts(false)
      }
    }
    fetchDrafts()
  }, [])

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

  // --- Handlers ---

  const handleCategorySelect = (catId: string) => {
    setSelectedCategoryId(catId)
    const cat = categories.find((c) => c.id === catId)
    if (cat?.brand && !brandName) setBrandName(cat.brand || '')
    // Clear listing if category changed
    setSelectedListingId('')
  }

  const handleListingAttach = (listingId: string) => {
    setSelectedListingId(listingId)
    const listing = listings.find((l) => l.id === listingId)
    if (listing) {
      // Auto-fill fields from listing
      const name = listing.product_type?.name ||
        (listing.generation_context?.productName as string) || ''
      const catId = listing.product_type?.category_id || ''
      const brand = (listing.generation_context?.brand as string) || ''

      if (name) setProductName(name)
      if (catId) {
        setSelectedCategoryId(catId)
        if (!brand) {
          const cat = categories.find((c) => c.id === catId)
          if (cat?.brand) setBrandName(cat.brand)
        }
      }
      if (brand) setBrandName(brand)
      if (listing.country_id) setSelectedCountryId(listing.country_id)
    }
  }

  const handleStartBuilder = () => {
    if (!selectedCategoryId || !selectedCountryId || !productName.trim()) return

    const cat = categories.find((c) => c.id === selectedCategoryId)
    const listing = selectedListingId
      ? listings.find((l) => l.id === selectedListingId)
      : null

    setResolvedContext({
      listingId: listing?.id || null,
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
    setSelectedCategoryId('')
    setSelectedCountryId('')
    setProductName('')
    setBrandName('')
    setShowNewForm(false)
  }

  // Resume a draft group — open the most recently updated tab
  const handleResumeGroup = (group: DraftGroup) => {
    // Find the most recently updated draft to determine which tab to open
    const mostRecent = group.drafts.reduce((a, b) =>
      a.updated_at > b.updated_at ? a : b
    )

    setResolvedContext({
      listingId: group.listingId,
      categoryId: group.categoryId || '',
      countryId: group.countryId || '',
      productName: group.productName,
      brand: group.brand,
    })

    const tabKey = mostRecent.image_type as Tab
    setActiveTab(tabKey === 'hf_queue' ? 'main' : tabKey)
  }

  const getListingLabel = (l: ListingOption) => {
    const name = l.product_type?.name || (l.generation_context?.productName as string) || 'Untitled'
    const asin = l.product_type?.asin
    return asin ? `${name} (${asin})` : name
  }

  // Filter listings by selected category for the optional attachment dropdown
  const filteredListings = selectedCategoryId
    ? listings.filter((l) => l.product_type?.category_id === selectedCategoryId)
    : listings

  const canStart = !!selectedCategoryId && !!selectedCountryId && !!productName.trim()

  // --- Render ---

  // Context not yet resolved — show picker + drafts
  if (!resolvedContext) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Image Builder</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Generate main, secondary, video thumbnail, and swatch product images powered by AI and your research data.
          </p>
        </div>

        {/* Grouped Drafts Section */}
        {!showNewForm && draftGroups.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Your Products
            </h2>
            <div className="space-y-2">
              {draftGroups.map((group) => {
                const country = countries.find((c) => c.id === group.countryId)
                const category = categories.find((c) => c.id === group.categoryId)
                const listing = group.listingId
                  ? listings.find((l) => l.id === group.listingId)
                  : null

                return (
                  <button
                    key={group.key}
                    onClick={() => handleResumeGroup(group)}
                    className="w-full flex items-center gap-4 p-4 border rounded-lg hover:border-primary hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {group.brand} {group.productName}
                        </span>
                        {listing?.product_type?.asin && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {listing.product_type.asin}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        {country && (
                          <span>{country.flag_emoji} {country.name}</span>
                        )}
                        {category && (
                          <>
                            <span>·</span>
                            <span>{category.name}</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(group.updatedAt)}
                        </span>
                      </div>
                      {/* Image type badges */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {group.imageTypes.map((type) => {
                          const Icon = IMAGE_TYPE_ICONS[type] || ImageIcon
                          return (
                            <Badge
                              key={type}
                              variant="secondary"
                              className="text-[10px] h-5 gap-1"
                            >
                              <Icon className="h-3 w-3" />
                              {IMAGE_TYPE_LABELS[type] || type}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isLoadingDrafts && (
          <div className="flex items-center justify-center py-6 mb-8">
            <p className="text-sm text-muted-foreground">Loading drafts...</p>
          </div>
        )}

        {/* Start New button / Divider */}
        {!showNewForm && draftGroups.length > 0 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowNewForm(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Start New Product
            </Button>
          </div>
        )}

        {/* New Product Form — shown when no drafts or user clicks "Start New" */}
        {(showNewForm || (!isLoadingDrafts && draftGroups.length === 0)) && (
          <div className="space-y-4 border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">New Image Builder</h3>
              {draftGroups.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>
                  Back to drafts
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={selectedCategoryId} onValueChange={handleCategorySelect}>
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
                <Label className="text-xs">Marketplace *</Label>
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
                <Label className="text-xs">Product Name *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Acrylic Paint Markers 20-Pack"
                />
              </div>
              <div>
                <Label className="text-xs">Brand</Label>
                <Input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Auto-filled from category"
                />
              </div>
            </div>

            {/* Optional listing attachment */}
            <div>
              <Label className="text-xs">
                Attach a Listing{' '}
                <span className="text-muted-foreground font-normal">(optional — adds title & bullets as AI context)</span>
              </Label>
              <Select value={selectedListingId} onValueChange={handleListingAttach}>
                <SelectTrigger>
                  <SelectValue placeholder="No listing attached" />
                </SelectTrigger>
                <SelectContent>
                  {filteredListings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {getListingLabel(l)}
                    </SelectItem>
                  ))}
                  {filteredListings.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No listings for this category
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleStartBuilder}
              disabled={!canStart}
              className="w-full gap-2"
              size="lg"
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
  const selectedListing = resolvedContext.listingId
    ? listings.find((l) => l.id === resolvedContext.listingId)
    : null
  const selectedCategory = categories.find((c) => c.id === resolvedContext.categoryId)
  const selectedCountry = countries.find((c) => c.id === resolvedContext.countryId)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'main', label: 'Main Image' },
    { key: 'secondary', label: 'Secondary Images' },
    { key: 'video_thumbnail', label: 'Video Thumbnails' },
    { key: 'swatch', label: 'Swatches' },
    { key: 'hf_queue', label: 'HF Queue' },
  ]

  return (
    <div className="max-w-7xl mx-auto">
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
      <div className="flex gap-1 mb-6 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

          {activeTab === 'video_thumbnail' && (
            <VideoThumbnailSection
              listingId={resolvedContext.listingId}
              categoryId={resolvedContext.categoryId}
              countryId={resolvedContext.countryId}
              productName={resolvedContext.productName}
              brand={resolvedContext.brand}
              workshops={workshops}
              images={images}
            />
          )}

          {activeTab === 'swatch' && (
            <SwatchImageSection
              listingId={resolvedContext.listingId}
              categoryId={resolvedContext.categoryId}
              countryId={resolvedContext.countryId}
              productName={resolvedContext.productName}
              brand={resolvedContext.brand}
              workshops={workshops}
              images={images}
            />
          )}

          {activeTab === 'hf_queue' && (
            <HfQueuePanel listingId={resolvedContext.listingId} />
          )}
        </>
      )}
    </div>
  )
}
