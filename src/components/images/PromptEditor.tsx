'use client'

import { useImageStore } from '@/stores/image-store'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  IMAGE_BACKGROUNDS,
  IMAGE_LIGHTINGS,
  IMAGE_ANGLES,
  IMAGE_ARRANGEMENTS,
} from '@/lib/constants'
import type { LbListing } from '@/types/database'

interface PromptEditorProps {
  listings: Array<Pick<LbListing, 'id' | 'title' | 'generation_context'>>
}

export function PromptEditor({ listings }: PromptEditorProps) {
  const prompt = useImageStore((s) => s.prompt)
  const setPrompt = useImageStore((s) => s.setPrompt)
  const listingId = useImageStore((s) => s.listingId)
  const setListingId = useImageStore((s) => s.setListingId)

  const handleListingChange = (value: string) => {
    if (value === 'none') {
      setListingId(null)
      return
    }
    setListingId(value)
    const listing = listings.find((l) => l.id === value)
    if (listing) {
      const ctx = listing.generation_context as Record<string, string>
      const productName = ctx?.productName || listing.title || 'product'
      const brand = ctx?.brand || ''
      setPrompt(
        `Professional product photography of ${brand} ${productName} on a clean white background. ` +
        `High-quality Amazon product listing image, studio lighting, sharp focus, centered composition.`
      )
    }
  }

  const applyQuickAdjustment = (type: string, value: string) => {
    if (!prompt) return
    const adjustments: Record<string, string> = {
      background: `Background: ${value}.`,
      lighting: `Lighting: ${value}.`,
      angle: `Camera angle: ${value}.`,
      arrangement: `Product arrangement: ${value}.`,
    }
    const suffix = adjustments[type]
    if (suffix) {
      setPrompt(prompt.replace(/\s*$/, ' ') + suffix)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <Label className="text-sm font-medium">Link to Listing (optional)</Label>
        <Select value={listingId || 'none'} onValueChange={handleListingChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Standalone image" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Standalone (no listing)</SelectItem>
            {listings.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.title || (l.generation_context as Record<string, string>)?.productName || 'Untitled'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium">Prompt</Label>
        <textarea
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Describe the product image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">{prompt.length} characters</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Background</Label>
          <Select onValueChange={(v) => applyQuickAdjustment('background', v)}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="Add..." />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_BACKGROUNDS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Lighting</Label>
          <Select onValueChange={(v) => applyQuickAdjustment('lighting', v)}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="Add..." />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_LIGHTINGS.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Angle</Label>
          <Select onValueChange={(v) => applyQuickAdjustment('angle', v)}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="Add..." />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_ANGLES.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Arrangement</Label>
          <Select onValueChange={(v) => applyQuickAdjustment('arrangement', v)}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="Add..." />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_ARRANGEMENTS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
