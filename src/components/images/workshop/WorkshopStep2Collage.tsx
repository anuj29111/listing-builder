'use client'

import { useState, useCallback } from 'react'
import { useWorkshopStore } from '@/stores/workshop-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ArrowRight, X, Tag, ZoomIn } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbImageGeneration } from '@/types/database'

export function WorkshopStep2Collage() {
  const store = useWorkshopStore()
  const [selectedImage, setSelectedImage] = useState<LbImageGeneration | null>(null)
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [savingTags, setSavingTags] = useState(false)

  const handleAddTag = useCallback((imageId: string) => {
    const input = (tagInputs[imageId] || '').trim()
    if (!input) return

    const currentTags = store.elementTags[imageId] || []
    if (currentTags.includes(input)) {
      toast.error('Tag already exists')
      return
    }

    store.setElementTag(imageId, [...currentTags, input])
    setTagInputs((prev) => ({ ...prev, [imageId]: '' }))
  }, [tagInputs, store])

  const handleRemoveTag = useCallback((imageId: string, tag: string) => {
    const currentTags = store.elementTags[imageId] || []
    store.setElementTag(imageId, currentTags.filter((t) => t !== tag))
  }, [store])

  const handleKeyDown = (e: React.KeyboardEvent, imageId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag(imageId)
    }
  }

  // Save tags to server and advance
  const handleNext = async () => {
    if (!store.workshopId) return

    // Check if any tags exist
    const totalTags = Object.values(store.elementTags).flat().length
    if (totalTags === 0) {
      toast.error('Tag at least one standout element before continuing')
      return
    }

    setSavingTags(true)
    try {
      const res = await fetch(`/api/images/workshop/${store.workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          element_tags: store.elementTags,
          step: 3,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save')
      }

      // Build combined prompt from all tags
      const allTags = Object.values(store.elementTags).flat()
      const uniqueTags = Array.from(new Set(allTags))
      const workshop = store.workshop
      const combined = `Professional Amazon main product image of ${workshop?.brand || ''} ${workshop?.product_name || ''}. Combine these standout elements: ${uniqueTags.join(', ')}. High-quality studio photography, white background, sharp focus, centered composition.`
      store.setCombinedPrompt(combined)
      store.setStep(3)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save tags')
    } finally {
      setSavingTags(false)
    }
  }

  const totalTags = Object.values(store.elementTags).flat().length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Collage View</h2>
          <p className="text-sm text-muted-foreground">
            Review all generated images. Tag standout elements you want to combine into the final image.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">
            <Tag className="h-3 w-3 mr-1" />
            {totalTags} tags
          </Badge>
          <Badge variant="outline">
            {store.workshopImages.length} images
          </Badge>
        </div>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {store.workshopImages.map((image) => {
          const imageTags = store.elementTags[image.id] || []
          const hasTagged = imageTags.length > 0

          return (
            <div
              key={image.id}
              className={`border rounded-lg overflow-hidden transition-all ${
                hasTagged ? 'border-primary ring-1 ring-primary/20' : 'border-muted'
              }`}
            >
              {/* Image */}
              <div className="relative aspect-square bg-muted">
                {image.preview_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.preview_url}
                    alt={image.prompt.slice(0, 50)}
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  onClick={() => setSelectedImage(image)}
                  className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"
                >
                  <ZoomIn className="h-6 w-6 text-white" />
                </button>
              </div>

              {/* Tags */}
              <div className="p-3 space-y-2">
                {imageTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {imageTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs pr-1">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(image.id, tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Tag Input */}
                <div className="flex gap-1">
                  <Input
                    value={tagInputs[image.id] || ''}
                    onChange={(e) => setTagInputs((prev) => ({ ...prev, [image.id]: e.target.value }))}
                    onKeyDown={(e) => handleKeyDown(e, image.id)}
                    placeholder="Tag element..."
                    className="h-7 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleAddTag(image.id)}
                  >
                    <Tag className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          disabled={savingTags || totalTags === 0}
          size="lg"
        >
          {savingTags ? 'Saving...' : 'Next: Combine Best Elements'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Full-Size Preview Dialog */}
      <Dialog open={selectedImage !== null} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl">
          {selectedImage && (
            <div className="space-y-4">
              {selectedImage.preview_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedImage.preview_url}
                  alt="Full preview"
                  className="w-full rounded-lg"
                />
              )}
              <p className="text-sm text-muted-foreground">{selectedImage.prompt}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
