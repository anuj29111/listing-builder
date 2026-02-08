import { create } from 'zustand'

interface ResearchState {
  selectedCategoryId: string | null
  selectedCountryId: string | null
  setSelectedCategory: (id: string | null) => void
  setSelectedCountry: (id: string | null) => void
}

export const useResearchStore = create<ResearchState>((set) => ({
  selectedCategoryId: null,
  selectedCountryId: null,
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  setSelectedCountry: (id) => set({ selectedCountryId: id }),
}))
