'use client'

import { useEffect, useState, useCallback } from 'react'
import { ConceptCard } from './ConceptCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMAGE_ORIENTATION_LABELS } from '@/lib/constants'
import { Loader2, Sparkles, Palette, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbImageGeneration, LbImageWorkshop } from '@/types/database'
import type { SwatchConcept, SwatchVariant } from '@/types/api'
import type { ProviderInfo } from '@/app/api/images/providers/route'

interface SwatchImageSectionProps {
  listingId?: string | null
  categoryId: string
  countryId: string
  productName: string
  brand: string
  workshops: LbImageWorkshop[]
  images: LbImageGeneration[]
}

const COST_PER_IMAGE: Record<string, number> = {
  dalle3: 4,
  gemini: 2,
  higgsfield: 0,
}

const MAX_VARIANTS = 20

const EMPTY_VARIANT: SwatchVariant = { name: '', color_hex: '', material: '', description: '' }

export function SwatchImageSection({
  listingId,
  categoryId,
  countryId,
  productName,
  brand,
  workshops,
  images,
}: SwatchImageSectionProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [concepts, setConcepts] = useState<SwatchConcept[]>([])
  const [workshopId, setWorkshopId] = useState<string | null>(null)
  const [conceptImages, setConceptImages] = useState<Record<number, LbImageGeneration>>({})
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)
  const [generatingPositions, setGeneratingPositions] = useState<Set<number>>(new Set())
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [provider, setProvider] = useState<'dalle3' | 'gemini' | 'higgsfield'>('gemini')
  const [orientation, setOrientation] = useState<'square' | 'portrait' | 'landscape'>('square')

  // Variant input state
  const [variants, setVariants] = useState<SwatchVariant[]>([{ ...EMPTY_VARIANT }])

  // Find existing swatch workshop
  const existingWorkshop = workshops.find((w) => w.image_type === 'swatch')
  const existingImages = existingWorkshop
    ? images.filter((img) => img.workshop_id === existingWorkshop.id)
    : []

  // Hydrate from DB on mount
  useEffect(() => {
    if (existingWorkshop) {
      setWorkshopId(existingWorkshop.id)
      setConcepts((existingWorkshop.generated_prompts || []) as SwatchConcept[])
      setProvider(existingWorkshop.provider || 'gemini')
      setOrientation(existingWorkshop.orientation || 'square')

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

  // Fetch providers
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch('/api/images/providers')
        const json = await res.json()
        if (res.ok && json.data?.providers) {
          setProviders((json.data.providers as ProviderInfo[]).filter((p) => p.enabled))
        }
      } catch {
        setProviders([
          { id: 'dalle3', label: 'DALL-E 3', enabled: true, models: [] },
          { id: 'gemini', label: 'Gemini', enabled: true, models: [] },
        ])
      }
    }
    fetchProviders()
  }, [])

  // Save preference to DB
  const patchWorkshop = useCallback(async (wId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/images/workshop/${wId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }, [])

  // --- Variant Input Handlers ---

  const updateVariant = (index: number, field: keyof SwatchVariant, value: string) => {
    setVariants((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) {
      toast.error(`Maximum ${MAX_VARIANTS} variants`)
      return
    }
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }])
  }

  const removeVariant = (index: number) => {
    if (variants.length <= 1) return
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  const hasValidVariants = variants.some((v) => v.name.trim())

  // --- Generation Handlers ---

  const handleGenerateConcepts = async () => {
    if (!hasValidVariants) return

    setIsGeneratingPrompts(true)
    try {
      const res = await fetch('/api/images/workshop/swatch-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_id: categoryId,
          country_id: countryId,
          listing_id: listingId || undefined,
          variants: variants.filter((v) => v.name.trim()),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate swatch prompts')

      const { workshop, concepts: newConcepts } = json.data
      setWorkshopId(workshop.id)
      setConcepts(newConcepts)
      toast.success(`Generated ${newConcepts.length} swatch prompts!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate swatch prompts')
    } finally {
      setIsGeneratingPrompts(false)
    }
  }

  const handleEditConcept = async (index: number, newPrompt: string) => {
    const updatedConcepts = [...concepts]
    updatedConcepts[index] = { ...updatedConcepts[index], prompt: newPrompt }
    setConcepts(updatedConcepts)

    if (workshopId) {
      await patchWorkshop(workshopId, { generated_prompts: updatedConcepts })
    }
  }

  const handleGenerateSingle = async (concept: SwatchConcept) => {
    if (!workshopId) return

    setGeneratingPositions((prev) => new Set(prev).add(concept.position))
    try {
      const res = await fetch('/api/images/workshop/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: workshopId,
          prompts: [{ prompt: concept.prompt, label: concept.variant_name, position: concept.position }],
          provider,
          orientation,
          image_type: 'swatch',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Generation failed')

      const result = json.data.results[0]
      if (result?.image) {
        setConceptImages((prev) => ({ ...prev, [concept.position]: result.image }))
        toast.success(`"${concept.variant_name}" swatch generated!`)
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

  const handleGenerateAll = async () => {
    if (!workshopId || concepts.length === 0) return

    const ungeneratedConcepts = concepts.filter((c) => !conceptImages[c.position])
    if (ungeneratedConcepts.length === 0) {
      toast.success('All swatches already generated!')
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
            label: c.variant_name,
            position: c.position,
          })),
          provider,
          orientation,
          image_type: 'swatch',
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
        toast.error(`${failed} swatch(es) failed`)
      }
      toast.success(`${succeeded} swatch images generated!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Batch generation failed')
    } finally {
      setIsBatchGenerating(false)
    }
  }

  const handleStartOver = async () => {
    if (workshopId) {
      await fetch(`/api/images/workshop/${workshopId}`, { method: 'DELETE' })
    }
    setWorkshopId(null)
    setConcepts([])
    setConceptImages({})
    setVariants([{ ...EMPTY_VARIANT }])
  }

  const handleProviderChange = async (p: string) => {
    const val = p as 'dalle3' | 'gemini' | 'higgsfield'
    setProvider(val)
    if (workshopId) await patchWorkshop(workshopId, { provider: val })
  }

  const handleOrientationChange = async (o: string) => {
    const val = o as 'square' | 'portrait' | 'landscape'
    setOrientation(val)
    if (workshopId) await patchWorkshop(workshopId, { orientation: val })
  }

  const generatedCount = Object.keys(conceptImages).length
  const totalConcepts = concepts.length
  const costPerImage = COST_PER_IMAGE[provider] || 0

  // --- Stage 1: Variant Input ---

  if (!concepts.length && !isGeneratingPrompts) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Palette className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Swatch Image Generator</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Enter your product variants below. AI will generate consistent swatch image
            prompts for each one — same angle, lighting, and composition across all variants.
          </p>
        </div>

        {/* Variant Input Form */}
        <div className="space-y-4">
          {variants.map((variant, i) => (
            <div
              key={i}
              className="p-4 border rounded-lg space-y-3 relative"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Variant {i + 1}
                </span>
                {variants.length > 1 && (
                  <button
                    onClick={() => removeVariant(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input
                    placeholder="e.g., Crimson Red"
                    value={variant.name}
                    onChange={(e) => updateVariant(i, 'name', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Hex Color</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#FF0000"
                      value={variant.color_hex || ''}
                      onChange={(e) => updateVariant(i, 'color_hex', e.target.value)}
                      className="h-9 flex-1"
                    />
                    {variant.color_hex && /^#[0-9a-fA-F]{6}$/.test(variant.color_hex) && (
                      <div
                        className="h-9 w-9 rounded border flex-shrink-0"
                        style={{ backgroundColor: variant.color_hex }}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Material</Label>
                  <Input
                    placeholder="e.g., Matte, Wood"
                    value={variant.material || ''}
                    onChange={(e) => updateVariant(i, 'material', e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  placeholder="e.g., Deep red with matte finish, metallic sheen"
                  value={variant.description || ''}
                  onChange={(e) => updateVariant(i, 'description', e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={addVariant}
              disabled={variants.length >= MAX_VARIANTS}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Variant
              {variants.length >= MAX_VARIANTS && ` (max ${MAX_VARIANTS})`}
            </Button>
            <span className="text-xs text-muted-foreground">
              {variants.filter((v) => v.name.trim()).length} variant(s) ready
            </span>
          </div>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerateConcepts}
          disabled={!hasValidVariants}
          size="lg"
          className="w-full gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Generate Swatch Prompts
        </Button>
      </div>
    )
  }

  // --- Loading ---

  if (isGeneratingPrompts) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">
          Generating swatch image prompts for {variants.filter((v) => v.name.trim()).length} variants...
        </p>
      </div>
    )
  }

  // --- Stage 2: Concepts + Generation ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Swatch Image Concepts</h3>
          <p className="text-sm text-muted-foreground">
            Generate swatches individually or all at once. Edit any prompt before generating.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">
            {generatedCount}/{totalConcepts} generated
          </Badge>
          <Button variant="ghost" size="sm" onClick={handleStartOver}>
            Start Over
          </Button>
        </div>
      </div>

      {/* Provider + Orientation bar */}
      <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex-1">
          <Label className="text-xs">Provider</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="text-xs">Orientation</Label>
          <Select value={orientation} onValueChange={handleOrientationChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(IMAGE_ORIENTATION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label as string}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-right">
          <Label className="text-xs">Cost per Image</Label>
          <p className="text-sm font-mono font-semibold">
            {costPerImage > 0 ? `${costPerImage}\u00A2` : 'Free'}
          </p>
        </div>
      </div>

      {/* Concept Cards */}
      <div className="space-y-3">
        {concepts.map((concept, i) => {
          const image = conceptImages[concept.position] || null
          const isGeneratingThis = generatingPositions.has(concept.position)

          return (
            <ConceptCard
              key={concept.position}
              index={i}
              label={`${concept.position}. ${concept.variant_name}`}
              prompt={concept.prompt}
              image={image}
              isSelected={true}
              isGenerating={isGeneratingThis}
              onToggleSelect={() => {}}
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
        disabled={isBatchGenerating || generatedCount >= totalConcepts}
        className="w-full"
        size="lg"
      >
        {isBatchGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating {batchProgress.done}/{batchProgress.total} swatches...
          </>
        ) : generatedCount >= totalConcepts ? (
          <>All {totalConcepts} swatches generated</>
        ) : (
          <>
            <Palette className="mr-2 h-4 w-4" />
            Generate All Remaining ({totalConcepts - generatedCount} swatches)
            {costPerImage > 0 && ` — ${(totalConcepts - generatedCount) * costPerImage}\u00A2`}
          </>
        )}
      </Button>
      {isBatchGenerating && (
        <Progress value={(batchProgress.done / Math.max(batchProgress.total, 1)) * 100} />
      )}
    </div>
  )
}
