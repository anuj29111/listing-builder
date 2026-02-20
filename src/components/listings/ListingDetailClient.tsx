'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SectionCard } from '@/components/listings/SectionCard'
import { ExportOptions } from '@/components/listings/ExportOptions'
import { BulletPlanningMatrix } from '@/components/listings/BulletPlanningMatrix'
import { BackendAttributesCard } from '@/components/listings/BackendAttributesCard'
import { QnAVerification } from '@/components/listings/QnAVerification'
import { MainImageSection } from '@/components/listings/images/MainImageSection'
import { SecondaryImageSection } from '@/components/listings/images/SecondaryImageSection'
import { VideoThumbnailSection } from '@/components/listings/images/VideoThumbnailSection'
import { SwatchImageSection } from '@/components/listings/images/SwatchImageSection'
import { SECTION_TYPES, SECTION_TYPE_LABELS, SECTION_CHAR_LIMIT_MAP } from '@/lib/constants'
import { Pencil, Save, Loader2, CheckCircle2, Tag, MapPin, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbListingSection, LbCategory, LbImageWorkshop, LbImageGeneration } from '@/types/database'

interface ListingDetailClientProps {
  listing: Record<string, unknown> & {
    id: string
    title: string | null
    status: string
    country_id: string
    generation_context: Record<string, unknown>
    planning_matrix?: unknown[] | null
    backend_attributes?: Record<string, string[]> | null
    product_type?: { id: string; name: string; asin: string | null; category_id: string } | null
    country?: {
      name: string; code: string; flag_emoji: string | null; language: string
      title_limit: number; bullet_limit: number; description_limit: number; search_terms_limit: number
    } | null
    creator?: { full_name: string | null } | null
  }
  sections: LbListingSection[]
  category: LbCategory | null
  workshops: LbImageWorkshop[]
  images: unknown[]
}

type Tab = 'content' | 'main' | 'secondary' | 'video_thumbnail' | 'swatch'

