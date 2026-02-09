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
} from './api'

export type Brand = 'Chalkola' | 'Spedalon' | 'Funcils' | 'Other'
export type FileType = 'keywords' | 'reviews' | 'qna' | 'rufus_qna'
export type AnalysisType = 'keyword_analysis' | 'review_analysis' | 'qna_analysis'
export type ListingStatus = 'draft' | 'review' | 'approved' | 'exported'
export type SectionType = 'title' | 'bullet_1' | 'bullet_2' | 'bullet_3' | 'bullet_4' | 'bullet_5' | 'description' | 'search_terms' | 'subject_matter'
export type ImageProvider = 'dalle3' | 'gemini'
export type SyncType = 'google_drive' | 'apify' | 'datadive'
export type ExportType = 'csv' | 'clipboard' | 'flat_file'
