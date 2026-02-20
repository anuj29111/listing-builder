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
import { VideoScriptStoryboardSection } from '@/components/listings/video/VideoScriptStoryboardSection'
import { ListingAPlusSection } from '@/components/listings/ListingAPlusSection'
import { SECTION_TYPES, SECTION_TYPE_LABELS, SECTION_CHAR_LIMIT_MAP } from '@/lib/constants'
import { Pencil, Save, Loader2, CheckCircle2, Tag, MapPin, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbListingSection, LbCategory, LbImageWorkshop, LbImageGeneration, LbVideoProject, LbAPlusModule } from '@/types/database'

// --- Two-tier tab system ---
type PrimaryTab = 'content' | 'images' | 'video' | 'aplus'
type ImageSubTab = 'main' | 'secondary' | 'swatch'
type VideoSubTab = 'thumbnails' | 'script_storyboard'
type SubTab = ImageSubTab | VideoSubTab

interface TabConfig {
  key: PrimaryTab
  label: string
  subTabs?: { key: SubTab; label: string }[]
}

const TABS: TabConfig[] = [
  { key: 'content', label: 'Content' },
  {
    key: 'images',
    label: 'Images',
    subTabs: [
      { key: 'main', label: 'Main Image' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'swatch', label: 'Swatches' },
    ],
  },
  {
    key: 'video',
    label: 'Video',
    subTabs: [
      { key: 'thumbnails', label: 'Thumbnails' },
      { key: 'script_storyboard', label: 'Script & Storyboard' },
    ],
  },
  { key: 'aplus', label: 'A+ Content' },
]

const DEFAULT_SUB_TABS: Record<string, SubTab> = {
  images: 'main',
  video: 'thumbnails',
}

// Backward compatibility: map old flat tab keys to new 2-tier system
const LEGACY_TAB_MAP: Record<string, { tab: PrimaryTab; sub?: SubTab }> = {
  content: { tab: 'content' },
  main: { tab: 'images', sub: 'main' },
  secondary: { tab: 'images', sub: 'secondary' },
  video_thumbnail: { tab: 'video', sub: 'thumbnails' },
  swatch: { tab: 'images', sub: 'swatch' },
}

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
  videoProject: LbVideoProject | null
  aplusModules: LbAPlusModule[]
}

