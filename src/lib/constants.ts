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

export const SECTION_TYPE_LABELS: Record<string, string> = {
  title: 'Title',
  bullet_1: 'Bullet Point 1',
  bullet_2: 'Bullet Point 2',
  bullet_3: 'Bullet Point 3',
  bullet_4: 'Bullet Point 4',
  bullet_5: 'Bullet Point 5',
  description: 'Description',
  search_terms: 'Search Terms',
  subject_matter: 'Subject Matter',
}

// Maps section_type to the corresponding country char limit field
export const SECTION_CHAR_LIMIT_MAP: Record<string, 'title_limit' | 'bullet_limit' | 'description_limit' | 'search_terms_limit'> = {
  title: 'title_limit',
  bullet_1: 'bullet_limit',
  bullet_2: 'bullet_limit',
  bullet_3: 'bullet_limit',
  bullet_4: 'bullet_limit',
  bullet_5: 'bullet_limit',
  description: 'description_limit',
  search_terms: 'search_terms_limit',
  subject_matter: 'search_terms_limit', // subject matter uses same limit as search terms
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  keywords: 'Keywords',
  reviews: 'Reviews',
  qna: 'Q&A',
  rufus_qna: 'Rufus Q&A',
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export const DEFAULT_CHAR_LIMITS = {
  title: 200,
  bullet: 500,
  bulletCount: 5,
  description: 2000,
  searchTerms: 250,
}
