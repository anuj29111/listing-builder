'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, ImageIcon } from 'lucide-react'
import type { LbImageGeneration } from '@/types/database'

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
}: ConceptCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(prompt)

  const handleSaveEdit = () => {
    onEditPrompt(editValue)
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(prompt)
    setEditing(false)
  }

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
          <div className="flex items-start gap-3 mb-2">
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
              <p className={`text-xs text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}>
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
        <div className="w-48 h-48 flex-shrink-0 rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Generating...</span>
            </div>
          ) : image?.preview_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.preview_url}
              alt={label}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">No image yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
