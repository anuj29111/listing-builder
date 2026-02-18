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
import { Loader2, Sparkles, ImageIcon, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ProviderInfo } from '@/app/api/images/providers/route'

interface Step1Props {
  listings: Array<{ id: string; title: string | null; generation_context: Record<string, unknown> }>
  categories: Array<{ id: string; name: string; brand: string }>
  countries: Array<{ id: string; name: string; code: string; flag_emoji: string | null }>
}

function getCostPerImage(provider: string, geminiModel: string | null): number {
  if (provider === 'openai') return 3
  if (provider === 'gemini') return geminiModel === 'gemini-3-pro-image-preview' ? 4 : 2
  return 0 // higgsfield TBD
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

  // Step 1a: Generate AI Prompts
  const handleGeneratePrompts = async () => {
    if (!productName || !brand || !categoryId || !countryId) {
      toast.error('Please fill in all required fields')
      return
    }

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
            ? (store.geminiModel || enabledModels[0]?.id || 'gemini-2.5-flash-image')
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
              onClick={handleGeneratePrompts}
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

      {/* Generated Prompts Checklist */}
      {hasPrompts && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {store.generatedPrompts.length} Image Prompts Generated
              </h2>
              <p className="text-sm text-muted-foreground">
                Toggle prompts on/off, then generate all selected images.
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

          {/* Prompt Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {store.generatedPrompts.map((p, i) => {
              const isSelected = store.selectedPromptIndices.includes(i)
              return (
                <button
                  key={i}
                  onClick={() => store.togglePromptSelection(i)}
                  className={`text-left p-4 border rounded-lg transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-muted opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                    }`}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{p.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          {p.approach}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {p.prompt}
                      </p>
                    </div>
                  </div>
                </button>
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
