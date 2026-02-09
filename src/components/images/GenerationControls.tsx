'use client'

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

interface GenerationControlsProps {
  onGenerated: (image: LbImageGeneration) => void
}

export function GenerationControls({ onGenerated }: GenerationControlsProps) {
  const prompt = useImageStore((s) => s.prompt)
  const provider = useImageStore((s) => s.provider)
  const orientation = useImageStore((s) => s.orientation)
  const listingId = useImageStore((s) => s.listingId)
  const isGenerating = useImageStore((s) => s.isGenerating)
  const setProvider = useImageStore((s) => s.setProvider)
  const setOrientation = useImageStore((s) => s.setOrientation)
  const setIsGenerating = useImageStore((s) => s.setIsGenerating)

  const costEstimate = provider === 'dalle3' ? 4 : 2

  const handleGenerate = async () => {
    if (!prompt || prompt.trim().length < 5) {
      toast.error('Prompt must be at least 5 characters')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider,
          orientation,
          listing_id: listingId || undefined,
        }),
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
        <Select value={provider} onValueChange={(v) => setProvider(v as 'dalle3' | 'gemini')}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dalle3">DALL-E 3 (OpenAI)</SelectItem>
            <SelectItem value="gemini">Gemini (Google)</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        Estimated cost: ~{costEstimate}c per image (1K preview)
      </div>

      <Button
        className="w-full"
        onClick={handleGenerate}
        disabled={isGenerating || !prompt || prompt.trim().length < 5}
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
