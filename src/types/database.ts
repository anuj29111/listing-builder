export interface LbUser {
  id: string
  auth_id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'user'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface LbCategory {
  id: string
  name: string
  slug: string
  description: string | null
  brand: 'Chalkola' | 'Spedalon' | 'Funcils' | 'Other'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbCountry {
  id: string
  name: string
  code: string
  language: string
  amazon_domain: string
  flag_emoji: string | null
  currency: string | null
  title_limit: number
  bullet_limit: number
  bullet_count: number
  description_limit: number
  search_terms_limit: number
  is_active: boolean
  created_at: string
}

export interface LbResearchFile {
  id: string
  category_id: string
  country_id: string
  file_type: 'keywords' | 'reviews' | 'qna' | 'rufus_qna' | 'sp_prompts'
  file_name: string
  storage_path: string
  source: 'manual_upload' | 'google_drive' | 'apify' | 'datadive'
  file_size_bytes: number | null
  row_count: number | null
  uploaded_by: string | null
  google_drive_id: string | null
  created_at: string
  updated_at: string
}

export interface LbResearchAnalysis {
  id: string
  category_id: string
  country_id: string
  analysis_type: 'keyword_analysis' | 'review_analysis' | 'qna_analysis' | 'competitor_analysis'
  source_file_ids: string[]
  analysis_result: Record<string, unknown>
  model_used: string | null
  tokens_used: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  analyzed_by: string | null
  created_at: string
  updated_at: string
}

export interface LbProductType {
  id: string
  category_id: string
  name: string
  asin: string | null
  attributes: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbBatchJob {
  id: string
  name: string | null
  category_id: string
  country_id: string
  product_type_ids: string[] | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_listings: number
  completed_listings: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbListing {
  id: string
  product_type_id: string | null
  country_id: string
  title: string | null
  bullet_points: string[]
  description: string | null
  search_terms: string | null
  subject_matter: string[]
  backend_keywords: string | null
  status: 'draft' | 'review' | 'approved' | 'exported'
  generation_context: Record<string, unknown>
  model_used: string | null
  tokens_used: number | null
  created_by: string | null
  approved_by: string | null
  batch_job_id: string | null
  planning_matrix: BulletPlanningMatrixEntry[] | null
  backend_attributes: Record<string, string[]> | null
  optimization_mode: 'new' | 'optimize_existing'
  existing_listing_text: ExistingListingText | null
  generation_phase: GenerationPhase
  keyword_coverage: KeywordCoverage | null
  created_at: string
  updated_at: string
}

export type GenerationPhase = 'pending' | 'title' | 'bullets' | 'description' | 'backend' | 'complete'

export interface KeywordPlacement {
  keyword: string
  searchVolume: number
  relevancy: number
  placedIn: string
  position?: string
}

export interface KeywordCoverage {
  placed: KeywordPlacement[]
  remaining: Array<{
    keyword: string
    searchVolume: number
    relevancy: number
    suggestedPlacement: string
  }>
  coverageScore: number
}

export interface BulletPlanningMatrixEntry {
  bulletNumber: number
  primaryFocus: string
  qnaGapsAddressed: string[]
  reviewThemes: string[]
  priorityKeywords: string[]
  rufusQuestionTypes: string[]
}

export interface ExistingListingText {
  title: string
  bullets: string[]
  description: string
}

export interface LbListingSection {
  id: string
  listing_id: string
  section_type: 'title' | 'bullet_1' | 'bullet_2' | 'bullet_3' | 'bullet_4' | 'bullet_5' | 'description' | 'search_terms' | 'subject_matter'
  variations: unknown[]
  selected_variation: number
  is_approved: boolean
  final_text: string | null
  created_at: string
  updated_at: string
}

export interface LbListingChat {
  id: string
  listing_id: string
  section_type: string
  messages: unknown[]
  model_used: string | null
  created_at: string
  updated_at: string
}

export interface LbImageGeneration {
  id: string
  listing_id: string | null
  workshop_id: string | null
  prompt: string
  provider: 'openai' | 'gemini' | 'higgsfield'
  preview_url: string | null
  full_url: string | null
  status: 'preview' | 'approved' | 'rejected'
  cost_cents: number
  image_type: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'
  position: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbImageWorkshop {
  id: string
  listing_id: string | null
  name: string
  product_name: string
  brand: string
  category_id: string | null
  country_id: string | null
  step: number
  element_tags: Record<string, string[]>
  final_image_id: string | null
  callout_texts: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>
  competitor_urls: string[]
  generated_prompts: unknown[]
  selected_prompt_indices: number[]
  provider: 'openai' | 'gemini' | 'higgsfield'
  orientation: 'square' | 'portrait' | 'landscape'
  image_type: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbImageChat {
  id: string
  image_generation_id: string
  messages: unknown[]
  created_at: string
  updated_at: string
}

export interface LbAdminSetting {
  id: string
  key: string
  value: string
  description: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface LbSyncLog {
  id: string
  sync_type: 'google_drive' | 'apify' | 'datadive'
  status: 'started' | 'completed' | 'failed'
  details: Record<string, unknown>
  files_synced: number
  error_message: string | null
  triggered_by: string | null
  created_at: string
}

export interface LbExportLog {
  id: string
  listing_id: string | null
  export_type: 'csv' | 'clipboard' | 'flat_file'
  exported_by: string | null
  created_at: string
}

export interface LbAPlusModule {
  id: string
  listing_id: string | null
  template_type: 'hero_banner' | 'comparison_chart' | 'feature_grid' | 'technical_specs' | 'usage_scenarios' | 'brand_story'
  title: string | null
  content: Record<string, unknown>
  images: unknown[]
  status: 'draft' | 'review' | 'approved'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LbProduct {
  id: string
  asin: string
  product_name: string
  parent_name: string | null
  parent_asin: string | null
  category: string
  brand: string | null
  created_at: string
  updated_at: string
}

export interface LbAsinLookup {
  id: string
  asin: string
  country_id: string
  marketplace_domain: string
  raw_response: Record<string, unknown>
  title: string | null
  brand: string | null
  price: number | null
  currency: string | null
  rating: number | null
  reviews_count: number | null
  bullet_points: string | null
  description: string | null
  images: string[]
  sales_rank: Array<{ rank: number; ladder?: Array<{ url: string; name: string }> }>
  category: Array<{ ladder?: Array<{ url: string; name: string }> }>
  featured_merchant: Record<string, unknown> | null
  variations: unknown[]
  is_prime_eligible: boolean | null
  stock: string | null
  // New expanded fields
  price_upper: number | null
  price_sns: number | null
  price_initial: number | null
  price_shipping: number | null
  deal_type: string | null
  coupon: string | null
  coupon_discount_percentage: number | null
  discount_percentage: number | null
  amazon_choice: boolean
  parent_asin: string | null
  answered_questions_count: number | null
  has_videos: boolean
  sales_volume: string | null
  max_quantity: number | null
  pricing_count: number | null
  product_dimensions: string | null
  product_details: Record<string, unknown> | null
  product_overview: Array<{ title: string; description: string }> | null
  delivery: unknown[] | null
  buybox: unknown[] | null
  lightning_deal: Record<string, unknown> | null
  rating_stars_distribution: Array<{ rating: number; percentage: string }> | null
  sns_discounts: unknown[] | null
  top_reviews: Array<{
    id: string
    title: string
    author: string
    rating: number
    content: string
    timestamp: string
    is_verified: boolean
    helpful_count: number
  }> | null
  lookup_by: string | null
  created_at: string
  updated_at: string
}

export interface LbKeywordSearch {
  id: string
  keyword: string
  country_id: string
  marketplace_domain: string
  total_results_count: number | null
  pages_fetched: number
  organic_results: Array<{
    asin: string
    url: string
    title: string
    price: number | null
    currency: string | null
    rating: number | null
    reviews_count: number | null
    pos: number
    url_image: string | null
    is_prime: boolean
    is_amazons_choice: boolean
    best_seller: boolean
    manufacturer: string | null
    sales_volume: string | null
  }>
  sponsored_results: Array<{
    asin: string
    url: string
    title: string
    price: number | null
    currency: string | null
    rating: number | null
    reviews_count: number | null
    pos: number
    url_image: string | null
    manufacturer: string | null
  }>
  amazons_choices: unknown[]
  suggested_results: unknown[]
  raw_response: Record<string, unknown> | null
  searched_by: string | null
  created_at: string
  updated_at: string
}

export interface LbAsinReview {
  id: string
  asin: string
  country_id: string
  marketplace_domain: string
  total_reviews: number | null
  overall_rating: number | null
  rating_stars_distribution: Array<{ rating: number; percentage: string }> | null
  total_pages_fetched: number
  reviews: Array<{
    id: string
    title: string
    author: string
    rating: number
    content: string
    timestamp: string
    is_verified: boolean
    helpful_count: number
    product_attributes: string | null
    images: string[]
  }>
  raw_response: Record<string, unknown> | null
  sort_by: string
  fetched_by: string | null
  created_at: string
  updated_at: string
}

// Higgsfield prompt queue (shared table with higgsfield-automator)
export type HfModel = 'nano-banana-pro' | 'chatgpt' | 'seedream' | 'soul'

export interface HfPromptQueueSettings {
  aspect_ratio?: string
  resolution?: string
  batch_size?: number
  use_unlim?: boolean
}

export interface HfPromptQueue {
  id: string
  prompt: string
  model: HfModel
  settings: HfPromptQueueSettings
  status: 'pending' | 'submitted' | 'failed' | 'skipped'
  error: string | null
  source: 'manual' | 'listing-builder' | 'batch'
  listing_id: string | null
  created_at: string
  submitted_at: string | null
  created_by: string | null
}

// Model config for UI (mirrors MODELS dict in Python api.py)
export const HF_MODELS: Record<HfModel, {
  label: string
  slug: string
  resolutions: string[]
  aspectRatios: string[]
  defaultResolution: string
}> = {
  'nano-banana-pro': {
    label: 'Nano Banana Pro',
    slug: 'nano-banana-2',
    resolutions: ['1k', '2k', '4k'],
    aspectRatios: ['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '5:4', '4:5', '21:9'],
    defaultResolution: '2k',
  },
  'chatgpt': {
    label: 'ChatGPT',
    slug: 'openai_hazel',
    resolutions: ['low', 'medium', 'high'],
    aspectRatios: ['1:1', '2:3', '3:2'],
    defaultResolution: 'medium',
  },
  'seedream': {
    label: 'Seedream 4.5',
    slug: 'seedream_v4_5',
    resolutions: ['2k', '4k'],
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
    defaultResolution: '2k',
  },
  'soul': {
    label: 'Soul',
    slug: 'soul',
    resolutions: ['1.5k', '2k'],
    aspectRatios: ['9:16', '3:4', '2:3', '1:1', '4:3', '16:9', '3:2'],
    defaultResolution: '2k',
  },
}
