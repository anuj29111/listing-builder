'use client'

import { create } from 'zustand'
import type { LbAPlusModule } from '@/types/database'

interface APlusState {
  // Context
  listingId: string | null
  modules: LbAPlusModule[]
  selectedModuleId: string | null

  // Editing
  isEditing: boolean
  editingModuleId: string | null

  // Loading
  isLoading: boolean
  isGenerating: boolean

  // Actions
  setListingId: (id: string | null) => void
  setModules: (modules: LbAPlusModule[]) => void
  addModule: (module: LbAPlusModule) => void
  updateModule: (id: string, updates: Partial<LbAPlusModule>) => void
  removeModule: (id: string) => void
  selectModule: (id: string | null) => void
  startEditing: (id: string) => void
  stopEditing: () => void
  setIsLoading: (v: boolean) => void
  setIsGenerating: (v: boolean) => void
  reset: () => void
}

const initialState = {
  listingId: null,
  modules: [],
  selectedModuleId: null,
  isEditing: false,
  editingModuleId: null,
  isLoading: false,
  isGenerating: false,
}

export const useAPlusStore = create<APlusState>((set) => ({
  ...initialState,

  setListingId: (listingId) => set({ listingId }),

  setModules: (modules) => set({ modules }),

  addModule: (module) =>
    set((state) => ({ modules: [...state.modules, module] })),

  updateModule: (id, updates) =>
    set((state) => ({
      modules: state.modules.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  removeModule: (id) =>
    set((state) => ({
      modules: state.modules.filter((m) => m.id !== id),
      selectedModuleId: state.selectedModuleId === id ? null : state.selectedModuleId,
      editingModuleId: state.editingModuleId === id ? null : state.editingModuleId,
      isEditing: state.editingModuleId === id ? false : state.isEditing,
    })),

  selectModule: (selectedModuleId) => set({ selectedModuleId }),

  startEditing: (id) => set({ isEditing: true, editingModuleId: id }),

  stopEditing: () => set({ isEditing: false, editingModuleId: null }),

  setIsLoading: (isLoading) => set({ isLoading }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),

  reset: () => set(initialState),
}))
