'use client'

import { useEffect, useState, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IMAGE_ORIENTATION_LABELS } from '@/lib/constants'
import type { ProviderInfo } from '@/app/api/images/providers/route'

interface ProviderModelBarProps {
  provider: string
  orientation: string
  geminiModel: string | null
  hfModel: string | null
  onProviderChange: (provider: string) => void
  onOrientationChange: (orientation: string) => void
  onGeminiModelChange: (model: string | null) => void
  onHfModelChange: (model: string | null) => void
  /** Number of selected/remaining images for cost calculation */
  imageCount?: number
  /** Label for cost display, e.g. "Estimated Cost" or "Cost per Image" */
  costLabel?: string
}

function getCostPerImage(provider: string, geminiModel: string | null): number {
  if (provider === 'openai') return 3
  if (provider === 'gemini') {
    return geminiModel === 'gemini-2.5-flash-image' ? 2 : 4
  }
  return 0 // higgsfield uses Creator plan credits (free)
}

export function ProviderModelBar({
  provider,
  orientation,
  geminiModel,
  hfModel,
  onProviderChange,
  onOrientationChange,
  onGeminiModelChange,
  onHfModelChange,
  imageCount,
  costLabel = 'Cost per Image',
}: ProviderModelBarProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])

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
          { id: 'openai', label: 'GPT Image 1.5', enabled: true, models: [] },
          { id: 'gemini', label: 'Gemini', enabled: true, models: [] },
        ])
      }
    }
    fetchProviders()
  }, [])

  const currentProviderInfo = providers.find((p) => p.id === provider)
  const enabledModels = currentProviderInfo?.models.filter((m) => m.enabled) || []
  const showGeminiModelSelector = provider === 'gemini' && enabledModels.length > 1
  const showHiggsModelSelector = provider === 'higgsfield' && enabledModels.length > 1

  // Auto-select first enabled model when switching providers
  const handleProviderChange = useCallback((newProvider: string) => {
    onProviderChange(newProvider)
    if (newProvider !== 'gemini') {
      onGeminiModelChange(null)
    }
    if (newProvider !== 'higgsfield') {
      onHfModelChange(null)
    }
  }, [onProviderChange, onGeminiModelChange, onHfModelChange])

  const costPerImage = getCostPerImage(provider, geminiModel)
  const totalCost = imageCount != null ? imageCount * costPerImage : costPerImage
  const showTotal = imageCount != null && imageCount > 1

  // Get active model label for display under provider when only 1 model
  const singleModelLabel = provider === 'gemini' && enabledModels.length === 1
    ? enabledModels[0].label
    : provider === 'higgsfield' && enabledModels.length === 1
      ? enabledModels[0].label
      : null

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30 flex-wrap">
      <div className="flex-1 min-w-[140px]">
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
        {singleModelLabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">
            Model: {singleModelLabel}
          </p>
        )}
      </div>

      {showGeminiModelSelector && (
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs">Model</Label>
          <Select
            value={geminiModel || enabledModels[0]?.id || ''}
            onValueChange={(v) => onGeminiModelChange(v)}
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
            value={hfModel || enabledModels[0]?.id || ''}
            onValueChange={(v) => onHfModelChange(v)}
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
        <Select value={orientation} onValueChange={onOrientationChange}>
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
        <Label className="text-xs">{costLabel}</Label>
        <p className="text-sm font-mono font-semibold">
          {costPerImage > 0
            ? showTotal ? `${totalCost}\u00A2` : `${costPerImage}\u00A2`
            : 'Free'}
        </p>
      </div>
    </div>
  )
}

/** Helper to get the effective model_id for API calls */
export function getEffectiveModelId(
  provider: string,
  geminiModel: string | null,
  hfModel?: string | null,
): string | undefined {
  if (provider === 'gemini') {
    return geminiModel || 'gemini-3-pro-image-preview'
  }
  if (provider === 'higgsfield') {
    return hfModel || 'nano-banana-pro'
  }
  return undefined
}
