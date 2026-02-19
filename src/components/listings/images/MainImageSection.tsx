'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWorkshopStore } from '@/stores/workshop-store'
import { ConceptCard } from './ConceptCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { ProviderModelBar, getEffectiveModelId } from './ProviderModelBar'
import { Loader2, Sparkles, ImageIcon, Tag, ArrowRight, X, ZoomIn } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbImageGeneration, LbImageWorkshop } from '@/types/database'
import type { WorkshopPrompt } from '@/types/api'

interface MainImageSectionProps {
  listingId?: string | null
  categoryId: string
  countryId: string
  productName: string
  brand: string
  workshops: LbImageWorkshop[]
  images: LbImageGeneration[]
}

export function MainImageSection({
  listingId,
  categoryId,
  countryId,
  productName,
  brand,
  workshops,
  images,
}: MainImageSectionProps) {
  const store = useWorkshopStore()
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [showFinalPreview, setShowFinalPreview] = useState(false)

  // Find existing main workshop for this context
  const existingWorkshop = workshops.find((w) => w.image_type === 'main')
  const existingImages = existingWorkshop
    ? images.filter((img) => img.workshop_id === existingWorkshop.id)
    : []

  // Hydrate store from DB on mount
  useEffect(() => {
    if (existingWorkshop) {
      store.hydrateFromDB(existingWorkshop, existingImages)
    } else {
      store.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingWorkshop?.id])

  const selectedCount = store.selectedPromptIndices.length

  // Save to DB helper
  const patchWorkshop = useCallback(async (workshopId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/images/workshop/${workshopId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }, [])

  // Generate AI prompts
  const handleGeneratePrompts = async () => {
    store.setIsGeneratingPrompts(true)
    try {
      const res = await fetch('/api/images/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_id: categoryId,
          country_id: countryId,
          listing_id: listingId || undefined,
          image_type: 'main',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate prompts')

      const { workshop, prompts, callout_suggestions } = json.data
      store.setWorkshopId(workshop.id)
      store.setWorkshop(workshop)
      store.setGeneratedPrompts(prompts, callout_suggestions)
      store.setCalloutTexts(callout_suggestions)
      toast.success(`Generated ${prompts.length} image concepts!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate prompts')
    } finally {
      store.setIsGeneratingPrompts(false)
    }
  }

  // Edit a prompt inline and save to DB
  const handleEditPrompt = async (index: number, newPrompt: string) => {
    const updatedPrompts = [...store.generatedPrompts]
    updatedPrompts[index] = { ...updatedPrompts[index], prompt: newPrompt }
    store.setGeneratedPrompts(updatedPrompts, store.calloutSuggestions)

    if (store.workshopId) {
      await patchWorkshop(store.workshopId, { generated_prompts: updatedPrompts })
    }
  }

  // Toggle selection and save to DB
  const handleToggleSelection = async (index: number) => {
    store.togglePromptSelection(index)
    // Read updated indices after store update
    const current = store.selectedPromptIndices
    const newIndices = current.includes(index)
      ? current.filter((i) => i !== index)
      : [...current, index].sort((a, b) => a - b)

    if (store.workshopId) {
      await patchWorkshop(store.workshopId, { selected_prompt_indices: newIndices })
    }
  }

  // Provider/orientation/model change with DB persist
  const handleProviderChange = async (provider: string) => {
    store.setProvider(provider as 'openai' | 'gemini' | 'higgsfield')
    if (store.workshopId) {
      await patchWorkshop(store.workshopId, { provider })
    }
  }

  const handleOrientationChange = async (orientation: string) => {
    store.setOrientation(orientation as 'square' | 'portrait' | 'landscape')
    if (store.workshopId) {
      await patchWorkshop(store.workshopId, { orientation })
    }
  }

  const handleGeminiModelChange = (model: string | null) => {
    store.setGeminiModel(model)
  }

  const handleHfModelChange = (model: string | null) => {
    store.setHfModel(model)
  }

  // Batch generate images
  const handleBatchGenerate = async () => {
    if (!store.workshopId || selectedCount === 0) return

    const selectedPrompts = store.selectedPromptIndices.map((i) => store.generatedPrompts[i])

    store.setIsBatchGenerating(true)
    store.setBatchProgress(0, selectedCount)

    try {
      const res = await fetch('/api/images/workshop/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: store.workshopId,
          prompts: selectedPrompts.map((p) => ({ prompt: p.prompt, label: p.label })),
          provider: store.provider,
          orientation: store.orientation,
          model_id: getEffectiveModelId(store.provider, store.geminiModel, store.hfModel),
          image_type: 'main',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Batch generation failed')

      const { results, succeeded, failed } = json.data
      const newImages = results
        .filter((r: { image: unknown }) => r.image !== null)
        .map((r: { image: unknown }) => r.image) as LbImageGeneration[]

      store.setWorkshopImages(newImages)
      store.setBatchProgress(succeeded, selectedCount)
      store.setStep(2)

      if (failed > 0) {
        toast.error(`${failed} image(s) failed to generate`)
      }
      toast.success(`${succeeded} images generated!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Batch generation failed')
    } finally {
      store.setIsBatchGenerating(false)
    }
  }

  // Regenerate single image
  const handleRegenerateSingle = async (prompt: WorkshopPrompt) => {
    if (!store.workshopId) return

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.prompt,
          provider: store.provider,
          orientation: store.orientation,
          model_id: getEffectiveModelId(store.provider, store.geminiModel, store.hfModel),
          listing_id: listingId || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Regeneration failed')
      toast.success('Image regenerated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Regeneration failed')
    }
  }

  // Tag helpers
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

    // Save to DB
    if (store.workshopId) {
      const newTags = { ...store.elementTags, [imageId]: [...currentTags, input] }
      patchWorkshop(store.workshopId, { element_tags: newTags })
    }
  }, [tagInputs, store, patchWorkshop])

  const handleRemoveTag = useCallback((imageId: string, tag: string) => {
    const currentTags = store.elementTags[imageId] || []
    const newTagList = currentTags.filter((t) => t !== tag)
    store.setElementTag(imageId, newTagList)

    if (store.workshopId) {
      const newTags = { ...store.elementTags, [imageId]: newTagList }
      patchWorkshop(store.workshopId, { element_tags: newTags })
    }
  }, [store, patchWorkshop])

  // Combine best elements
  const handleCombine = async () => {
    if (!store.workshopId) return

    const allTags = Object.values(store.elementTags).flat()
    const uniqueTags = Array.from(new Set(allTags))

    if (uniqueTags.length === 0) {
      toast.error('Tag at least one standout element first')
      return
    }

    const combined = `Professional Amazon main product image of ${brand} ${productName}. Combine these standout elements: ${uniqueTags.join(', ')}. High-quality studio photography, white background, sharp focus, centered composition.`
    store.setCombinedPrompt(combined)
    store.setIsGeneratingFinal(true)

    try {
      await patchWorkshop(store.workshopId, { element_tags: store.elementTags, step: 3 })

      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: combined,
          provider: store.provider,
          orientation: store.orientation,
          model_id: getEffectiveModelId(store.provider, store.geminiModel, store.hfModel),
          listing_id: listingId || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Final generation failed')

      store.setFinalImage(json.data.image)
      store.setStep(3)
      await patchWorkshop(store.workshopId, { final_image_id: json.data.image.id, step: 3 })
      toast.success('Combined image generated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Final generation failed')
    } finally {
      store.setIsGeneratingFinal(false)
    }
  }

  // Match prompts to images by index (prompts and images generated in order)
  const getImageForPrompt = (promptIndex: number): LbImageGeneration | null => {
    // Images correspond to selected prompts in order
    const selectedIdx = store.selectedPromptIndices.indexOf(promptIndex)
    if (selectedIdx === -1) return null
    return store.workshopImages[selectedIdx] || null
  }

  const hasPrompts = store.generatedPrompts.length > 0
  const hasImages = store.workshopImages.length > 0
  const totalTags = Object.values(store.elementTags).flat().length

  // --- Render ---

  // State 1: No workshop yet
  if (!hasPrompts && !store.isGeneratingPrompts) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Main Image Concepts</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          AI will analyze your research data (keywords, reviews, Q&A) and generate 10-12 diverse
          main image concepts optimized for Amazon CTR.
        </p>
        <Button onClick={handleGeneratePrompts} size="lg" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate Main Image Concepts
        </Button>
      </div>
    )
  }

  // Generating prompts state
  if (store.isGeneratingPrompts) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">
          Analyzing research & generating main image concepts...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {store.generatedPrompts.length} Main Image Concepts
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasImages
              ? 'Tag standout elements on your favorites, then combine the best.'
              : 'Select concepts and generate images. Edit any prompt before generating.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!hasImages && (
            <>
              <Button variant="ghost" size="sm" onClick={store.selectAllPrompts}>
                Select All
              </Button>
              <Badge variant="outline">{selectedCount} selected</Badge>
            </>
          )}
          {hasImages && (
            <Badge variant="secondary">
              <Tag className="h-3 w-3 mr-1" />
              {totalTags} tags
            </Badge>
          )}
        </div>
      </div>

      {/* Provider + Model + Orientation bar */}
      {!hasImages && (
        <ProviderModelBar
          provider={store.provider}
          orientation={store.orientation}
          geminiModel={store.geminiModel}
          hfModel={store.hfModel}
          onProviderChange={handleProviderChange}
          onOrientationChange={handleOrientationChange}
          onGeminiModelChange={handleGeminiModelChange}
          onHfModelChange={handleHfModelChange}
          imageCount={selectedCount}
          costLabel="Estimated Cost"
        />
      )}

      {/* Concept Cards */}
      <div className="space-y-3">
        {store.generatedPrompts.map((p, i) => {
          const image = getImageForPrompt(i)
          return (
            <div key={i}>
              <ConceptCard
                index={i}
                label={p.label}
                prompt={p.prompt}
                approach={p.approach}
                image={image}
                isSelected={store.selectedPromptIndices.includes(i)}
                onToggleSelect={() => handleToggleSelection(i)}
                onEditPrompt={(newPrompt) => handleEditPrompt(i, newPrompt)}
                onRegenerate={image ? () => handleRegenerateSingle(p) : undefined}
                showCheckbox={!hasImages}
              />

              {/* Tagging UI for images that exist */}
              {image && hasImages && (
                <div className="ml-4 mt-2 mb-4 p-3 border-l-2 border-primary/20">
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(store.elementTags[image.id] || []).map((tag) => (
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
                  <div className="flex gap-1">
                    <Input
                      value={tagInputs[image.id] || ''}
                      onChange={(e) => setTagInputs((prev) => ({ ...prev, [image.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddTag(image.id)
                        }
                      }}
                      placeholder="Tag standout element..."
                      className="h-7 text-xs max-w-xs"
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
              )}
            </div>
          )
        })}
      </div>

      {/* Generate / Combine buttons */}
      {!hasImages && (
        <>
          <Button
            onClick={handleBatchGenerate}
            disabled={store.isBatchGenerating || selectedCount === 0}
            className="w-full"
            size="lg"
          >
            {store.isBatchGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating {store.batchProgress.done}/{store.batchProgress.total} images...
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-4 w-4" />
                Generate {selectedCount} Images
              </>
            )}
          </Button>
          {store.isBatchGenerating && (
            <Progress value={(store.batchProgress.done / Math.max(store.batchProgress.total, 1)) * 100} />
          )}
        </>
      )}

      {hasImages && (
        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {totalTags > 0
              ? `${totalTags} elements tagged. Ready to combine.`
              : 'Tag standout elements on images you like, then combine.'}
          </p>
          <Button
            onClick={handleCombine}
            disabled={store.isGeneratingFinal || totalTags === 0}
            size="lg"
          >
            {store.isGeneratingFinal ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating combined image...
              </>
            ) : (
              <>
                Combine Best Elements
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* Final combined image */}
      {store.finalImage && (
        <div className="border-2 border-primary rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Combined Final Image</h3>
          <div className="flex gap-6">
            <div className="w-64 h-64 rounded-lg overflow-hidden border relative group">
              {store.finalImage.preview_url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={store.finalImage.preview_url}
                    alt="Final combined image"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => setShowFinalPreview(true)}
                    className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-zoom-in"
                  >
                    <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                  </button>
                </>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-4">{store.combinedPrompt || store.finalImage.prompt}</p>
              <Badge variant="default">Winner</Badge>
            </div>
          </div>

          {/* Full-size preview dialog */}
          <Dialog open={showFinalPreview} onOpenChange={setShowFinalPreview}>
            <DialogContent className="max-w-4xl w-auto p-2">
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={store.finalImage.full_url || store.finalImage.preview_url || ''}
                  alt="Final combined image"
                  className="w-full max-h-[80vh] object-contain rounded-lg"
                />
                <div className="px-2 pb-2">
                  <p className="text-sm font-medium">Combined Final Image</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {store.combinedPrompt || store.finalImage.prompt}
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  )
}
