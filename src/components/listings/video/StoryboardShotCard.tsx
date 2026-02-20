'use client'

import { Badge } from '@/components/ui/badge'
import { Camera, Clock, Eye, Volume2, Sparkles, Type } from 'lucide-react'

interface StoryboardShot {
  shot_number: number
  timestamp: string
  runtime: string
  visual: string
  setting_props: string
  camera: string
  text_overlay: string
  audio_notes: string
  thumbnail: string
  usp_demonstrated: string
}

interface StoryboardShotCardProps {
  shot: StoryboardShot
}

export function StoryboardShotCard({ shot }: StoryboardShotCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Shot {shot.shot_number}
          </Badge>
          <Badge variant="secondary" className="gap-1 text-xs">
            <Clock className="h-3 w-3" />
            {shot.timestamp} ({shot.runtime})
          </Badge>
        </div>
      </div>

      {/* Visual */}
      <div className="flex gap-2 text-sm">
        <Eye className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-foreground">{shot.visual}</p>
      </div>

      {/* Camera */}
      <div className="flex gap-2 text-sm">
        <Camera className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-muted-foreground">{shot.camera}</p>
      </div>

      {/* Text Overlay */}
      {shot.text_overlay && (
        <div className="flex gap-2 text-sm">
          <Type className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="font-medium text-blue-700 dark:text-blue-400">&quot;{shot.text_overlay}&quot;</p>
        </div>
      )}

      {/* Audio */}
      {shot.audio_notes && (
        <div className="flex gap-2 text-sm">
          <Volume2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-muted-foreground italic">{shot.audio_notes}</p>
        </div>
      )}

      {/* USP */}
      <div className="flex gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-amber-700 dark:text-amber-400">{shot.usp_demonstrated}</p>
      </div>

      {/* Setting/Props & Thumbnail in a muted footer */}
      <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
        {shot.setting_props && <p><span className="font-medium">Setting:</span> {shot.setting_props}</p>}
        {shot.thumbnail && <p><span className="font-medium">Thumbnail still:</span> {shot.thumbnail}</p>}
      </div>
    </div>
  )
}
