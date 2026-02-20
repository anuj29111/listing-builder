'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, ImageIcon, ZoomIn, Info } from 'lucide-react'
import type { LbImageGeneration } from '@/types/database'

export interface ConceptDetailItem {
  label: string
  value: string | string[]
}

export interface ConceptMetadataItem {
  label: string
  value: string
}

type ImageType = 'main' | 'secondary' | 'video_thumbnail' | 'swatch'

interface ConceptCardProps {
  index: number
  label: string
  prompt: string
  approach?: string
  image?: LbImageGeneration | null
  isSelected: boolean
  isGenerating?: boolean
  onToggleSelect: () => void
  onEditPrompt: (newPrompt: string) => void
  onRegenerate?: () => void
  onGenerate?: () => void
  showCheckbox?: boolean
  details?: ConceptDetailItem[]
  imageType?: ImageType
  metadata?: ConceptMetadataItem[]
  colorSwatches?: string[]
  subHeadline?: string
  usp?: string
}

/** Parse hex color codes from a string like "#FF1493, #008080" or "vibrant pink (#FF1493)" */
function parseHexColors(str: string): string[] {
  const hexPattern = /#[0-9A-Fa-f]{6}/g
  return str.match(hexPattern) || []
}

function ColorSwatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null
  return (
    <div className="flex items-center gap-1">
      {colors.slice(0, 6).map((color, i) => (
        <div
          key={i}
          className="w-4 h-4 rounded-full border border-border/50 flex-shrink-0"
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  )
}

export function ConceptCard({
  index,
  label,
  prompt,
  approach,
  image,
  isSelected,
  isGenerating,
  onToggleSelect,
  onEditPrompt,
  onRegenerate,
  onGenerate,
  showCheckbox = true,
  details,
  imageType,
  metadata,
  colorSwatches,
  subHeadline,
  usp,
}: ConceptCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(prompt)
  const [showPreview, setShowPreview] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const handleSaveEdit = () => {
    onEditPrompt(editValue)
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(prompt)
    setEditing(false)
  }

  // Filter out empty details
  const filteredDetails = details?.filter((d) => {
    if (Array.isArray(d.value)) return d.value.length > 0
    return d.value && d.value.trim() !== ''
  })

  // Metadata items shown in the inline bar already — exclude from "Full Details" to avoid duplication
  const metadataLabels = new Set((metadata || []).map((m) => m.label))
  const remainingDetails = filteredDetails?.filter((d) => !metadataLabels.has(d.label))

  // Auto-detect color swatches from details if not explicitly provided
  const resolvedSwatches = colorSwatches || (() => {
    const colorDetail = details?.find((d) =>
      d.label.toLowerCase().includes('color') &&
      typeof d.value === 'string'
    )
    return colorDetail ? parseHexColors(colorDetail.value as string) : []
  })()

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-muted'
      }`}
    >
      <div className="flex gap-4 p-4">
        {/* Left: Prompt content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start gap-3 mb-1">
            {showCheckbox && (
              <button
                onClick={onToggleSelect}
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{label}</span>
                {approach && (
                  <Badge variant="secondary" className="text-xs">
                    {approach}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Always-visible metadata bar */}
          {(metadata && metadata.length > 0) || resolvedSwatches.length > 0 || subHeadline || usp ? (
            <div className="flex items-center gap-3 flex-wrap mt-1 mb-1.5">
              {metadata?.map((m) => (
                <span key={m.label} className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">{m.label}:</span>{' '}
                  {m.value}
                </span>
              ))}
              {resolvedSwatches.length > 0 && <ColorSwatches colors={resolvedSwatches} />}
            </div>
          ) : null}

          {/* Sub-headline + USP always visible for secondary images */}
          {(subHeadline || usp) && (
            <div className="space-y-0.5 mt-1 mb-1.5">
              {subHeadline && (
                <p className="text-xs font-medium text-foreground/80 italic">&ldquo;{subHeadline}&rdquo;</p>
              )}
              {usp && (
                <p className="text-[11px] text-primary/80">
                  <span className="font-semibold">USP:</span> {usp}
                </p>
              )}
            </div>
          )}

          {/* Prompt text */}
          {editing ? (
            <div className="space-y-2 mt-2">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <p className={`text-xs text-muted-foreground ${expanded ? '' : 'line-clamp-3'}`}>
                {prompt}
              </p>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Less' : 'Expand'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {!editing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setEditValue(prompt)
                  setEditing(true)
                }}
              >
                Edit
              </Button>
            )}
            {remainingDetails && remainingDetails.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowDetails(!showDetails)}
              >
                <Info className="h-3 w-3 mr-1" />
                {showDetails ? 'Hide Details' : 'Full Details'}
              </Button>
            )}
            {image && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onRegenerate}
                disabled={isGenerating}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Regenerate
              </Button>
            )}
            {!image && onGenerate && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <ImageIcon className="h-3 w-3 mr-1" />
                )}
                Generate
              </Button>
            )}
          </div>
        </div>

        {/* Right: Image preview */}
        <div className="w-48 h-48 flex-shrink-0 rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center relative group">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Generating...</span>
            </div>
          ) : image?.preview_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.preview_url}
                alt={label}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setShowPreview(true)}
                className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-zoom-in"
              >
                <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">No image yet</span>
            </div>
          )}
        </div>
      </div>

      {/* Full Details Panel (only fields NOT already in metadata bar) */}
      {showDetails && remainingDetails && remainingDetails.length > 0 && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {remainingDetails.map((detail) => (
              <div key={detail.label} className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {detail.label}
                </span>
                {Array.isArray(detail.value) ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {detail.value.map((v, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-normal">
                        {v}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">
                    {detail.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full-size preview dialog */}
      {image?.preview_url && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-4xl w-auto p-2">
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.full_url || image.preview_url}
                alt={label}
                className="w-full max-h-[80vh] object-contain rounded-lg"
              />
              <div className="px-2 pb-2">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{prompt}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
