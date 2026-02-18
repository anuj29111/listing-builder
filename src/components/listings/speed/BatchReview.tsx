'use client'

import { useState } from 'react'
import { useBatchStore } from '@/stores/batch-store'
import { SectionCard } from '@/components/listings/SectionCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ClipboardCopy,
  Save,
  Loader2,
} from 'lucide-react'
import { SECTION_TYPES, SECTION_TYPE_LABELS, SECTION_CHAR_LIMIT_MAP } from '@/lib/constants'
import type { LbListingSection } from '@/types/database'
import toast from 'react-hot-toast'

export function BatchReview() {
  const generatedListings = useBatchStore((s) => s.generatedListings)
  const expandedListingId = useBatchStore((s) => s.expandedListingId)
  const setExpandedListingId = useBatchStore((s) => s.setExpandedListingId)
  const approveAllSections = useBatchStore((s) => s.approveAllSections)
  const approveAllListings = useBatchStore((s) => s.approveAllListings)
  const updateFinalText = useBatchStore((s) => s.updateFinalText)
  const addVariation = useBatchStore((s) => s.addVariation)
  const charLimits = useBatchStore((s) => s.charLimits)
  const batchJobId = useBatchStore((s) => s.batchJobId)

  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState<string | null>(null)

  // Count approved sections across all listings
  const totalSections = generatedListings.length * 9
  const approvedSections = generatedListings.reduce(
    (sum, gl) => sum + gl.sections.filter((s) => (s.final_text?.trim() || '').length > 0).length,
    0
  )

  const getCharLimit = (sectionType: string): number => {
    const key = SECTION_CHAR_LIMIT_MAP[sectionType]
    if (!key) return 250
    if (key === 'title_limit') return charLimits.title
    if (key === 'bullet_limit') return charLimits.bullet
    if (key === 'description_limit') return charLimits.description
    if (key === 'search_terms_limit') return charLimits.searchTerms
    return 250
  }

  // Sort sections by SECTION_TYPES order
  const sortSections = (sections: LbListingSection[]) => {
    const orderMap = SECTION_TYPES.reduce(
      (acc, type, idx) => ({ ...acc, [type]: idx }),
      {} as Record<string, number>
    )
    return [...sections].sort(
      (a, b) => (orderMap[a.section_type] ?? 99) - (orderMap[b.section_type] ?? 99)
    )
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    try {
      const results = await Promise.all(
        generatedListings.map(async (gl) => {
          const res = await fetch(`/api/listings/${gl.listing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sections: gl.sections.map((s) => ({
                id: s.id,
                selected_variation: s.selected_variation,
                is_approved: (s.final_text?.trim() || '').length > 0,
                final_text: s.final_text || null,
              })),
              status: gl.sections.every((s) => (s.final_text?.trim() || '').length > 0) ? 'approved' : 'review',
            }),
          })
          return res.ok
        })
      )

      const successCount = results.filter(Boolean).length
      if (successCount === results.length) {
        toast.success(`All ${successCount} listings saved!`)
      } else {
        toast.error(`${successCount}/${results.length} listings saved. Some failed.`)
      }
    } catch {
      toast.error('Failed to save listings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleBulkExport = async (exportType: 'csv' | 'flat_file' | 'clipboard') => {
    if (!batchJobId) return
    setIsExporting(exportType)
    try {
      if (exportType === 'clipboard') {
        // Build clipboard text from all listings
        const lines: string[] = []
        for (const gl of generatedListings) {
          const productName =
            (gl.listing.generation_context as Record<string, string>)?.productName || 'Unknown'
          lines.push(`=== ${productName} ===`)
          lines.push('')

          const sorted = sortSections(gl.sections)
          for (const section of sorted) {
            const label = SECTION_TYPE_LABELS[section.section_type] || section.section_type
            let text = ''
            if (section.final_text && section.final_text.trim()) {
              text = section.final_text
            } else {
              const vars = section.variations as string[]
              text = vars[section.selected_variation] || vars[0] || ''
            }
            lines.push(`${label}: ${text}`)
          }
          lines.push('')
          lines.push('---')
          lines.push('')
        }
        await navigator.clipboard.writeText(lines.join('\n'))
        toast.success('All listings copied to clipboard!')
      } else {
        const res = await fetch(`/api/batch/${batchJobId}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ export_type: exportType }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Export failed')

        const { formatted } = json.data as {
          formatted: { headers: string[]; rows: string[][] }
        }

        const csvContent = [
          formatted.headers.join(','),
          ...formatted.rows.map((row) =>
            row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
          ),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download =
          exportType === 'csv'
            ? `batch-${batchJobId.slice(0, 8)}.csv`
            : `batch-${batchJobId.slice(0, 8)}-flat-file.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        toast.success(
          `${exportType === 'csv' ? 'CSV' : 'Flat file'} downloaded!`
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      toast.error(message)
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Review & Export</h2>
          <p className="text-sm text-muted-foreground">
            Review generated listings, approve sections, and export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {approvedSections}/{totalSections} sections approved
          </Badge>
          <Badge variant="outline">{generatedListings.length} listings</Badge>
        </div>
      </div>

      {/* Batch Actions */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            approveAllListings()
            toast.success('All sections approved!')
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve All
        </Button>
        <Button
          size="sm"
          className="gap-1"
          onClick={handleSaveAll}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save All
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => handleBulkExport('clipboard')}
          disabled={isExporting !== null}
        >
          {isExporting === 'clipboard' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardCopy className="h-4 w-4" />
          )}
          Copy All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => handleBulkExport('csv')}
          disabled={isExporting !== null}
        >
          {isExporting === 'csv' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => handleBulkExport('flat_file')}
          disabled={isExporting !== null}
        >
          {isExporting === 'flat_file' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Flat File
        </Button>
      </div>

      {/* Listing Accordion */}
      <div className="space-y-3">
        {generatedListings.map((gl) => {
          const productName =
            (gl.listing.generation_context as Record<string, string>)?.productName || 'Unknown'
          const asin = (gl.listing.generation_context as Record<string, string>)?.asin || ''
          const isExpanded = expandedListingId === gl.listing.id
          const sectionApprovedCount = gl.sections.filter((s) => (s.final_text?.trim() || '').length > 0).length
          const sorted = sortSections(gl.sections)

          return (
            <div key={gl.listing.id} className="rounded-lg border">
              {/* Collapsed Header */}
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpandedListingId(gl.listing.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <span className="font-medium">{productName}</span>
                    {asin && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ASIN: {asin}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      sectionApprovedCount === 9
                        ? 'default'
                        : sectionApprovedCount > 0
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {sectionApprovedCount}/9 approved
                  </Badge>
                  <Badge variant="outline">{gl.listing.status}</Badge>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t p-4 space-y-4">
                  {/* Per-listing quick actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => {
                        approveAllSections(gl.listing.id)
                        toast.success(`All sections approved for ${productName}`)
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve All Sections
                    </Button>
                  </div>

                  {/* Section Cards */}
                  <div className="space-y-3">
                    {sorted.map((section) => (
                      <SectionCard
                        key={section.id}
                        section={section}
                        label={SECTION_TYPE_LABELS[section.section_type] || section.section_type}
                        charLimit={getCharLimit(section.section_type)}
                        listingId={gl.listing.id}
                        onFinalTextChange={(sectionId, text) =>
                          updateFinalText(gl.listing.id, sectionId, text)
                        }
                        onVariationAdded={(sectionId, newText, newIndex) =>
                          addVariation(gl.listing.id, sectionId, newText, newIndex)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
