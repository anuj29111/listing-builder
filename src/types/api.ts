import type { LbListing, LbListingSection, LbProductType, LbImageGeneration, LbAPlusModule } from './database'

export interface APIResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// --- Phase 4: Listing Generation ---

export interface GenerateListingRequest {
  category_id: string
  country_id: string
  product_name: string
  asin?: string
  brand: string
  attributes: Record<string, string>
  product_type_name?: string
}

export interface GenerateListingResponse {
  listing: LbListing
  sections: LbListingSection[]
  product_type: LbProductType | null
}

export interface ListingWithJoins extends LbListing {
  product_type?: { name: string; asin: string | null; category_id: string } | null
  country?: { name: string; code: string; flag_emoji: string | null; language: string } | null
  creator?: { full_name: string | null } | null
}

export interface UpdateListingSectionsRequest {
  sections?: Array<{
    id: string
    selected_variation: number
    is_approved: boolean
  }>
  status?: 'draft' | 'review' | 'approved' | 'exported'
}

export interface ExportRequest {
  listing_id: string
  export_type: 'csv' | 'clipboard' | 'flat_file'
}

export interface ExportResponse {
  formatted: string | { headers: string[]; rows: string[][] }
  export_log_id: string
}

// --- Phase 5: Modular Chats ---

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface SendChatMessageRequest {
  message: string
}

export interface SendChatMessageResponse {
  chat_id: string
  assistant_message: ChatMessage
  new_variation: string
  new_variation_index: number
  tokens_used: number
}

export interface GetChatHistoryResponse {
  chat_id: string | null
  messages: ChatMessage[]
}

// --- Phase 6: Speed Mode (Batch) ---

export interface BatchProduct {
  product_name: string
  asin?: string
  brand: string
  attributes: Record<string, string>
  product_type_name?: string
}

export interface CreateBatchRequest {
  name?: string
  category_id: string
  country_id: string
  products: BatchProduct[]
}

export interface CreateBatchResponse {
  batch_job: import('./database').LbBatchJob
  failed_products: Array<{ product_name: string; error: string }>
}

export interface BatchListingSummary {
  id: string
  product_name: string
  status: string
  created_at: string
}

export interface BatchStatusResponse {
  batch_job: import('./database').LbBatchJob
  listings: BatchListingSummary[]
}

export interface BatchExportRequest {
  export_type: 'csv' | 'flat_file'
}

export interface BatchExportResponse {
  formatted: { headers: string[]; rows: string[][] }
  listing_count: number
  export_log_ids: string[]
}

// --- Phase 9: Image Builder ---

export interface GenerateImageRequest {
  prompt: string
  provider: 'dalle3' | 'gemini' | 'higgsfield'
  model_id?: string
  orientation: 'square' | 'portrait' | 'landscape'
  listing_id?: string
  position?: string
}

export interface GenerateImageResponse {
  image: LbImageGeneration
}

export interface ImageWithDetails extends LbImageGeneration {
  listing?: {
    id: string
    title: string | null
    generation_context: Record<string, unknown>
  } | null
}

export interface ApproveImageRequest {
  action: 'approve' | 'reject'
}

export interface ImageChatRequest {
  message: string
}

export interface ImageChatResponse {
  chat_id: string
  refined_prompt: string
  new_image: LbImageGeneration
}

// --- Phase 10: A+ Content ---

export type APlusTemplateType = 'hero_banner' | 'comparison_chart' | 'feature_grid' | 'technical_specs' | 'usage_scenarios' | 'brand_story'

export interface HeroBannerContent {
  headline: string
  subheadline: string
  description: string
  cta_text: string
}

export interface ComparisonChartContent {
  columns: Array<{ header: string; features: string[] }>
}

export interface FeatureGridContent {
  features: Array<{ title: string; description: string }>
}

export interface TechnicalSpecsContent {
  specs: Array<{ label: string; value: string }>
}

export interface UsageScenariosContent {
  scenarios: Array<{ title: string; description: string }>
}

export interface BrandStoryContent {
  headline: string
  paragraphs: string[]
  cta_text: string
}

export type APlusContent =
  | HeroBannerContent
  | ComparisonChartContent
  | FeatureGridContent
  | TechnicalSpecsContent
  | UsageScenariosContent
  | BrandStoryContent

export interface CreateAPlusModuleRequest {
  template_type: APlusTemplateType
  listing_id?: string
  title?: string
}

export interface APlusModuleResponse {
  module: LbAPlusModule
}

export interface GenerateAPlusContentRequest {
  product_name: string
  brand: string
  category_name: string
  category_id?: string
  country_id?: string
}
