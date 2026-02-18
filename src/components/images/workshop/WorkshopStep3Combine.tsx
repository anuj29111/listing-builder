'use client'

import { useWorkshopStore } from '@/stores/workshop-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMAGE_ORIENTATION_LABELS } from '@/lib/constants'
import { ArrowRight, ArrowLeft, Loader2, Wand2, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export function WorkshopStep3Combine() {
  const store = useWorkshopStore()

  // Get tagged images for reference display
  const taggedImages = store.workshopImages.filter(
    (img) => (store.elementTags[img.id] || []).length > 0
  )

  const allTags = Array.from(
    new Set(Object.values(store.elementTags).flat())
  )

  const handleGenerate = async () => {
    if (!store.combinedPrompt.trim()) {
      toast.error('Please enter a combined prompt')
      return
    }

    store.setIsGeneratingFinal(true)
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: store.combinedPrompt,
          provider: store.provider,
          orientation: store.orientation,
          listing_id: store.workshop?.listing_id || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generation failed')

      store.setFinalImage(json.data.image)

      // Update workshop with final image
      if (store.workshopId) {
        await fetch(`/api/images/workshop/${store.workshopId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ final_image_id: json.data.image.id }),
        })
      }

      toast.success('Final combined image generated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      store.setIsGeneratingFinal(false)
    }
  }

  const handleNext = async () => {
    if (!store.finalImage) {
      toast.error('Generate the final image first')
      return
    }

    if (store.workshopId) {
      await fetch(`/api/images/workshop/${store.workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 4 }),
      })
    }

    store.setStep(4)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Combine Best Elements</h2>
        <p className="text-sm text-muted-foreground">
          Review tagged elements, edit the combined prompt, and generate the final image.
        </p>
      </div>

      {/* Tagged Elements Summary */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <Label className="text-sm font-medium">Collected Standout Elements</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {allTags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>
      </div>

      {/* Tagged Images Mini Grid */}
      {taggedImages.length > 0 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {taggedImages.map((img) => (
            <div key={img.id} className="relative aspect-square rounded-md overflow-hidden border">
              {img.preview_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.preview_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                <p className="text-[10px] text-white truncate">
                  {(store.elementTags[img.id] || []).join(', ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Combined Prompt Editor */}
      <div className="space-y-3">
        <Label>Combined Image Prompt</Label>
        <Textarea
          value={store.combinedPrompt}
          onChange={(e) => store.setCombinedPrompt(e.target.value)}
          rows={5}
          placeholder="Edit the combined prompt to describe your ideal final image..."
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Edit this prompt to merge the best elements from your tagged images into one ideal composition.
        </p>
      </div>

      {/* Provider & Orientation */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label className="text-xs">Provider</Label>
          <Select
            value={store.provider}
            onValueChange={(v) => store.setProvider(v as 'openai' | 'gemini' | 'higgsfield')}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">GPT Image 1.5</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="higgsfield">Higgsfield</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="text-xs">Orientation</Label>
          <Select
            value={store.orientation}
            onValueChange={(v) => store.setOrientation(v as 'square' | 'portrait' | 'landscape')}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(IMAGE_ORIENTATION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={store.isGeneratingFinal || !store.combinedPrompt.trim()}
        className="w-full"
        size="lg"
      >
        {store.isGeneratingFinal ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating final image...
          </>
        ) : (
          <>
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Combined Image
          </>
        )}
      </Button>

      {/* Final Image Preview */}
      {store.finalImage && (
        <div className="p-4 border border-green-200 rounded-lg bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <div className="flex items-center gap-2 mb-3">
            <Check className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-800 dark:text-green-200">Final Combined Image</span>
          </div>
          <div className="max-w-md mx-auto">
            {store.finalImage.preview_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.finalImage.preview_url}
                alt="Final combined image"
                className="w-full rounded-lg border"
              />
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => store.setStep(2)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Collage
        </Button>
        <Button
          onClick={handleNext}
          disabled={!store.finalImage}
          size="lg"
        >
          Next: Test Callouts & Compare
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
