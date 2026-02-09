import { create } from 'zustand'
import type { LbListingSection, LbListing, LbProductType, LbCategory, LbCountry } from '@/types/database'
import type { ListingStatus } from '@/types'

interface ProductAttribute {
  key: string
  value: string
}

interface ListingWizardState {
  // Step tracking
  currentStep: number // 0-3

  // Step 1: Category + Country
  categoryId: string | null
  countryId: string | null
  categoryName: string
  countryName: string
  countryLanguage: string
  charLimits: {
    title: number
    bullet: number
    bulletCount: number
    description: number
    searchTerms: number
  }
  analysisAvailability: Record<string, 'completed' | 'missing'>

  // Step 2: Product Details
  productName: string
  asin: string
  brand: string
  attributes: ProductAttribute[]
  productTypeName: string
  productTypeId: string | null

  // Step 3: Generation result
  listingId: string | null
  isGenerating: boolean
  generationError: string | null
  modelUsed: string | null
  tokensUsed: number | null

  // Step 4: Sections (loaded from API after generation)
  sections: LbListingSection[]
  listingStatus: ListingStatus

  // Actions
  setStep: (step: number) => void
  setCategoryCountry: (
    categoryId: string,
    countryId: string,
    categoryName: string,
    countryName: string,
    countryLanguage: string,
    charLimits: ListingWizardState['charLimits']
  ) => void
  setAnalysisAvailability: (map: Record<string, 'completed' | 'missing'>) => void
  setProductDetails: (details: {
    productName?: string
    asin?: string
    brand?: string
    productTypeName?: string
    productTypeId?: string | null
  }) => void
  addAttribute: () => void
  removeAttribute: (index: number) => void
  updateAttribute: (index: number, key: string, value: string) => void
  setGenerating: (isGenerating: boolean) => void
  setGenerationError: (error: string | null) => void
  setGenerationResult: (
    listingId: string,
    sections: LbListingSection[],
    modelUsed: string,
    tokensUsed: number
  ) => void
  selectVariation: (sectionId: string, variationIndex: number) => void
  toggleSectionApproval: (sectionId: string) => void
  setListingStatus: (status: ListingStatus) => void
  setSections: (sections: LbListingSection[]) => void
  loadEditListing: (
    listing: LbListing,
    sections: LbListingSection[],
    category: LbCategory,
    country: LbCountry,
    productType: LbProductType | null
  ) => void
  resetWizard: () => void
}

const initialState = {
  currentStep: 0,
  categoryId: null as string | null,
  countryId: null as string | null,
  categoryName: '',
  countryName: '',
  countryLanguage: '',
  charLimits: { title: 200, bullet: 500, bulletCount: 5, description: 2000, searchTerms: 250 },
  analysisAvailability: {} as Record<string, 'completed' | 'missing'>,
  productName: '',
  asin: '',
  brand: '',
  attributes: [{ key: '', value: '' }] as ProductAttribute[],
  productTypeName: '',
  productTypeId: null as string | null,
  listingId: null as string | null,
  isGenerating: false,
  generationError: null as string | null,
  modelUsed: null as string | null,
  tokensUsed: null as number | null,
  sections: [] as LbListingSection[],
  listingStatus: 'draft' as ListingStatus,
}

export const useListingStore = create<ListingWizardState>((set) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),

  setCategoryCountry: (categoryId, countryId, categoryName, countryName, countryLanguage, charLimits) =>
    set({ categoryId, countryId, categoryName, countryName, countryLanguage, charLimits }),

  setAnalysisAvailability: (map) => set({ analysisAvailability: map }),

  setProductDetails: (details) =>
    set((state) => ({
      productName: details.productName ?? state.productName,
      asin: details.asin ?? state.asin,
      brand: details.brand ?? state.brand,
      productTypeName: details.productTypeName ?? state.productTypeName,
      productTypeId: details.productTypeId !== undefined ? details.productTypeId : state.productTypeId,
    })),

  addAttribute: () =>
    set((state) => ({
      attributes: [...state.attributes, { key: '', value: '' }],
    })),

  removeAttribute: (index) =>
    set((state) => ({
      attributes: state.attributes.filter((_, i) => i !== index),
    })),

  updateAttribute: (index, key, value) =>
    set((state) => ({
      attributes: state.attributes.map((attr, i) =>
        i === index ? { key, value } : attr
      ),
    })),

  setGenerating: (isGenerating) => set({ isGenerating, generationError: isGenerating ? null : undefined }),

  setGenerationError: (error) => set({ generationError: error, isGenerating: false }),

  setGenerationResult: (listingId, sections, modelUsed, tokensUsed) =>
    set({
      listingId,
      sections,
      modelUsed,
      tokensUsed,
      isGenerating: false,
      generationError: null,
      currentStep: 3,
    }),

  selectVariation: (sectionId, variationIndex) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, selected_variation: variationIndex } : s
      ),
    })),

  toggleSectionApproval: (sectionId) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, is_approved: !s.is_approved } : s
      ),
    })),

  setListingStatus: (status) => set({ listingStatus: status }),

  setSections: (sections) => set({ sections }),

  loadEditListing: (listing, sections, category, country, productType) =>
    set({
      currentStep: 3,
      categoryId: category.id,
      countryId: country.id,
      categoryName: category.name,
      countryName: country.name,
      countryLanguage: country.language,
      charLimits: {
        title: country.title_limit,
        bullet: country.bullet_limit,
        bulletCount: country.bullet_count,
        description: country.description_limit,
        searchTerms: country.search_terms_limit,
      },
      productName: productType?.name || (listing.generation_context as Record<string, string>)?.productName || '',
      asin: productType?.asin || '',
      brand: category.brand,
      listingId: listing.id,
      sections,
      listingStatus: listing.status,
      modelUsed: listing.model_used,
      tokensUsed: listing.tokens_used,
    }),

  resetWizard: () => set({ ...initialState, attributes: [{ key: '', value: '' }] }),
}))