export function ListingDetailClient({
  listing,
  sections: initialSections,
  category,
  workshops,
  images: rawImages,
}: ListingDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as Tab | null

  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'content')
  const [sections, setSections] = useState(initialSections)
  const [listingStatus, setListingStatus] = useState(listing.status as 'draft' | 'review' | 'approved' | 'exported')
  const [isSaving, setIsSaving] = useState(false)

  const images = rawImages as LbImageGeneration[]

  const productName = (listing.generation_context?.productName as string) || listing.product_type?.name || 'Product'
  const brandName = (listing.generation_context?.brand as string) || category?.brand || 'Brand'
  const categoryId = listing.product_type?.category_id || (listing.generation_context?.categoryId as string) || ''
  const countryId = listing.country_id

  // Tab navigation with URL persistence
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/listings/${listing.id}?${params.toString()}`, { scroll: false })
  }

  // --- Content tab logic ---
  const charLimits = {
    title: listing.country?.title_limit || 200,
    bullet: listing.country?.bullet_limit || 250,
    description: listing.country?.description_limit || 2000,
    searchTerms: listing.country?.search_terms_limit || 250,
  }

  const sortedSections = [...sections].sort((a, b) => {
    const aIdx = SECTION_TYPES.indexOf(a.section_type as typeof SECTION_TYPES[number])
    const bIdx = SECTION_TYPES.indexOf(b.section_type as typeof SECTION_TYPES[number])
    return aIdx - bIdx
  })

  const getCharLimit = (sectionType: string): number => {
    const limitKey = SECTION_CHAR_LIMIT_MAP[sectionType]
    if (!limitKey) return 250
    const map: Record<string, number> = {
      title_limit: charLimits.title,
      bullet_limit: charLimits.bullet,
      description_limit: charLimits.description,
      search_terms_limit: charLimits.searchTerms,
    }
    return map[limitKey] || 250
  }

  const updateFinalText = useCallback((sectionId: string, text: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, final_text: text } : s))
    )
  }, [])

  const addVariation = useCallback((sectionId: string, newText: string, newIndex: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const variations = [...(s.variations as string[])]
        variations[newIndex] = newText
        return { ...s, variations, selected_variation: newIndex }
      })
    )
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: sections.map((s) => ({
            id: s.id,
            selected_variation: s.selected_variation,
            is_approved: (s.final_text?.trim() || '').length > 0,
            final_text: s.final_text || null,
          })),
          status: listingStatus,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      toast.success('Listing saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const approvedCount = sections.filter((s) => (s.final_text?.trim() || '').length > 0).length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'content', label: 'Content' },
    { key: 'main', label: 'Main Image' },
    { key: 'secondary', label: 'Secondary Images' },
    { key: 'video_thumbnail', label: 'Video Thumbnails' },
    { key: 'swatch', label: 'Swatches' },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/listings')}
              className="gap-1 -ml-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Listings
            </Button>
          </div>
          <h1 className="text-2xl font-bold truncate max-w-2xl">
            {listing.title || productName}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {listing.product_type?.asin && (
              <Badge variant="outline" className="font-mono text-xs">
                {listing.product_type.asin}
              </Badge>
            )}
            {category && (
              <Badge variant="outline" className="gap-1">
                <Tag className="h-3 w-3" />
                {category.name}
              </Badge>
            )}
            {listing.country && (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {listing.country.flag_emoji} {listing.country.name}
              </Badge>
            )}
            <StatusBadge status={listing.status} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/listings/new?edit=${listing.id}`)}
          className="gap-2"
        >
          <Pencil className="h-4 w-4" />
          Edit in Wizard
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
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
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Status + Save bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {approvedCount}/{sections.length} approved
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={listingStatus}
                onChange={(e) => setListingStatus(e.target.value as typeof listingStatus)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="review">Review</option>
                <option value="approved">Approved</option>
              </select>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          {/* Planning Matrix (above bullet sections) */}
          {listing.planning_matrix && (
            <BulletPlanningMatrix
              matrix={listing.planning_matrix as import('@/types/database').BulletPlanningMatrixEntry[]}
            />
          )}

          {/* Section Cards */}
          <div className="space-y-3">
            {sortedSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                label={SECTION_TYPE_LABELS[section.section_type] || section.section_type}
                charLimit={getCharLimit(section.section_type)}
                listingId={listing.id}
                onFinalTextChange={updateFinalText}
                onVariationAdded={addVariation}
              />
            ))}
          </div>

          {/* Backend Attributes */}
          {listing.backend_attributes && (
            <BackendAttributesCard
              attributes={listing.backend_attributes as Record<string, string[]>}
            />
          )}

          {/* Q&A Verification */}
          <QnAVerification listingId={listing.id} />

          {/* Export */}
          <ExportOptions listingId={listing.id} />
        </div>
      )}

      {activeTab === 'main' && (
        <MainImageSection
          listingId={listing.id}
          categoryId={categoryId}
          countryId={countryId}
          productName={productName}
          brand={brandName}
          workshops={workshops}
          images={images}
        />
      )}

      {activeTab === 'secondary' && (
        <SecondaryImageSection
          listingId={listing.id}
          categoryId={categoryId}
          countryId={countryId}
          productName={productName}
          brand={brandName}
          workshops={workshops}
          images={images}
        />
      )}

      {activeTab === 'video_thumbnail' && (
        <VideoThumbnailSection
          listingId={listing.id}
          categoryId={categoryId}
          countryId={countryId}
          productName={productName}
          brand={brandName}
          workshops={workshops}
          images={images}
        />
      )}

      {activeTab === 'swatch' && (
        <SwatchImageSection
          listingId={listing.id}
          categoryId={categoryId}
          countryId={countryId}
          productName={productName}
          brand={brandName}
          workshops={workshops}
          images={images}
        />
      )}
    </div>
  )
}
