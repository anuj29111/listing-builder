'use client'

import { create } from 'zustand'
import type { LbVideoProject } from '@/types/database'

interface VideoProjectState {
  videoProject: LbVideoProject | null
  isGeneratingScript: boolean
  isGeneratingStoryboard: boolean
  isSaving: boolean

  setVideoProject: (vp: LbVideoProject | null) => void
  updateVideoProject: (updates: Partial<LbVideoProject>) => void
  setIsGeneratingScript: (v: boolean) => void
  setIsGeneratingStoryboard: (v: boolean) => void
  setIsSaving: (v: boolean) => void
  reset: () => void
}

const initialState = {
  videoProject: null as LbVideoProject | null,
  isGeneratingScript: false,
  isGeneratingStoryboard: false,
  isSaving: false,
}

export const useVideoProjectStore = create<VideoProjectState>((set) => ({
  ...initialState,

  setVideoProject: (videoProject) => set({ videoProject }),

  updateVideoProject: (updates) =>
    set((state) => ({
      videoProject: state.videoProject
        ? { ...state.videoProject, ...updates }
        : null,
    })),

  setIsGeneratingScript: (isGeneratingScript) => set({ isGeneratingScript }),
  setIsGeneratingStoryboard: (isGeneratingStoryboard) => set({ isGeneratingStoryboard }),
  setIsSaving: (isSaving) => set({ isSaving }),

  reset: () => set(initialState),
}))