export function ListingDetailClient({
  listing,
  sections: initialSections,
  category,
  workshops,
  images: rawImages,
  videoProject,
  aplusModules,
}: ListingDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse tab from URL with backward compatibility
  const tabParam = searchParams.get('tab') || 'content'
  const subParam = searchParams.get('sub')

  let initialTab: PrimaryTab = 'content'
  let initialSub: SubTab | null = null

  if (LEGACY_TAB_MAP[tabParam]) {
    // Backward compat: old flat tab → new 2-tier
    initialTab = LEGACY_TAB_MAP[tabParam].tab
    initialSub = LEGACY_TAB_MAP[tabParam].sub || null
  } else if (['content', 'images', 'video', 'aplus'].includes(tabParam)) {
    initialTab = tabParam as PrimaryTab
    initialSub = (subParam as SubTab) || null
  }

  // If primary tab has sub-tabs but none selected, use default
  if (!initialSub && DEFAULT_SUB_TABS[initialTab]) {
    initialSub = DEFAULT_SUB_TABS[initialTab]
  }

  const [activeTab, setActiveTab] = useState<PrimaryTab>(initialTab)
  const [activeSubTab, setActiveSubTab] = useState<SubTab | null>(initialSub)
  const [sections, setSections] = useState(initialSections)
  const [listingStatus, setListingStatus] = useState(listing.status as 'draft' | 'review' | 'approved' | 'exported')
  const [isSaving, setIsSaving] = useState(false)
  const [bulletsExpanded, setBulletsExpanded] = useState(true)

  const images = rawImages as LbImageGeneration[]

  const productName = (listing.generation_context?.productName as string) || listing.product_type?.name || 'Product'
  const brandName = (listing.generation_context?.brand as string) || category?.brand || 'Brand'
  const categoryId = listing.product_type?.category_id || (listing.generation_context?.categoryId as string) || ''
  const countryId = listing.country_id

  // Tab navigation with URL persistence
  const handleTabChange = (tab: PrimaryTab) => {
    setActiveTab(tab)
    const defaultSub = DEFAULT_SUB_TABS[tab] || null
    setActiveSubTab(defaultSub)

    const params = new URLSearchParams()
    params.set('tab', tab)
    if (defaultSub) params.set('sub', defaultSub)
    router.replace(`/listings/${listing.id}?${params.toString()}`, { scroll: false })
  }

  const handleSubTabChange = (sub: SubTab) => {
    setActiveSubTab(sub)
    const params = new URLSearchParams()
    params.set('tab', activeTab)
    params.set('sub', sub)
    router.replace(`/listings/${listing.id}?${params.toString()}`, { scroll: false })
  }

  // Get current primary tab config
  const activeTabConfig = TABS.find((t) => t.key === activeTab)

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

      {/* Primary Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
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

      {/* Sub-tabs (pill style) */}
      {activeTabConfig?.subTabs && (
        <div className="flex gap-1 mt-3 mb-6">
          {activeTabConfig.subTabs.map((sub) => (
            <button
              key={sub.key}
              onClick={() => handleSubTabChange(sub.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                activeSubTab === sub.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Spacing when no sub-tabs */}
      {!activeTabConfig?.subTabs && <div className="mb-6" />}

      {/* === Tab Content === */}

      {/* Content Tab */}
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

          {/* Section Cards — grouped: title, collapsible bullets, rest */}
          {(() => {
            const titleSections = sortedSections.filter((s) => s.section_type === 'title')
            const bulletSections = sortedSections.filter((s) => s.section_type.startsWith('bullet_'))
            const otherSections = sortedSections.filter(
              (s) => !s.section_type.startsWith('bullet_') && s.section_type !== 'title'
            )

            return (
              <div className="space-y-3">
                {/* Title */}
                {titleSections.map((section) => (
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

                {/* Collapsible Bullet Group */}
                {bulletSections.length > 0 && (
                  <div className="rounded-lg border">
                    <button
                      onClick={() => setBulletsExpanded(!bulletsExpanded)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {bulletsExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <span className="font-medium">Bullet Points ({bulletSections.length})</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {bulletsExpanded ? 'Collapse All' : 'Expand All'}
                      </span>
                    </button>
                    {bulletsExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {bulletSections.map((section) => (
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
                    )}
                  </div>
                )}

                {/* Description, Search Terms, Subject Matter */}
                {otherSections.map((section) => (
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
            )
          })()}

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

      {/* Images Tab — Main */}
      {activeTab === 'images' && activeSubTab === 'main' && (
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

      {/* Images Tab — Secondary */}
      {activeTab === 'images' && activeSubTab === 'secondary' && (
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

      {/* Images Tab — Swatches */}
      {activeTab === 'images' && activeSubTab === 'swatch' && (
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

      {/* Video Tab — Thumbnails */}
      {activeTab === 'video' && activeSubTab === 'thumbnails' && (
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

      {/* Video Tab — Script & Storyboard */}
      {activeTab === 'video' && activeSubTab === 'script_storyboard' && (
        <VideoScriptStoryboardSection
          listingId={listing.id}
          initialVideoProject={videoProject}
        />
      )}

      {/* A+ Content Tab */}
      {activeTab === 'aplus' && (
        <ListingAPlusSection
          listingId={listing.id}
          listing={{ id: listing.id, title: listing.title, generation_context: listing.generation_context }}
          category={category ? { id: category.id, name: category.name, brand: category.brand } : null}
          country={listing.country ? { id: countryId, name: listing.country.name, code: listing.country.code } : null}
          initialModules={aplusModules}
        />
      )}
    </div>
  )
}
