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
  optimization_mode?: 'new' | 'optimize_existing'
  existing_listing_text?: { title: string; bullets: string[]; description: string }
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
    final_text?: string | null
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
  provider: 'openai' | 'gemini' | 'higgsfield'
  model_id?: string
  orientation: 'square' | 'portrait' | 'landscape'
  listing_id?: string
  position?: string
  // Higgsfield-specific (when provider='higgsfield')
  hf_model?: import('./database').HfModel
  hf_aspect_ratio?: string
  hf_resolution?: string
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

// --- Workshop (Main Image SOP) ---

export interface WorkshopPrompt {
  label: string
  prompt: string
  approach: string
  frame_fill: string
  camera_angle: string
  lighting: string
  emotional_target: string[]
  props: string[]
  post_processing: string
  compliance_notes: string
  color_direction: string
  callout: string
}

export interface GenerateWorkshopPromptsRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  name?: string
  image_type?: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'
  workshop_id?: string
}

export interface GenerateWorkshopPromptsResponse {
  workshop: import('./database').LbImageWorkshop
  prompts: WorkshopPrompt[]
  callout_suggestions: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>
}

export interface BatchGenerateRequest {
  workshop_id: string
  prompts: Array<{ prompt: string; label: string; position?: number }>
  provider: 'openai' | 'gemini' | 'higgsfield'
  orientation: 'square' | 'portrait' | 'landscape'
  model_id?: string
  image_type?: 'main' | 'secondary' | 'video_thumbnail' | 'swatch'
}

export interface BatchGenerateResponse {
  results: Array<{
    label: string
    image: import('./database').LbImageGeneration | null
    error: string | null
  }>
  total: number
  succeeded: number
  failed: number
}

export interface UpdateWorkshopRequest {
  step?: number
  element_tags?: Record<string, string[]>
  final_image_id?: string
  callout_texts?: Array<{ type: 'keyword' | 'benefit' | 'usp'; text: string }>
  competitor_urls?: string[]
  generated_prompts?: unknown[]
  selected_prompt_indices?: number[]
  provider?: 'openai' | 'gemini' | 'higgsfield'
  orientation?: 'square' | 'portrait' | 'landscape'
  creative_brief?: CreativeBrief | null
  product_photos?: string[]
  product_photo_descriptions?: Record<string, ProductPhotoDescription> | null
}

// --- Secondary Image Concepts ---

export interface SecondaryImageConcept {
  position: number
  title: string
  headline: string
  sub_headline: string
  visual_reference: string
  hero_image: string
  supporting_visuals: string
  background: string
  unique_selling_point: string
  prompt: string
  layout_type: string
  icon_descriptions: string[]
  typography: string
  color_palette: string
  target_audience: string
  mood: string
  camera_focus: string
  compliance_notes: string
  aesthetic_reference: string
}

export interface GenerateSecondaryPromptsRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  workshop_id?: string
}

export interface GenerateSecondaryPromptsResponse {
  workshop: import('./database').LbImageWorkshop
  concepts: SecondaryImageConcept[]
}

// --- Video Thumbnail Concepts ---

export interface VideoThumbnailConcept {
  position: number
  title: string
  approach: string
  description: string
  text_overlay: string
  prompt: string
  camera_angle: string
  lighting: string
  mood: string
  color_direction: string
  compliance_notes: string
}

// --- Video Storyboard ---

export interface VideoStoryboardShot {
  shot_number: number
  timestamp: string
  runtime: string
  visual: string
  setting_props: string
  camera: string
  text_overlay: string
  audio_notes: string
  thumbnail: string
  usp_demonstrated: string
}

export interface VideoStoryboard {
  total_runtime: string
  shots: VideoStoryboardShot[]
  music_direction: string
  brand_integration: string
}

export interface GenerateVideoStoryboardRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  workshop_id?: string
}

export interface GenerateVideoStoryboardResponse {
  workshop: import('./database').LbImageWorkshop
  storyboard: VideoStoryboard
}

export interface GenerateThumbnailPromptsRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  workshop_id?: string
}

export interface GenerateThumbnailPromptsResponse {
  workshop: import('./database').LbImageWorkshop
  concepts: VideoThumbnailConcept[]
}

// --- Swatch Image Concepts ---

export interface SwatchVariant {
  name: string
  color_hex?: string
  material?: string
  description?: string
}

export interface SwatchConcept {
  position: number
  variant_name: string
  prompt: string
}

export interface GenerateSwatchPromptsRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  variants: SwatchVariant[]
}

export interface GenerateSwatchPromptsResponse {
  workshop: import('./database').LbImageWorkshop
  concepts: SwatchConcept[]
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

// --- A+ Content Strategy (Full Visual Direction) ---

export interface APlusStrategyModule {
  position: number
  strategic_role: string
  template_type: string
  title: string
  text_content: Record<string, unknown>
  visual_concept: string
  image_description: string
  key_features_highlighted: string[]
  color_direction: string
}

export interface APlusStrategy {
  modules: APlusStrategyModule[]
  storytelling_flow: string
}

export interface GenerateAPlusStrategyRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  workshop_id?: string
}

