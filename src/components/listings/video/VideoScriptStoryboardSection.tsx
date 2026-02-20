'use client'

import { useEffect, useCallback, useState } from 'react'
import { useVideoProjectStore } from '@/stores/video-project-store'
import { VideoScriptPanel } from './VideoScriptPanel'
import { StoryboardPanel } from './StoryboardPanel'
import { VideoProjectHeader } from './VideoProjectHeader'
import { Loader2 } from 'lucide-react'
import type { LbVideoProject } from '@/types/database'
import type { VideoScript, VideoStoryboard } from '@/types/api'

interface VideoScriptStoryboardSectionProps {
  listingId: string
  initialVideoProject: LbVideoProject | null
}

export function VideoScriptStoryboardSection({
  listingId,
  initialVideoProject,
}: VideoScriptStoryboardSectionProps) {
  const videoProject = useVideoProjectStore((s) => s.videoProject)
  const setVideoProject = useVideoProjectStore((s) => s.setVideoProject)
  const updateVideoProject = useVideoProjectStore((s) => s.updateVideoProject)
  const isGeneratingScript = useVideoProjectStore((s) => s.isGeneratingScript)
  const isGeneratingStoryboard = useVideoProjectStore((s) => s.isGeneratingStoryboard)

  const [isLoading, setIsLoading] = useState(!initialVideoProject)

  // Initialize from server-fetched data or fetch client-side
  useEffect(() => {
    if (initialVideoProject) {
      setVideoProject(initialVideoProject)
      setIsLoading(false)
    } else {
      // Fetch client-side if not pre-fetched
      const fetchProject = async () => {
        try {
          const res = await fetch(`/api/video-projects/${listingId}`)
          const json = await res.json()
          if (json.data) {
            setVideoProject(json.data)
          }
        } catch {
          // No video project yet — that's fine
        } finally {
          setIsLoading(false)
        }
      }
      fetchProject()
    }

    return () => {
      // Reset store on unmount
      useVideoProjectStore.getState().reset()
    }
  }, [listingId, initialVideoProject, setVideoProject])

  const handleGenerated = useCallback((vp: Record<string, unknown>) => {
    setVideoProject(vp as unknown as LbVideoProject)
  }, [setVideoProject])

  const handleHeaderUpdate = useCallback((updates: { status?: string; notes?: string }) => {
    updateVideoProject(updates as Partial<LbVideoProject>)
  }, [updateVideoProject])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading video project...</span>
      </div>
    )
  }

  const script = videoProject?.script as unknown as VideoScript | null
  const storyboard = videoProject?.storyboard as unknown as VideoStoryboard | null

  return (
    <div className="space-y-6">
      {/* Status & Notes (only shown once project exists) */}
      {videoProject && (
        <VideoProjectHeader
          listingId={listingId}
          status={videoProject.status}
          notes={videoProject.notes}
          onUpdate={handleHeaderUpdate}
        />
      )}

      {/* Script Panel */}
      <VideoScriptPanel
        listingId={listingId}
        script={script}
        isGenerating={isGeneratingScript}
        onGenerated={handleGenerated}
      />

      {/* Storyboard Panel */}
      <StoryboardPanel
        listingId={listingId}
        storyboard={storyboard}
        isGenerating={isGeneratingStoryboard}
        onGenerated={handleGenerated}
      />
    </div>
  )
}
