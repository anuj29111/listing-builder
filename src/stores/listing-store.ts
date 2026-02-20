import { create } from 'zustand'
import type { LbListingSection, LbListing, LbProductType, LbCategory, LbCountry, GenerationPhase, KeywordCoverage, BulletPlanningMatrixEntry } from '@/types/database'
import type { ListingStatus } from '@/types'

interface ProductAttribute {
  key: string
  value: string
}

interface ScrapedListingData {
  title: string | null
  bullet_points: string | null
  description: string | null
  brand: string | null
  images: string[]
  rating: number | null
  reviews_count: number | null
  price: number | null
  currency: string | null
  asin: string
}

interface ListingWizardState {
  // Pre-wizard: mode selection
  modeSelected: boolean

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

  // Scraped ASIN data (from mode selection)
  scrapedAsin: string | null
  scrapedCountryId: string | null
  scrapedData: ScrapedListingData | null
  isFetchingAsin: boolean
  fetchAsinError: string | null

  // Step 2: Product Details
  productName: string
  asin: string
  brand: string
  attributes: ProductAttribute[]
  productTypeName: string
  productTypeId: string | null
  optimizationMode: 'new' | 'optimize_existing' | 'based_on_existing'
  existingListingText: { title: string; bullets: string[]; description: string; reference_asin?: string } | null

  // Step 3: Generation result
  listingId: string | null
  isGenerating: boolean
  generationError: string | null
  modelUsed: string | null
  tokensUsed: number | null

  // Step 4: Sections (loaded from API after generation)
  sections: LbListingSection[]
  listingStatus: ListingStatus

  // Phased generation state
  generationPhase: GenerationPhase
  activePhaseLoading: 'title' | 'bullets' | 'description' | 'backend' | null
  keywordCoverage: KeywordCoverage | null
  totalTokensUsed: number
  confirmedTitle: string | null
  confirmedBullets: string[] | null
  confirmedDescription: string | null
  confirmedSearchTerms: string | null
  planningMatrix: BulletPlanningMatrixEntry[] | null
  backendAttributes: Record<string, string[]> | null

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
  updateFinalText: (sectionId: string, text: string) => void
  setListingStatus: (status: ListingStatus) => void
  setOptimizationMode: (mode: 'new' | 'optimize_existing' | 'based_on_existing') => void
  setExistingListingText: (text: { title: string; bullets: string[]; description: string; reference_asin?: string } | null) => void
  setModeSelected: (selected: boolean) => void
  setScrapedData: (data: ScrapedListingData | null) => void
  setScrapedAsin: (asin: string | null) => void
  setScrapedCountryId: (countryId: string | null) => void
  setFetchingAsin: (loading: boolean) => void
  setFetchAsinError: (error: string | null) => void
  proceedFromScrape: () => void
  addVariation: (sectionId: string, newText: string, newIndex: number) => void
  setSections: (sections: LbListingSection[]) => void
  loadEditListing: (
    listing: LbListing,
    sections: LbListingSection[],
    category: LbCategory,
    country: LbCountry,
    productType: LbProductType | null
  ) => void
  resetWizard: () => void

  // Phased generation actions
  setActivePhaseLoading: (phase: 'title' | 'bullets' | 'description' | 'backend' | null) => void
  onTitlePhaseComplete: (
    listingId: string,
    titleSection: LbListingSection,
    coverage: KeywordCoverage,
    model: string,
    tokensUsed: number
  ) => void
  onBulletsPhaseComplete: (
    bulletSections: LbListingSection[],
    planningMatrix: BulletPlanningMatrixEntry[] | null,
    coverage: KeywordCoverage,
    tokensUsed: number
  ) => void
  onDescriptionPhaseComplete: (
    descSections: LbListingSection[],
    coverage: KeywordCoverage,
    tokensUsed: number
  ) => void
  onBackendPhaseComplete: (
    subjectSection: LbListingSection[],
    backendAttrs: Record<string, string[]> | null,
    coverage: KeywordCoverage,
    tokensUsed: number
  ) => void
  confirmTitle: (finalText: string) => void
  confirmBullets: (finalTexts: string[]) => void
  confirmDescription: (finalDescription: string, finalSearchTerms: string) => void
  setKeywordCoverage: (coverage: KeywordCoverage) => void
}

