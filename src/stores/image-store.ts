'use client'

import { create } from 'zustand'
import type { LbImageGeneration } from '@/types/database'

type ImageProvider = 'dalle3' | 'gemini' | 'higgsfield'

interface ImageState {
  // Prompt & controls
  prompt: string
  provider: ImageProvider
  higgsFieldModel: string | null
  orientation: 'square' | 'portrait' | 'landscape'
  listingId: string | null

  // Gallery
  images: LbImageGeneration[]
  selectedImageId: string | null
  filter: 'all' | 'preview' | 'approved' | 'rejected'

  // Loading
  isGenerating: boolean
  isLoading: boolean

  // Actions
  setPrompt: (prompt: string) => void
  setProvider: (provider: ImageProvider) => void
  setHiggsFieldModel: (model: string | null) => void
  setOrientation: (orientation: 'square' | 'portrait' | 'landscape') => void
  setListingId: (id: string | null) => void
  setFilter: (filter: 'all' | 'preview' | 'approved' | 'rejected') => void
  selectImage: (id: string | null) => void
  setImages: (images: LbImageGeneration[]) => void
  addImage: (image: LbImageGeneration) => void
  updateImage: (id: string, updates: Partial<LbImageGeneration>) => void
  removeImage: (id: string) => void
  setIsGenerating: (v: boolean) => void
  setIsLoading: (v: boolean) => void
  reset: () => void
}

const initialState = {
  prompt: '',
  provider: 'dalle3' as ImageProvider,
  higgsFieldModel: null as string | null,
  orientation: 'square' as const,
  listingId: null,
  images: [],
  selectedImageId: null,
  filter: 'all' as const,
  isGenerating: false,
  isLoading: false,
}

export const useImageStore = create<ImageState>((set) => ({
  ...initialState,

  setPrompt: (prompt) => set({ prompt }),
  setProvider: (provider) => set({ provider }),
  setHiggsFieldModel: (higgsFieldModel) => set({ higgsFieldModel }),
  setOrientation: (orientation) => set({ orientation }),
  setListingId: (listingId) => set({ listingId }),
  setFilter: (filter) => set({ filter }),
  selectImage: (selectedImageId) => set({ selectedImageId }),

  setImages: (images) => set({ images }),

  addImage: (image) =>
    set((state) => ({ images: [image, ...state.images] })),

  updateImage: (id, updates) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, ...updates } : img
      ),
    })),

  removeImage: (id) =>
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
      selectedImageId: state.selectedImageId === id ? null : state.selectedImageId,
    })),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setIsLoading: (isLoading) => set({ isLoading }),

  reset: () => set(initialState),
}))
