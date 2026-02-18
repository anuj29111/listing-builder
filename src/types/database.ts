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
  file_type: 'keywords' | 'reviews' | 'qna' | 'rufus_qna'
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
  created_at: string
  updated_at: string
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
  section_type: 'title' | 'bullet_1' | 'bullet_2' | 'bullet_3' | 'bullet_4' | 'bullet_5' | 'description' | 'search_terms' | 'subject_matter' | 'backend_attributes'
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
  provider: 'dalle3' | 'gemini' | 'higgsfield'
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
  provider: 'dalle3' | 'gemini' | 'higgsfield'
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
