'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Clock, ChevronDown, ChevronUp, Mic, Type, Eye, Target, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VideoScript } from '@/types/api'

interface VideoScriptPanelProps {
  listingId: string
  script: VideoScript | null
  isGenerating: boolean
  onGenerated: (videoProject: Record<string, unknown>) => void
}

export function VideoScriptPanel({ listingId, script, isGenerating, onGenerated }: VideoScriptPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [generating, setGenerating] = useState(false)

  const isLoading = isGenerating || generating

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/video-projects/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate script')
      onGenerated(json.data.video_project)
      toast.success('Video script generated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate script')
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
          <Mic className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Video Script</h3>
          {script && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {script.total_duration}
            </Badge>
          )}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {!script ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Mic className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm font-medium">No script generated yet</p>
              <p className="text-xs mt-1">Generate a video script based on your listing content and research</p>
              <Button onClick={handleGenerate} disabled={isLoading} className="mt-4 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Script
              </Button>
            </div>
          ) : (
            <>
              {/* Script metadata */}
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline">{script.tone}</Badge>
                <Badge variant="outline" className="text-xs">{script.target_audience}</Badge>
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isLoading} className="ml-auto gap-1">
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Regenerate
                </Button>
              </div>

              {/* Hook */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs font-medium text-primary mb-1">HOOK (first 3 seconds)</p>
                <p className="text-sm font-medium">{script.hook}</p>
              </div>

              {/* Script sections */}
              <div className="space-y-3">
                {script.sections.map((section) => (
                  <div key={section.section_number} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        Section {section.section_number}
                      </Badge>
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        {section.timestamp} ({section.duration})
                      </Badge>
                    </div>

                    <div className="flex gap-2 text-sm">
                      <Mic className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p>{section.voiceover_text}</p>
                    </div>

                    <div className="flex gap-2 text-sm">
                      <Type className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="font-medium text-blue-700 dark:text-blue-400">&quot;{section.on_screen_text}&quot;</p>
                    </div>

                    <div className="flex gap-2 text-sm">
                      <Eye className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-muted-foreground">{section.visual_direction}</p>
                    </div>

                    <div className="flex gap-2 text-sm">
                      <Target className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-400">{section.key_selling_point}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA & Music */}
              <div className="space-y-2 text-sm border-t pt-3">
                <div>
                  <span className="font-medium text-xs text-muted-foreground">CLOSING CTA:</span>
                  <p className="mt-0.5">{script.closing_cta}</p>
                </div>
                <div>
                  <span className="font-medium text-xs text-muted-foreground">MUSIC:</span>
                  <p className="mt-0.5 text-muted-foreground">{script.music_notes}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