export interface GenerateAPlusStrategyResponse {
  strategy: APlusStrategy
  model: string
  tokensUsed: number
}

// --- Creative Brief Types ---

export interface CreativeBriefPainPoint {
  pain_point: string
  evidence_source: string
  mention_count: number
  suggested_image_position: number
  visual_proof_direction: string
}

export interface CreativeBriefUSP {
  usp: string
  evidence: string
  competitor_weakness: string
  suggested_image_position: number
  visual_demo_direction: string
}

export interface CreativeBriefPersona {
  name: string
  description: string
  demographics: string
  lifestyle_scene_direction: string
  emotional_trigger: string
}

export interface CreativeBriefVisualDirection {
  primary_colors: string[]
  secondary_colors: string[]
  mood: string[]
  style: string
  typography_direction: string
  photography_style: string
}

export interface CreativeBriefCompetitorGap {
  gap: string
  what_competitors_show: string
  what_we_should_show: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface CreativeBrief {
  top_pain_points: CreativeBriefPainPoint[]
  top_usps: CreativeBriefUSP[]
  personas: CreativeBriefPersona[]
  customer_voice_phrases: string[]
  visual_direction: CreativeBriefVisualDirection
  competitor_visual_gaps: CreativeBriefCompetitorGap[]
  product_description_from_photos: string | null
  image_position_strategy: string
}

export interface ProductPhotoDescription {
  description: string
  detected_features: string[]
  dominant_colors: string[]
  suggested_angles: string[]
  photo_type: string
}

export interface GenerateCreativeBriefRequest {
  product_name: string
  brand: string
  category_id: string
  country_id: string
  listing_id?: string
  workshop_id: string
  market_intelligence_id?: string
}

export interface GenerateCreativeBriefResponse {
  brief: CreativeBrief
  model: string
  tokensUsed: number
}

export interface UploadProductPhotosRequest {
  workshop_id: string
}

export interface UploadProductPhotosResponse {
  photo_urls: string[]
}

export interface AnalyzeProductPhotosRequest {
  workshop_id: string
  photo_urls: string[]
}

export interface AnalyzeProductPhotosResponse {
  descriptions: Record<string, ProductPhotoDescription>
}

// --- Listing Enhancement Types ---

export interface CompetitorAnalysisResult {
  executiveSummary: string
  competitors: Array<{
    title: string
    bullets: string[]
    description: string
  }>
  titlePatterns: Array<{
    pattern: string
    frequency: number
    example: string
  }>
  bulletThemes: Array<{
    theme: string
    frequency: number
    examples: string[]
  }>
  featureComparisonMatrix: Array<{
    feature: string
    competitors: Record<string, boolean | string>
  }>
  differentiationGaps: Array<{
    gap: string
    opportunity: string
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  }>
  usps: Array<{
    usp: string
    evidence: string
    competitorWeakness: string
  }>
}

export interface QnACoverageResult {
  overallScore: number
  totalQuestions: number
  addressedCount: number
  partiallyAddressedCount: number
  unaddressedCount: number
  coverageMatrix: Array<{
    question: string
    addressed: boolean
    partially: boolean
    addressedIn: string | null
    excerpt: string | null
    recommendation: string | null
  }>
}

export interface ImageStackRecommendation {
  position: number
  recommendedType: string
  rationale: string
  evidence: {
    keywordSignals: string[]
    reviewMentions: number
    qnaQuestions: number
  }
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface ImageStackRecommendationsResult {
  recommendations: ImageStackRecommendation[]
  overallStrategy: string
}

// --- Phased Generation Types ---

export interface PhaseGenerateRequest {
  phase: 'title' | 'bullets' | 'description' | 'backend'
  listing_id?: string
  // Creation fields (title phase only):
  category_id?: string
  country_id?: string
  product_name?: string
  asin?: string
  brand?: string
  attributes?: Record<string, string>
  product_type_name?: string
  optimization_mode?: 'new' | 'optimize_existing'
  existing_listing_text?: { title: string; bullets: string[]; description: string }
}

export interface TitlePhaseResult {
  titles: string[]
  keywordCoverage: import('./database').KeywordCoverage
}

export interface BulletsPhaseResult {
  planningMatrix: import('./database').BulletPlanningMatrixEntry[]
  bullets: string[][]  // Each bullet is [variation1, variation2, variation3]
  keywordCoverage: import('./database').KeywordCoverage
}

export interface DescriptionPhaseResult {
  descriptions: string[]
  searchTerms: string[]
  keywordCoverage: import('./database').KeywordCoverage
}

export interface BackendPhaseResult {
  subjectMatter: string[][]
  backendAttributes: Record<string, string[]>
  keywordCoverage: import('./database').KeywordCoverage
}

export interface PhaseGenerateResponse {
  phase: 'title' | 'bullets' | 'description' | 'backend'
  listing_id: string
  sections: LbListingSection[]
  model: string
  tokensUsed: number
  totalTokensUsed: number
  keywordCoverage: import('./database').KeywordCoverage
  planningMatrix?: import('./database').BulletPlanningMatrixEntry[] | null
  backendAttributes?: Record<string, string[]> | null
  productType?: import('./database').LbProductType | null
}