const initialState = {
  modeSelected: false,
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
  scrapedAsin: null as string | null,
  scrapedCountryId: null as string | null,
  scrapedData: null as ScrapedListingData | null,
  isFetchingAsin: false,
  fetchAsinError: null as string | null,
  optimizationMode: 'new' as 'new' | 'optimize_existing' | 'based_on_existing',
  existingListingText: null as { title: string; bullets: string[]; description: string; reference_asin?: string } | null,
  listingId: null as string | null,
  isGenerating: false,
  generationError: null as string | null,
  modelUsed: null as string | null,
  tokensUsed: null as number | null,
  sections: [] as LbListingSection[],
  listingStatus: 'draft' as ListingStatus,
  generationPhase: 'pending' as GenerationPhase,
  activePhaseLoading: null as 'title' | 'bullets' | 'description' | 'backend' | null,
  keywordCoverage: null as KeywordCoverage | null,
  totalTokensUsed: 0,
  confirmedTitle: null as string | null,
  confirmedBullets: null as string[] | null,
  confirmedDescription: null as string | null,
  confirmedSearchTerms: null as string | null,
  planningMatrix: null as BulletPlanningMatrixEntry[] | null,
  backendAttributes: null as Record<string, string[]> | null,
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

  updateFinalText: (sectionId, text) =>
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId ? { ...s, final_text: text } : s
      ),
    })),

  setListingStatus: (status) => set({ listingStatus: status }),

  setOptimizationMode: (mode) => set({ optimizationMode: mode }),

  setExistingListingText: (text) => set({ existingListingText: text }),

  setModeSelected: (selected) => set({ modeSelected: selected }),

  setScrapedData: (data) => set({ scrapedData: data }),

  setScrapedAsin: (asin) => set({ scrapedAsin: asin }),

  setScrapedCountryId: (countryId) => set({ scrapedCountryId: countryId }),

  setFetchingAsin: (loading) => set({ isFetchingAsin: loading, fetchAsinError: loading ? null : undefined }),

  setFetchAsinError: (error) => set({ fetchAsinError: error, isFetchingAsin: false }),

  proceedFromScrape: () =>
    set((state) => {
      if (!state.scrapedData) return { modeSelected: true }

      const rawBullets = state.scrapedData.bullet_points
        ? state.scrapedData.bullet_points.split('\n').filter((b) => b.trim())
        : []
      // Pad to 5 bullets
      while (rawBullets.length < 5) rawBullets.push('')
      const bullets = rawBullets.slice(0, 5)

      const isOptimize = state.optimizationMode === 'optimize_existing' || state.optimizationMode === 'based_on_existing'

      const existingListingText = isOptimize
        ? {
            title: state.scrapedData.title || '',
            bullets,
            description: state.scrapedData.description || '',
            reference_asin: state.optimizationMode === 'based_on_existing' ? state.scrapedData.asin : undefined,
          }
        : null

      return {
        modeSelected: true,
        productName: state.scrapedData.title || '',
        brand: state.scrapedData.brand || '',
        // For "optimize_existing" keep ASIN, for "based_on_existing" clear it (user's new product)
        asin: state.optimizationMode === 'optimize_existing' ? state.scrapedData.asin : '',
        existingListingText,
      }
    }),

  addVariation: (sectionId, newText, newIndex) =>
    set((state) => ({
      sections: state.sections.map((s) => {
        if (s.id !== sectionId) return s
        const variations = (s.variations || []) as string[]
        const newVariations = [...variations, newText]
        return { ...s, variations: newVariations, selected_variation: newIndex }
      }),
    })),

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

  // Phased generation actions
  setActivePhaseLoading: (phase) => set({ activePhaseLoading: phase, generationError: phase ? null : undefined }),

  onTitlePhaseComplete: (listingId, titleSection, coverage, model, tokensUsed) =>
    set({
      listingId,
      sections: [titleSection],
      generationPhase: 'title',
      activePhaseLoading: null,
      keywordCoverage: coverage,
      modelUsed: model,
      totalTokensUsed: tokensUsed,
      isGenerating: false,
      generationError: null,
    }),

  onBulletsPhaseComplete: (bulletSections, planningMatrix, coverage, tokensUsed) =>
    set((state) => ({
      sections: [...state.sections.filter((s) => !s.section_type.startsWith('bullet_')), ...bulletSections],
      generationPhase: 'bullets',
      activePhaseLoading: null,
      keywordCoverage: coverage,
      planningMatrix,
      totalTokensUsed: (state.totalTokensUsed || 0) + tokensUsed,
      isGenerating: false,
    })),

  onDescriptionPhaseComplete: (descSections, coverage, tokensUsed) =>
    set((state) => ({
      sections: [
        ...state.sections.filter((s) => s.section_type !== 'description' && s.section_type !== 'search_terms'),
        ...descSections,
      ],
      generationPhase: 'description',
      activePhaseLoading: null,
      keywordCoverage: coverage,
      totalTokensUsed: (state.totalTokensUsed || 0) + tokensUsed,
      isGenerating: false,
    })),

  onBackendPhaseComplete: (subjectSection, backendAttrs, coverage, tokensUsed) =>
    set((state) => ({
      sections: [
        ...state.sections.filter((s) => s.section_type !== 'subject_matter'),
        ...subjectSection,
      ],
      generationPhase: 'complete',
      activePhaseLoading: null,
      keywordCoverage: coverage,
      backendAttributes: backendAttrs,
      totalTokensUsed: (state.totalTokensUsed || 0) + tokensUsed,
      isGenerating: false,
    })),

  confirmTitle: (finalText) =>
    set((state) => ({
      confirmedTitle: finalText,
      sections: state.sections.map((s) =>
        s.section_type === 'title' ? { ...s, final_text: finalText } : s
      ),
    })),

  confirmBullets: (finalTexts) =>
    set((state) => ({
      confirmedBullets: finalTexts,
      sections: state.sections.map((s) => {
        if (!s.section_type.startsWith('bullet_')) return s
        const idx = parseInt(s.section_type.split('_')[1]) - 1
        return { ...s, final_text: finalTexts[idx] || '' }
      }),
    })),

  confirmDescription: (finalDescription, finalSearchTerms) =>
    set((state) => ({
      confirmedDescription: finalDescription,
      confirmedSearchTerms: finalSearchTerms,
      sections: state.sections.map((s) => {
        if (s.section_type === 'description') return { ...s, final_text: finalDescription }
        if (s.section_type === 'search_terms') return { ...s, final_text: finalSearchTerms }
        return s
      }),
    })),

  setKeywordCoverage: (coverage) => set({ keywordCoverage: coverage }),

  resetWizard: () => set({ ...initialState, attributes: [{ key: '', value: '' }] }),
}))
