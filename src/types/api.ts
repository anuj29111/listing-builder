import type { LbListing, LbListingSection, LbProductType } from './database'

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
