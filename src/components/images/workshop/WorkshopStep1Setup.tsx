'use client'

import { useEffect, useState } from 'react'
import { useWorkshopStore } from '@/stores/workshop-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMAGE_ORIENTATION_LABELS } from '@/lib/constants'
import { Loader2, Sparkles, ImageIcon, Check, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProviderInfo } from '@/app/api/images/providers/route'
import { WorkshopProductPhotos } from './WorkshopProductPhotos'
import { CreativeBriefPanel } from './CreativeBriefPanel'
import { ConceptCard, type ConceptMetadataItem } from '@/components/listings/images/ConceptCard'

interface Step1Props {
  listings: Array<{ id: string; title: string | null; generation_context: Record<string, unknown> }>
  categories: Array<{ id: string; name: string; brand: string }>
  countries: Array<{ id: string; name: string; code: string; flag_emoji: string | null }>
}

function getCostPerImage(provider: string, geminiModel: string | null): number {
  if (provider === 'openai') return 3
  if (provider === 'gemini') return geminiModel === 'gemini-2.5-flash-image' ? 2 : 4
  return 0 // higgsfield TBD
}

import type { WorkshopPrompt } from '@/types/api'

/** Build metadata items for the inline bar based on WorkshopPrompt */
function buildMainImageMetadata(p: WorkshopPrompt): ConceptMetadataItem[] {
  const items: ConceptMetadataItem[] = []
  if (p.camera_angle) items.push({ label: 'Camera', value: p.camera_angle })
  if (p.frame_fill) items.push({ label: 'Fill', value: p.frame_fill })
  if (p.lighting) items.push({ label: 'Lighting', value: p.lighting })
  if (p.emotional_target?.length) items.push({ label: 'Mood', value: p.emotional_target.join(', ') })
  return items
}

