'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useListingStore } from '@/stores/listing-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/listings/SectionCard'
import { ExportOptions } from '@/components/listings/ExportOptions'
import { SECTION_TYPES, SECTION_TYPE_LABELS, SECTION_CHAR_LIMIT_MAP } from '@/lib/constants'
import { Save, Loader2, CheckCircle2, MapPin, Tag, ChevronDown, ChevronRight, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'

export function StepReviewExport() {
  const router = useRouter()
  const listingId = useListingStore((s) => s.listingId)
  const sections = useListingStore((s) => s.sections)
  const listingStatus = useListingStore((s) => s.listingStatus)
  const charLimits = useListingStore((s) => s.charLimits)
  const categoryName = useListingStore((s) => s.categoryName)
  const countryName = useListingStore((s) => s.countryName)
  const productName = useListingStore((s) => s.productName)
  const setListingStatus = useListingStore((s) => s.setListingStatus)
  const addVariation = useListingStore((s) => s.addVariation)
  const updateFinalText = useListingStore((s) => s.updateFinalText)

  const [isSaving, setIsSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(false)
  const [bulletsExpanded, setBulletsExpanded] = useState(true)

  const handleVariationAdded = useCallback(
    (sectionId: string, newText: string, newIndex: number) => {
      addVariation(sectionId, newText, newIndex)
    },
    [addVariation]
  )

  const handleFinalTextChange = useCallback(
    (sectionId: string, text: string) => {
      updateFinalText(sectionId, text)
    },
    [updateFinalText]
  )

  // Sort sections by SECTION_TYPES order
  const sortedSections = [...sections].sort((a, b) => {
    const aIdx = SECTION_TYPES.indexOf(a.section_type as typeof SECTION_TYPES[number])
    const bIdx = SECTION_TYPES.indexOf(b.section_type as typeof SECTION_TYPES[number])
    return aIdx - bIdx
  })

  // Map section_type to char limit from country
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

  const approvedCount = sections.filter((s) => (s.final_text?.trim() || '').length > 0).length

  const handleSave = useCallback(async () => {
    if (!listingId) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
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
      if (!res.ok) {
        throw new Error(json.error || 'Save failed')
      }

      toast.success('Listing saved successfully!')
      setSaveDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }, [listingId, sections, listingStatus])

  if (!listingId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No listing generated yet. Go back to generate a listing first.</p>
      </div>
    )
  }

  // Split sections into groups
  const titleSections = sortedSections.filter((s) => s.section_type === 'title')
  const bulletSections = sortedSections.filter((s) => s.section_type.startsWith('bullet_'))
  const otherSections = sortedSections.filter(
    (s) => !s.section_type.startsWith('bullet_') && s.section_type !== 'title'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Review & Export</h2>
        <p className="text-sm text-muted-foreground">
          Review AI variations, paste your final text in the box below each section, then save and export
        </p>
      </div>

      {/* Context + Status Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Tag className="h-3 w-3" />
            {categoryName}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <MapPin className="h-3 w-3" />
            {countryName}
          </Badge>
          <Badge variant="secondary">{productName}</Badge>
          <Badge variant="outline">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {approvedCount}/{sections.length} approved
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={listingStatus}
            onChange={(e) => setListingStatus(e.target.value as 'draft' | 'review' | 'approved' | 'exported')}
            title="Draft = in progress, Review = ready for team review, Approved = finalized"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
          </select>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Post-save CTA */}
      {saveDone && (
        <div className="rounded-lg border bg-green-50/50 dark:bg-green-900/10 p-6 text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <h3 className="font-semibold">Listing Saved Successfully!</h3>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => router.push('/listings')}>
              View All Listings
            </Button>
            <Button onClick={() => router.push(`/listings/${listingId}?tab=main`)} className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Continue to Images
            </Button>
          </div>
        </div>
      )}

      {/* Section Cards */}
      <div className="space-y-3">
        {/* Title sections */}
        {titleSections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            label={SECTION_TYPE_LABELS[section.section_type] || section.section_type}
            charLimit={getCharLimit(section.section_type)}
            listingId={listingId!}
            onFinalTextChange={handleFinalTextChange}
            onVariationAdded={handleVariationAdded}
          />
        ))}

        {/* Collapsible bullet group */}
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
                    listingId={listingId!}
                    onFinalTextChange={handleFinalTextChange}
                    onVariationAdded={handleVariationAdded}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Other sections (description, search_terms, subject_matter) */}
        {otherSections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            label={SECTION_TYPE_LABELS[section.section_type] || section.section_type}
            charLimit={getCharLimit(section.section_type)}
            listingId={listingId!}
            onFinalTextChange={handleFinalTextChange}
            onVariationAdded={handleVariationAdded}
          />
        ))}
      </div>

      {/* Export */}
      <ExportOptions listingId={listingId} />
    </div>
  )
}
