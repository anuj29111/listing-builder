export const APP_NAME = 'Listing Builder'
export const APP_DESCRIPTION = 'Amazon listing generation platform'
export const APP_VERSION = '0.0.0'

export const BRANDS = ['Chalkola', 'Spedalon', 'Funcils', 'Other'] as const

export const FILE_TYPES = ['keywords', 'reviews', 'qna', 'rufus_qna'] as const

export const ANALYSIS_TYPES = ['keyword_analysis', 'review_analysis', 'qna_analysis'] as const

export const LISTING_STATUSES = ['draft', 'review', 'approved', 'exported'] as const

export const SECTION_TYPES = [
  'title',
  'bullet_1',
  'bullet_2',
  'bullet_3',
  'bullet_4',
  'bullet_5',
  'description',
  'search_terms',
  'subject_matter',
] as const

export const IMAGE_PROVIDERS = ['dalle3', 'gemini'] as const

export const SYNC_TYPES = ['google_drive', 'apify', 'datadive'] as const

export const EXPORT_TYPES = ['csv', 'clipboard', 'flat_file'] as const

export const DEFAULT_CHAR_LIMITS = {
  title: 200,
  bullet: 500,
  bulletCount: 5,
  description: 2000,
  searchTerms: 250,
}