export function WorkshopStep1Setup({ listings, categories, countries }: Step1Props) {
  const store = useWorkshopStore()

  const [productName, setProductName] = useState('')
  const [brand, setBrand] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [countryId, setCountryId] = useState('')
  const [listingId, setListingId] = useState('')
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  // Fetch enabled providers
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch('/api/images/providers')
        const json = await res.json()
        if (res.ok && json.data?.providers) {
          const enabled = (json.data.providers as ProviderInfo[]).filter((p) => p.enabled)
          setProviders(enabled)
        }
      } catch {
        setProviders([
          { id: 'openai', label: 'GPT Image 1.5', enabled: true, models: [] },
          { id: 'gemini', label: 'Gemini', enabled: true, models: [] },
        ])
      }
    }
    fetchProviders()
  }, [])

  // Auto-fill from listing selection
  const handleListingSelect = (id: string) => {
    setListingId(id)
    const listing = listings.find((l) => l.id === id)
    if (listing?.generation_context) {
      const ctx = listing.generation_context
      if (ctx.productName) setProductName(ctx.productName as string)
      if (ctx.brand) setBrand(ctx.brand as string)
      if (ctx.categoryId) setCategoryId(ctx.categoryId as string)
      if (ctx.countryId) setCountryId(ctx.countryId as string)
    }
  }

  // Auto-fill brand from category
  const handleCategorySelect = (id: string) => {
    setCategoryId(id)
    const cat = categories.find((c) => c.id === id)
    if (cat?.brand && !brand) setBrand(cat.brand)
  }

  const selectedCount = store.selectedPromptIndices.length
  const costPerImage = getCostPerImage(store.provider, store.geminiModel)
  const totalCost = selectedCount * costPerImage

  const currentProviderInfo = providers.find((p) => p.id === store.provider)
  const enabledModels = currentProviderInfo?.models.filter((m) => m.enabled) || []
  const showGeminiModelSelector = store.provider === 'gemini' && enabledModels.length > 1
  const showHiggsModelSelector = store.provider === 'higgsfield' && enabledModels.length > 1

  // Step 1a: Create workshop (no prompts yet)
  const handleCreateWorkshop = async () => {
    if (!productName || !brand || !categoryId || !countryId) {
      toast.error('Please fill in all required fields')
      return
    }

    store.setIsGeneratingPrompts(true)
    try {
      // Create a workshop without generating prompts — use PATCH to set up a blank workshop
      const res = await fetch('/api/images/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_id: categoryId,
          country_id: countryId,
          listing_id: listingId || undefined,
          workshop_id: store.workshopId || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate prompts')

      const { workshop, prompts, callout_suggestions } = json.data
      store.setWorkshopId(workshop.id)
      store.setWorkshop(workshop)
      store.setGeneratedPrompts(prompts, callout_suggestions)
      store.setCalloutTexts(callout_suggestions)
      toast.success(`Generated ${prompts.length} image prompts!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate prompts')
    } finally {
      store.setIsGeneratingPrompts(false)
    }
  }

  // Regenerate prompts (with creative brief)
  const handleRegeneratePrompts = async () => {
    if (!productName && !store.workshop?.product_name) return

    const pName = productName || store.workshop?.product_name || ''
    const pBrand = brand || store.workshop?.brand || ''
    const pCatId = categoryId || store.workshop?.category_id || ''
    const pCountryId = countryId || store.workshop?.country_id || ''

    store.setIsGeneratingPrompts(true)
    try {
      const res = await fetch('/api/images/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: pName,
          brand: pBrand,
          category_id: pCatId,
          country_id: pCountryId,
          listing_id: listingId || store.workshop?.listing_id || undefined,
          workshop_id: store.workshopId || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to regenerate prompts')

      const { workshop, prompts, callout_suggestions } = json.data
      store.setWorkshopId(workshop.id)
      store.setWorkshop(workshop)
      store.setGeneratedPrompts(prompts, callout_suggestions)
      store.setCalloutTexts(callout_suggestions)
      toast.success(`Regenerated ${prompts.length} image prompts!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate')
    } finally {
      store.setIsGeneratingPrompts(false)
    }
  }

  // Step 1b: Batch Generate Images
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
          model_id: store.provider === 'gemini'
            ? (store.geminiModel || enabledModels[0]?.id || 'gemini-3-pro-image-preview')
            : store.provider === 'higgsfield'
              ? (store.hfModel || enabledModels[0]?.id || 'nano-banana-pro')
              : undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Batch generation failed')

      const { results, succeeded, failed } = json.data
      const images = results
        .filter((r: { image: unknown }) => r.image !== null)
        .map((r: { image: unknown }) => r.image)

      store.setWorkshopImages(images)
      store.setBatchProgress(succeeded, selectedCount)
      store.setStep(2)

      if (failed > 0) {
        toast.error(`${failed} image(s) failed to generate`)
      }
      toast.success(`${succeeded} images generated! Review them below.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Batch generation failed')
    } finally {
      store.setIsBatchGenerating(false)
    }
  }

  const hasPrompts = store.generatedPrompts.length > 0
  const hasWorkshop = !!store.workshopId

  return (
    <div className="space-y-6">
      {/* Setup Form */}
      {!hasPrompts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border rounded-lg">
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold mb-1">Product Setup</h2>
            <p className="text-sm text-muted-foreground">
              Select a product or enter details. AI will use your research data to generate diverse image prompts.
            </p>
          </div>

          {/* Listing Dropdown (optional) */}
          <div className="md:col-span-2">
            <Label>From Existing Listing (optional)</Label>
            <Select value={listingId} onValueChange={handleListingSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a listing to auto-fill..." />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title || 'Untitled'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product Name */}
          <div>
            <Label>Product Name *</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., 20-Pack Chalk Markers Fine Tip"
            />
          </div>

          {/* Brand */}
          <div>
            <Label>Brand *</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g., Chalkola"
            />
          </div>

          {/* Category */}
          <div>
            <Label>Category *</Label>
            <Select value={categoryId} onValueChange={handleCategorySelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.brand})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Country */}
          <div>
            <Label>Marketplace *</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select marketplace..." />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji} {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Prompts Button */}
          <div className="md:col-span-2">
            <Button
              onClick={handleCreateWorkshop}
              disabled={store.isGeneratingPrompts || !productName || !brand || !categoryId || !countryId}
              className="w-full"
              size="lg"
            >
              {store.isGeneratingPrompts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing research & generating prompts...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate AI Image Prompts
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* After workshop created: Photos + Brief + Prompts */}
      {hasWorkshop && hasPrompts && (
        <div className="space-y-6">
          {/* Product Photos Section */}
          <WorkshopProductPhotos />

          {/* Creative Brief Section */}
          <CreativeBriefPanel
            categoryId={categoryId || store.workshop?.category_id || ''}
            countryId={countryId || store.workshop?.country_id || ''}
            listingId={listingId || store.workshop?.listing_id || undefined}
          />

          {/* Regenerate button (uses creative brief) */}
          {store.creativeBrief && (
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                onClick={handleRegeneratePrompts}
                disabled={store.isGeneratingPrompts}
              >
                {store.isGeneratingPrompts ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Regenerate Prompts with Creative Brief
              </Button>
            </div>
          )}

          {/* Prompts Section Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {store.generatedPrompts.length} Image Prompts Generated
              </h2>
              <p className="text-sm text-muted-foreground">
                Toggle prompts on/off, then generate all selected images.
                {store.creativeBrief && ' Prompts are informed by your Creative Brief.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={store.selectAllPrompts}>
                Select All
              </Button>
              <Badge variant="outline">
                {selectedCount} selected
              </Badge>
            </div>
          </div>

          {/* Provider & Orientation */}
          <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Provider</Label>
              <Select
                value={store.provider}
                onValueChange={(v) => {
                  store.setProvider(v as 'openai' | 'gemini' | 'higgsfield')
                  if (v !== 'gemini') store.setGeminiModel(null)
                  if (v !== 'higgsfield') store.setHfModel(null)
                }}
              >
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
            {showGeminiModelSelector && (
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Model</Label>
                <Select
                  value={store.geminiModel || enabledModels[0]?.id || ''}
                  onValueChange={(v) => store.setGeminiModel(v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {showHiggsModelSelector && (
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Model</Label>
                <Select
                  value={store.hfModel || enabledModels[0]?.id || ''}
                  onValueChange={(v) => store.setHfModel(v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1 min-w-[140px]">
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
            <div className="text-right">
              <Label className="text-xs">Estimated Cost</Label>
              <p className="text-sm font-mono font-semibold">
                {totalCost > 0 ? `${totalCost}\u00A2` : 'Free'}
              </p>
            </div>
          </div>

          {/* Prompt Cards — now using ConceptCard with metadata bar */}
          <div className="space-y-3">
            {store.generatedPrompts.map((p, i) => {
              const isSelected = store.selectedPromptIndices.includes(i)
              return (
                <ConceptCard
                  key={i}
                  index={i}
                  label={p.label}
                  prompt={p.prompt}
                  approach={p.approach}
                  isSelected={isSelected}
                  onToggleSelect={() => store.togglePromptSelection(i)}
                  onEditPrompt={(newPrompt) => {
                    const updated = [...store.generatedPrompts]
                    updated[i] = { ...updated[i], prompt: newPrompt }
                    store.setGeneratedPrompts(updated, store.calloutSuggestions)
                  }}
                  imageType="main"
                  metadata={buildMainImageMetadata(p)}
                  colorSwatches={p.color_direction ? undefined : undefined}
                  details={[
                    { label: 'Camera Angle', value: p.camera_angle || '' },
                    { label: 'Lighting', value: p.lighting || '' },
                    { label: 'Frame Fill', value: p.frame_fill || '' },
                    { label: 'Color Direction', value: p.color_direction || '' },
                    { label: 'Mood', value: p.emotional_target || [] },
                    { label: 'Props', value: p.props || [] },
                    { label: 'Post-Processing', value: p.post_processing || '' },
                    { label: 'Callout', value: p.callout || '' },
                    { label: 'Compliance', value: p.compliance_notes || '' },
                  ]}
                />
              )
            })}
          </div>

          {/* Batch Generate Button */}
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
                {totalCost > 0 && ` (${totalCost}\u00A2)`}
              </>
            )}
          </Button>

          {store.isBatchGenerating && (
            <Progress value={(store.batchProgress.done / Math.max(store.batchProgress.total, 1)) * 100} />
          )}
        </div>
      )}
    </div>
  )
}
