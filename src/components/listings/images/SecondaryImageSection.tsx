'use client'

import { useEffect, useState, useCallback } from 'react'
import { ConceptCard } from './ConceptCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ProviderModelBar, getEffectiveModelId } from './ProviderModelBar'
import { ImageStackRecommendations } from './ImageStackRecommendations'
import { Loader2, Sparkles, ImageIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbImageGeneration, LbImageWorkshop } from '@/types/database'
import type { SecondaryImageConcept } from '@/types/api'

interface SecondaryImageSectionProps {
  listingId?: string | null
  categoryId: string
  countryId: string
  productName: string
  brand: string
  workshops: LbImageWorkshop[]
  images: LbImageGeneration[]
}

export function SecondaryImageSection({
  listingId,
  categoryId,
  countryId,
  productName,
  brand,
  workshops,
  images,
}: SecondaryImageSectionProps) {
  const [concepts, setConcepts] = useState<SecondaryImageConcept[]>([])
  const [workshopId, setWorkshopId] = useState<string | null>(null)
  const [conceptImages, setConceptImages] = useState<Record<number, LbImageGeneration>>({})
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)
  const [generatingPositions, setGeneratingPositions] = useState<Set<number>>(new Set())
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'higgsfield'>('gemini')
  const [orientation, setOrientation] = useState<'square' | 'portrait' | 'landscape'>('square')
  const [geminiModel, setGeminiModel] = useState<string | null>(null)
  const [hfModel, setHfModel] = useState<string | null>(null)

  // Find existing secondary workshop
  const existingWorkshop = workshops.find((w) => w.image_type === 'secondary')
  const existingImages = existingWorkshop
    ? images.filter((img) => img.workshop_id === existingWorkshop.id)
    : []

  // Hydrate from DB on mount
  useEffect(() => {
    if (existingWorkshop) {
      setWorkshopId(existingWorkshop.id)
      setConcepts((existingWorkshop.generated_prompts || []) as SecondaryImageConcept[])
      setProvider(existingWorkshop.provider || 'gemini')
      setOrientation(existingWorkshop.orientation || 'square')

      // Map images by position
      const imageMap: Record<number, LbImageGeneration> = {}
      for (const img of existingImages) {
        if (img.position != null) {
          imageMap[img.position] = img
        }
      }
      setConceptImages(imageMap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingWorkshop?.id])

  // Save preference to DB
  const patchWorkshop = useCallback(async (wId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/images/workshop/${wId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }, [])

  // Generate secondary concepts
  const handleGenerateConcepts = async () => {
    setIsGeneratingPrompts(true)
    try {
      const res = await fetch('/api/images/workshop/secondary-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_id: categoryId,
          country_id: countryId,
          listing_id: listingId || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate concepts')

      const { workshop, concepts: newConcepts } = json.data
      setWorkshopId(workshop.id)
      setConcepts(newConcepts)
      toast.success(`Generated ${newConcepts.length} secondary image concepts!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate concepts')
    } finally {
      setIsGeneratingPrompts(false)
    }
  }

  // Edit a concept prompt and save to DB
  const handleEditConcept = async (index: number, newPrompt: string) => {
    const updatedConcepts = [...concepts]
    updatedConcepts[index] = { ...updatedConcepts[index], prompt: newPrompt }
    setConcepts(updatedConcepts)

    if (workshopId) {
      await patchWorkshop(workshopId, { generated_prompts: updatedConcepts })
    }
  }

  // Generate single image
  const handleGenerateSingle = async (concept: SecondaryImageConcept) => {
    if (!workshopId) return

    setGeneratingPositions((prev) => new Set(prev).add(concept.position))
    try {
      const res = await fetch('/api/images/workshop/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: workshopId,
          prompts: [{ prompt: concept.prompt, label: concept.title, position: concept.position }],
          provider,
          orientation,
          model_id: getEffectiveModelId(provider, geminiModel, hfModel),
          image_type: 'secondary',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generation failed')

      const result = json.data.results[0]
      if (result?.image) {
        setConceptImages((prev) => ({ ...prev, [concept.position]: result.image }))
        toast.success(`"${concept.title}" generated!`)
      } else {
        throw new Error(result?.error || 'Generation failed')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGeneratingPositions((prev) => {
        const next = new Set(prev)
        next.delete(concept.position)
        return next
      })
    }
  }

  // Generate all images
  const handleGenerateAll = async () => {
    if (!workshopId || concepts.length === 0) return

    const ungeneratedConcepts = concepts.filter((c) => !conceptImages[c.position])
    if (ungeneratedConcepts.length === 0) {
      toast.success('All images already generated!')
      return
    }

    setIsBatchGenerating(true)
    setBatchProgress({ done: 0, total: ungeneratedConcepts.length })

    try {
      const res = await fetch('/api/images/workshop/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: workshopId,
          prompts: ungeneratedConcepts.map((c) => ({
            prompt: c.prompt,
            label: c.title,
            position: c.position,
          })),
          provider,
          orientation,
          model_id: getEffectiveModelId(provider, geminiModel, hfModel),
          image_type: 'secondary',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Batch generation failed')

      const { results, succeeded, failed } = json.data
      const newImageMap = { ...conceptImages }
      for (const result of results) {
        if (result.image) {
          const img = result.image as LbImageGeneration
          if (img.position != null) {
            newImageMap[img.position] = img
          }
        }
      }
      setConceptImages(newImageMap)
      setBatchProgress({ done: succeeded, total: ungeneratedConcepts.length })

      if (failed > 0) {
        toast.error(`${failed} image(s) failed`)
      }
      toast.success(`${succeeded} secondary images generated!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Batch generation failed')
    } finally {
      setIsBatchGenerating(false)
    }
  }

  const handleProviderChange = async (p: string) => {
    const val = p as 'openai' | 'gemini' | 'higgsfield'
    setProvider(val)
    if (workshopId) await patchWorkshop(workshopId, { provider: val })
  }

  const handleOrientationChange = async (o: string) => {
    const val = o as 'square' | 'portrait' | 'landscape'
    setOrientation(val)
    if (workshopId) await patchWorkshop(workshopId, { orientation: val })
  }

  const handleGeminiModelChange = (model: string | null) => {
    setGeminiModel(model)
  }

  const handleHfModelChange = (model: string | null) => {
    setHfModel(model)
  }

  const generatedCount = Object.keys(conceptImages).length

  // --- Render ---

  if (!concepts.length && !isGeneratingPrompts) {
    return (
      <div className="space-y-6">
        {/* AI Recommendations (optional step before generating) */}
        <ImageStackRecommendations
          categoryId={categoryId}
          countryId={countryId}
        />

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Secondary Image Concepts</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            AI will generate 9 secondary image concepts — lifestyle, infographic, how-to, comparison,
            and more — all driven by your research data and listing content.
          </p>
          <Button onClick={handleGenerateConcepts} size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Secondary Concepts
          </Button>
        </div>
      </div>
    )
  }

  if (isGeneratingPrompts) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">
          Analyzing research & generating secondary image concepts...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">9 Secondary Image Concepts</h3>
          <p className="text-sm text-muted-foreground">
            Generate images individually or all at once. Edit any concept before generating.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">
            {generatedCount}/9 generated
          </Badge>
        </div>
      </div>

      {/* Provider + Model + Orientation bar */}
      <ProviderModelBar
        provider={provider}
        orientation={orientation}
        geminiModel={geminiModel}
        hfModel={hfModel}
        onProviderChange={handleProviderChange}
        onOrientationChange={handleOrientationChange}
        onGeminiModelChange={handleGeminiModelChange}
        onHfModelChange={handleHfModelChange}
      />

      {/* Concept Cards */}
      <div className="space-y-3">
        {concepts.map((concept, i) => {
          const image = conceptImages[concept.position] || null
          const isGeneratingThis = generatingPositions.has(concept.position)

          return (
            <ConceptCard
              key={concept.position}
              index={i}
              label={`${concept.position}. ${concept.title}`}
              prompt={concept.prompt}
              approach={concept.headline}
              image={image}
              isSelected={true}
              isGenerating={isGeneratingThis}
              onToggleSelect={() => {}} // No selection for secondary
              onEditPrompt={(newPrompt) => handleEditConcept(i, newPrompt)}
              onRegenerate={image ? () => handleGenerateSingle(concept) : undefined}
              onGenerate={!image ? () => handleGenerateSingle(concept) : undefined}
              showCheckbox={false}
            />
          )
        })}
      </div>

      {/* Generate All button */}
      <Button
        onClick={handleGenerateAll}
        disabled={isBatchGenerating || generatedCount >= 9}
        className="w-full"
        size="lg"
      >
        {isBatchGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating {batchProgress.done}/{batchProgress.total} images...
          </>
        ) : generatedCount >= 9 ? (
          <>All 9 images generated</>
        ) : (
          <>
            <ImageIcon className="mr-2 h-4 w-4" />
            Generate All Remaining ({9 - generatedCount} images)
          </>
        )}
      </Button>
      {isBatchGenerating && (
        <Progress value={(batchProgress.done / Math.max(batchProgress.total, 1)) * 100} />
      )}
    </div>
  )
}
