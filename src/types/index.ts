export type {
  LbUser,
  LbCategory,
  LbCountry,
  LbResearchFile,
  LbResearchAnalysis,
  LbProductType,
  LbBatchJob,
  LbListing,
  LbListingSection,
  LbListingChat,
  LbImageGeneration,
  LbImageChat,
  LbAdminSetting,
  LbSyncLog,
  LbExportLog,
  LbAPlusModule,
  BulletPlanningMatrixEntry,
  ExistingListingText,
  GenerationPhase,
  KeywordCoverage,
  KeywordPlacement,
  LbProduct,
  LbAsinLookup,
  LbKeywordSearch,
  LbAsinReview,
} from './database'

export type {
  APIResponse,
  PaginatedResponse,
  GenerateListingRequest,
  GenerateListingResponse,
  ListingWithJoins,
  UpdateListingSectionsRequest,
  ExportRequest,
  ExportResponse,
  GenerateImageRequest,
  GenerateImageResponse,
  ImageWithDetails,
  ApproveImageRequest,
  ImageChatRequest,
  ImageChatResponse,
  APlusTemplateType,
  HeroBannerContent,
  ComparisonChartContent,
  FeatureGridContent,
  TechnicalSpecsContent,
  UsageScenariosContent,
  BrandStoryContent,
  APlusContent,
  CreateAPlusModuleRequest,
  APlusModuleResponse,
  GenerateAPlusContentRequest,
  CompetitorAnalysisResult,
  QnACoverageResult,
  ImageStackRecommendation,
  ImageStackRecommendationsResult,
  PhaseGenerateRequest,
  PhaseGenerateResponse,
  TitlePhaseResult,
  BulletsPhaseResult,
  DescriptionPhaseResult,
  BackendPhaseResult,
} from './api'

export type Brand = 'Chalkola' | 'Spedalon' | 'Funcils' | 'Other'
export type FileType = 'keywords' | 'reviews' | 'qna' | 'rufus_qna' | 'keywords_analysis' | 'reviews_analysis' | 'qna_analysis' | 'sp_prompts'
export type AnalysisType = 'keyword_analysis' | 'review_analysis' | 'qna_analysis' | 'competitor_analysis'
export type AnalysisSource = 'csv' | 'file' | 'merged'
export type ListingStatus = 'draft' | 'review' | 'approved' | 'exported'
export type SectionType = 'title' | 'bullet_1' | 'bullet_2' | 'bullet_3' | 'bullet_4' | 'bullet_5' | 'description' | 'search_terms' | 'subject_matter'
export type ImageProvider = 'openai' | 'gemini' | 'higgsfield'
export type SyncType = 'google_drive' | 'apify' | 'datadive'
export type ExportType = 'csv' | 'clipboard' | 'flat_file'
export type APlusStatus = 'draft' | 'review' | 'approved'
