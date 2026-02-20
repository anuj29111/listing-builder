import { create } from 'zustand'
import type { LbListingSection, LbListing } from '@/types/database'
import type { BatchProduct } from '@/types/api'

export interface BatchProductEntry extends BatchProduct {
  id: string // client-side UUID for React key
}

export interface BatchListingWithSections {
  listing: LbListing & {
    product_type?: { name: string; asin: string | null } | null
  }
  sections: LbListingSection[]
}

interface BatchState {
  // Step tracking
  currentStep: number // 0-3

  // Step 0: Category + Country
  categoryId: string | null
  countryId: string | null
  categoryName: string
  countryName: string
  countryLanguage: string
  brand: string
  charLimits: {
    title: number
    bullet: number
    bulletCount: number
    description: number
    searchTerms: number
  }
  analysisAvailability: Record<string, 'completed' | 'missing'>

  // Step 1: Products
  products: BatchProductEntry[]

  // Step 2: Generation
  batchJobId: string | null
  batchStatus: 'pending' | 'processing' | 'completed' | 'failed'
  totalListings: number
  completedListings: number
  failedProducts: Array<{ product_name: string; error: string }>
  isGenerating: boolean
  generationError: string | null

  // Step 3: Review
  generatedListings: BatchListingWithSections[]
  expandedListingId: string | null

  // Actions
  setStep: (step: number) => void
  setCategoryCountry: (
    categoryId: string,
    countryId: string,
    categoryName: string,
    countryName: string,
    countryLanguage: string,
    brand: string,
    charLimits: BatchState['charLimits']
  ) => void
  setAnalysisAvailability: (map: Record<string, 'completed' | 'missing'>) => void
  addProduct: () => void
  removeProduct: (id: string) => void
  updateProduct: (id: string, updates: Partial<BatchProduct>) => void
  duplicateProduct: (id: string) => void
  setGenerating: (isGenerating: boolean) => void
  setBatchJob: (batchJobId: string, totalListings: number) => void
  updateProgress: (
    completed: number,
    status: BatchState['batchStatus'],
    failedProducts?: Array<{ product_name: string; error: string }>
  ) => void
  setGenerationError: (error: string | null) => void
  setGeneratedListings: (listings: BatchListingWithSections[]) => void
  setExpandedListingId: (id: string | null) => void
  approveAllSections: (listingId: string) => void
  approveAllListings: () => void
  selectVariation: (listingId: string, sectionId: string, variationIndex: number) => void
  toggleSectionApproval: (listingId: string, sectionId: string) => void
  updateFinalText: (listingId: string, sectionId: string, text: string) => void
  addVariation: (listingId: string, sectionId: string, newText: string, newIndex: number) => void
  resetBatch: () => void
}

const initialState = {
  currentStep: 0,
  categoryId: null as string | null,
  countryId: null as string | null,
  categoryName: '',
  countryName: '',
  countryLanguage: '',
  brand: '',
  charLimits: { title: 200, bullet: 250, bulletCount: 10, description: 2000, searchTerms: 250 },
  analysisAvailability: {} as Record<string, 'completed' | 'missing'>,
  products: [] as BatchProductEntry[],
  batchJobId: null as string | null,
  batchStatus: 'pending' as BatchState['batchStatus'],
  totalListings: 0,
  completedListings: 0,
  failedProducts: [] as Array<{ product_name: string; error: string }>,
  isGenerating: false,
  generationError: null as string | null,
  generatedListings: [] as BatchListingWithSections[],
  expandedListingId: null as string | null,
}

export const useBatchStore = create<BatchState>((set) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),

  setCategoryCountry: (categoryId, countryId, categoryName, countryName, countryLanguage, brand, charLimits) =>
    set({ categoryId, countryId, categoryName, countryName, countryLanguage, brand, charLimits }),

  setAnalysisAvailability: (map) => set({ analysisAvailability: map }),

  addProduct: () =>
    set((state) => {
      if (state.products.length >= 20) return state
      return {
        products: [
          ...state.products,
          {
            id: crypto.randomUUID(),
            product_name: '',
            asin: '',
            brand: state.brand,
            attributes: {},
            product_type_name: '',
          },
        ],
      }
    }),

  removeProduct: (id) =>
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    })),

  updateProduct: (id, updates) =>
    set((state) => ({
      products: state.products.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  duplicateProduct: (id) =>
    set((state) => {
      if (state.products.length >= 20) return state
      const source = state.products.find((p) => p.id === id)
      if (!source) return state
      return {
        products: [
          ...state.products,
          {
            ...source,
            id: crypto.randomUUID(),
            product_name: source.product_name + ' (copy)',
          },
        ],
      }
    }),

  setGenerating: (isGenerating) =>
    set({ isGenerating, generationError: isGenerating ? null : undefined }),

  setBatchJob: (batchJobId, totalListings) =>
    set({
      batchJobId,
      totalListings,
      completedListings: 0,
      batchStatus: 'processing',
      isGenerating: true,
      generationError: null,
      failedProducts: [],
    }),

  updateProgress: (completed, status, failedProducts) =>
    set((state) => ({
      completedListings: completed,
      batchStatus: status,
      isGenerating: status === 'processing',
      failedProducts: failedProducts ?? state.failedProducts,
    })),

  setGenerationError: (error) => set({ generationError: error, isGenerating: false }),

  setGeneratedListings: (listings) => set({ generatedListings: listings }),

  setExpandedListingId: (id) =>
    set((state) => ({
      expandedListingId: state.expandedListingId === id ? null : id,
    })),

  approveAllSections: (listingId) =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => {
        if (gl.listing.id !== listingId) return gl
        return {
          ...gl,
          sections: gl.sections.map((s) => ({ ...s, is_approved: true })),
        }
      }),
    })),

  approveAllListings: () =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => ({
        ...gl,
        sections: gl.sections.map((s) => ({ ...s, is_approved: true })),
      })),
    })),

  selectVariation: (listingId, sectionId, variationIndex) =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => {
        if (gl.listing.id !== listingId) return gl
        return {
          ...gl,
          sections: gl.sections.map((s) =>
            s.id === sectionId ? { ...s, selected_variation: variationIndex } : s
          ),
        }
      }),
    })),

  toggleSectionApproval: (listingId, sectionId) =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => {
        if (gl.listing.id !== listingId) return gl
        return {
          ...gl,
          sections: gl.sections.map((s) =>
            s.id === sectionId ? { ...s, is_approved: !s.is_approved } : s
          ),
        }
      }),
    })),

  updateFinalText: (listingId, sectionId, text) =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => {
        if (gl.listing.id !== listingId) return gl
        return {
          ...gl,
          sections: gl.sections.map((s) =>
            s.id === sectionId ? { ...s, final_text: text } : s
          ),
        }
      }),
    })),

  addVariation: (listingId, sectionId, newText, newIndex) =>
    set((state) => ({
      generatedListings: state.generatedListings.map((gl) => {
        if (gl.listing.id !== listingId) return gl
        return {
          ...gl,
          sections: gl.sections.map((s) => {
            if (s.id !== sectionId) return s
            const variations = (s.variations || []) as string[]
            return { ...s, variations: [...variations, newText], selected_variation: newIndex }
          }),
        }
      }),
    })),

  resetBatch: () => set({ ...initialState, products: [] }),
}))
