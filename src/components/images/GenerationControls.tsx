'use client'

import { useEffect, useState } from 'react'
import { useImageStore } from '@/stores/image-store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMAGE_ORIENTATION_LABELS } from '@/lib/constants'
import { Loader2, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbImageGeneration } from '@/types/database'
import type { ProviderInfo } from '@/app/api/images/providers/route'

interface GenerationControlsProps {
  onGenerated: (image: LbImageGeneration) => void
}

export function GenerationControls({ onGenerated }: GenerationControlsProps) {
  const prompt = useImageStore((s) => s.prompt)
  const provider = useImageStore((s) => s.provider)
  const higgsFieldModel = useImageStore((s) => s.higgsFieldModel)
  const orientation = useImageStore((s) => s.orientation)
  const listingId = useImageStore((s) => s.listingId)
  const isGenerating = useImageStore((s) => s.isGenerating)
  const setProvider = useImageStore((s) => s.setProvider)
  const setHiggsFieldModel = useImageStore((s) => s.setHiggsFieldModel)
  const setOrientation = useImageStore((s) => s.setOrientation)
  const setIsGenerating = useImageStore((s) => s.setIsGenerating)

  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)

  // Fetch enabled providers on mount
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch('/api/images/providers')
        const json = await res.json()
        if (res.ok && json.data?.providers) {
          const enabled = (json.data.providers as ProviderInfo[]).filter((p) => p.enabled)
          setProviders(enabled)

          // If current provider is not enabled, switch to first enabled
          const currentEnabled = enabled.find((p) => p.id === provider)
          if (!currentEnabled && enabled.length > 0) {
            setProvider(enabled[0].id as 'dalle3' | 'gemini' | 'higgsfield')
          }
        }
      } catch {
        // Fallback: show dalle3 and gemini
        setProviders([
          { id: 'dalle3', label: 'DALL-E 3 (OpenAI)', enabled: true, models: [] },
          { id: 'gemini', label: 'Gemini (Google)', enabled: true, models: [] },
        ])
      } finally {
        setLoadingProviders(false)
      }
    }
    fetchProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentProviderInfo = providers.find((p) => p.id === provider)
  const enabledHiggsModels = currentProviderInfo?.models.filter((m) => m.enabled) || []

  // Show Higgsfield model selector when higgsfield is selected and has multiple enabled models
  const showModelSelector = provider === 'higgsfield' && enabledHiggsModels.length > 1

  const costEstimate = provider === 'dalle3' ? '~4c' : provider === 'gemini' ? '~2c' : 'TBD'

  const handleGenerate = async () => {
    if (!prompt || prompt.trim().length < 5) {
      toast.error('Prompt must be at least 5 characters')
      return
    }

    setIsGenerating(true)
    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        provider,
        orientation,
        listing_id: listingId || undefined,
      }

      // Add model_id for Higgsfield
      if (provider === 'higgsfield') {
        body.model_id = higgsFieldModel || enabledHiggsModels[0]?.id || 'higgsfield-ai/soul/standard'
      }

      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onGenerated(json.data.image)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="text-sm font-medium">Generation Settings</h3>

      <div>
        <Label className="text-xs">AI Provider</Label>
        {loadingProviders ? (
          <div className="mt-1 h-10 rounded-md border bg-muted animate-pulse" />
        ) : providers.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No providers enabled. Contact admin.</p>
        ) : (
          <Select
            value={provider}
            onValueChange={(v) => {
              setProvider(v as 'dalle3' | 'gemini' | 'higgsfield')
              // Reset higgsfield model when switching providers
              if (v !== 'higgsfield') {
                setHiggsFieldModel(null)
              }
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Higgsfield model sub-selector */}
      {showModelSelector && (
        <div>
          <Label className="text-xs">Higgsfield Model</Label>
          <Select
            value={higgsFieldModel || enabledHiggsModels[0]?.id || ''}
            onValueChange={(v) => setHiggsFieldModel(v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {enabledHiggsModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Show single model name when only one is enabled */}
      {provider === 'higgsfield' && enabledHiggsModels.length === 1 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          Model: {enabledHiggsModels[0].label}
        </div>
      )}

      <div>
        <Label className="text-xs">Orientation</Label>
        <Select value={orientation} onValueChange={(v) => setOrientation(v as 'square' | 'portrait' | 'landscape')}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(IMAGE_ORIENTATION_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
        Estimated cost: {costEstimate} per image
      </div>

      <Button
        className="w-full"
        onClick={handleGenerate}
        disabled={isGenerating || !prompt || prompt.trim().length < 5 || providers.length === 0}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4 mr-2" />
            Generate Image
          </>
        )}
      </Button>
    </div>
  )
}
