'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Clock, ChevronDown, ChevronUp, Film, Music, RefreshCw } from 'lucide-react'
import { StoryboardShotCard } from './StoryboardShotCard'
import toast from 'react-hot-toast'
import type { VideoStoryboard } from '@/types/api'

interface StoryboardPanelProps {
  listingId: string
  storyboard: VideoStoryboard | null
  isGenerating: boolean
  onGenerated: (videoProject: Record<string, unknown>) => void
}

export function StoryboardPanel({ listingId, storyboard, isGenerating, onGenerated }: StoryboardPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [generating, setGenerating] = useState(false)

  const isLoading = isGenerating || generating

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/video-projects/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate storyboard')
      onGenerated(json.data.video_project)
      toast.success('Video storyboard generated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate storyboard')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="border rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Storyboard</h3>
          {storyboard && (
            <>
              <Badge variant="secondary" className="text-xs gap-1">
                <Clock className="h-3 w-3" />
                {storyboard.total_runtime}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {storyboard.shots.length} shots
              </Badge>
            </>
          )}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {!storyboard ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Film className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm font-medium">No storyboard generated yet</p>
              <p className="text-xs mt-1">Generate a shot-by-shot storyboard with production direction</p>
              <Button onClick={handleGenerate} disabled={isLoading} className="mt-4 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Storyboard
              </Button>
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isLoading} className="gap-1">
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Regenerate
                </Button>
              </div>

              {/* Shot cards */}
              <div className="space-y-3">
                {storyboard.shots.map((shot) => (
                  <StoryboardShotCard key={shot.shot_number} shot={shot} />
                ))}
              </div>

              {/* Music & Brand footer */}
              <div className="space-y-2 text-sm border-t pt-3">
                <div className="flex gap-2">
                  <Music className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-xs text-muted-foreground">MUSIC DIRECTION:</span>
                    <p className="mt-0.5 text-muted-foreground">{storyboard.music_direction}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium text-xs text-muted-foreground">BRAND INTEGRATION:</span>
                    <p className="mt-0.5 text-muted-foreground">{storyboard.brand_integration}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
