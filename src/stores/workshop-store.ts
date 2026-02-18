'use client'

import { create } from 'zustand'
import type { LbImageGeneration, LbImageWorkshop } from '@/types/database'
import type { WorkshopPrompt } from '@/types/api'

type ImageProvider = 'openai' | 'gemini' | 'higgsfield'

interface WorkshopState {
  // Session
  workshopId: string | null
  workshop: LbImageWorkshop | null
  step: 1 | 2 | 3 | 4
  imageType: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'

  // Step 1: Setup
  generatedPrompts: WorkshopPrompt[]
  calloutSuggestions: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>
  selectedPromptIndices: number[]
  provider: ImageProvider
  geminiModel: string | null
  orientation: 'square' | 'portrait' | 'landscape'
  isGeneratingPrompts: boolean

  // Step 2: Collage
  workshopImages: LbImageGeneration[]
  elementTags: Record<string, string[]>
  isBatchGenerating: boolean
  batchProgress: { done: number; total: number }

  // Step 3: Combine
  combinedPrompt: string
  finalImage: LbImageGeneration | null
  isGeneratingFinal: boolean

  // Step 4: Compare
  calloutTexts: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>
  competitorUrls: string[]

  // Actions
  hydrateFromDB: (workshop: LbImageWorkshop, images: LbImageGeneration[]) => void
  setStep: (step: 1 | 2 | 3 | 4) => void
  setWorkshopId: (id: string) => void
  setWorkshop: (workshop: LbImageWorkshop) => void
  setGeneratedPrompts: (prompts: WorkshopPrompt[], callouts: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>) => void
  togglePromptSelection: (index: number) => void
  selectAllPrompts: () => void
  setProvider: (provider: ImageProvider) => void
  setGeminiModel: (model: string | null) => void
  setOrientation: (orientation: 'square' | 'portrait' | 'landscape') => void
  setIsGeneratingPrompts: (v: boolean) => void
  setWorkshopImages: (images: LbImageGeneration[]) => void
  addWorkshopImage: (image: LbImageGeneration) => void
  setElementTags: (tags: Record<string, string[]>) => void
  setElementTag: (imageId: string, tags: string[]) => void
  setIsBatchGenerating: (v: boolean) => void
  setBatchProgress: (done: number, total: number) => void
  setCombinedPrompt: (prompt: string) => void
  setFinalImage: (image: LbImageGeneration | null) => void
  setIsGeneratingFinal: (v: boolean) => void
  setCalloutTexts: (texts: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>) => void
  addCompetitorUrl: (url: string) => void
  removeCompetitorUrl: (url: string) => void
  reset: () => void
}

const initialState = {
  workshopId: null as string | null,
  workshop: null as LbImageWorkshop | null,
  step: 1 as const,
  imageType: 'main' as const,
  generatedPrompts: [] as WorkshopPrompt[],
  calloutSuggestions: [] as Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>,
  selectedPromptIndices: [] as number[],
  provider: 'gemini' as ImageProvider,
  geminiModel: null as string | null,
  orientation: 'square' as const,
  isGeneratingPrompts: false,
  workshopImages: [] as LbImageGeneration[],
  elementTags: {} as Record<string, string[]>,
  isBatchGenerating: false,
  batchProgress: { done: 0, total: 0 },
  combinedPrompt: '',
  finalImage: null as LbImageGeneration | null,
  isGeneratingFinal: false,
  calloutTexts: [] as Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>,
  competitorUrls: [] as string[],
}

export const useWorkshopStore = create<WorkshopState>((set) => ({
  ...initialState,

  hydrateFromDB: (workshop, images) => {
    const prompts = (workshop.generated_prompts || []) as WorkshopPrompt[]
    const selectedIndices = (workshop.selected_prompt_indices || prompts.map((_, i) => i)) as number[]
    const finalImg = workshop.final_image_id
      ? images.find((img) => img.id === workshop.final_image_id) || null
      : null

    set({
      workshopId: workshop.id,
      workshop,
      step: (workshop.step || 1) as 1 | 2 | 3 | 4,
      imageType: workshop.image_type || 'main',
      generatedPrompts: prompts,
      calloutSuggestions: workshop.callout_texts || [],
      selectedPromptIndices: selectedIndices,
      provider: workshop.provider || 'gemini',
      orientation: workshop.orientation || 'square',
      workshopImages: images,
      elementTags: workshop.element_tags || {},
      finalImage: finalImg,
      calloutTexts: workshop.callout_texts || [],
      competitorUrls: workshop.competitor_urls || [],
      isGeneratingPrompts: false,
      isBatchGenerating: false,
      isGeneratingFinal: false,
      batchProgress: { done: 0, total: 0 },
      combinedPrompt: '',
    })
  },

  setStep: (step) => set({ step }),
  setWorkshopId: (workshopId) => set({ workshopId }),
  setWorkshop: (workshop) => set({ workshop }),

  setGeneratedPrompts: (prompts, callouts) =>
    set({
      generatedPrompts: prompts,
      calloutSuggestions: callouts,
      selectedPromptIndices: prompts.map((_, i) => i), // Select all by default
    }),

  togglePromptSelection: (index) =>
    set((state) => {
      const current = state.selectedPromptIndices
      if (current.includes(index)) {
        return { selectedPromptIndices: current.filter((i) => i !== index) }
      }
      return { selectedPromptIndices: [...current, index].sort((a, b) => a - b) }
    }),

  selectAllPrompts: () =>
    set((state) => ({
      selectedPromptIndices: state.generatedPrompts.map((_, i) => i),
    })),

  setProvider: (provider) => set({ provider }),
  setGeminiModel: (geminiModel) => set({ geminiModel }),
  setOrientation: (orientation) => set({ orientation }),
  setIsGeneratingPrompts: (isGeneratingPrompts) => set({ isGeneratingPrompts }),

  setWorkshopImages: (workshopImages) => set({ workshopImages }),
  addWorkshopImage: (image) =>
    set((state) => ({ workshopImages: [...state.workshopImages, image] })),

  setElementTags: (elementTags) => set({ elementTags }),
  setElementTag: (imageId, tags) =>
    set((state) => ({
      elementTags: { ...state.elementTags, [imageId]: tags },
    })),

  setIsBatchGenerating: (isBatchGenerating) => set({ isBatchGenerating }),
  setBatchProgress: (done, total) => set({ batchProgress: { done, total } }),

  setCombinedPrompt: (combinedPrompt) => set({ combinedPrompt }),
  setFinalImage: (finalImage) => set({ finalImage }),
  setIsGeneratingFinal: (isGeneratingFinal) => set({ isGeneratingFinal }),

  setCalloutTexts: (calloutTexts) => set({ calloutTexts }),
  addCompetitorUrl: (url) =>
    set((state) => ({
      competitorUrls: [...state.competitorUrls, url],
    })),
  removeCompetitorUrl: (url) =>
    set((state) => ({
      competitorUrls: state.competitorUrls.filter((u) => u !== url),
    })),

  reset: () => set(initialState),
}))
