export const APP_NAME = 'Listing Builder'
export const APP_DESCRIPTION = 'Amazon listing generation platform'
export const APP_VERSION = '0.0.0'

export const BRANDS = ['Chalkola', 'Spedalon', 'Funcils', 'Other'] as const

export const FILE_TYPES = ['keywords', 'reviews', 'qna', 'rufus_qna', 'keywords_analysis', 'reviews_analysis', 'qna_analysis', 'sp_prompts'] as const

export const ANALYSIS_TYPES = ['keyword_analysis', 'review_analysis', 'qna_analysis', 'competitor_analysis'] as const

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

export const IMAGE_PROVIDERS = ['openai', 'gemini', 'higgsfield'] as const

export const GEMINI_MODELS = [
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro', cost: 4 },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana (Flash)', cost: 2 },
] as const

export const HIGGSFIELD_MODELS = [
  { id: 'higgsfield-ai/soul/standard', label: 'Soul Standard' },
  { id: 'reve/text-to-image', label: 'Reve' },
  { id: 'bytedance/seedream/v4/text-to-image', label: 'SeedReam v4' },
] as const

export const IMAGE_PROVIDER_LABELS: Record<string, string> = {
  openai: 'GPT Image (OpenAI)',
  gemini: 'Gemini (Google)',
  higgsfield: 'Higgsfield AI',
}

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
  keywords: 'Keywords — Raw Data (CSV)',
  reviews: 'Reviews — Raw Data (CSV)',
  qna: 'Q&A — Raw Data (CSV)',
  rufus_qna: 'Rufus Q&A — Raw Data (CSV)',
  keywords_analysis: 'Keywords — Analysis File (MD/JSON)',
  reviews_analysis: 'Reviews — Analysis File (MD/JSON)',
  qna_analysis: 'Q&A — Analysis File (MD/JSON)',
  sp_prompts: 'Amz SP Prompts — Amazon Ads (XLSX/CSV)',
}

// Short labels for file list badges (keeps the table clean)
export const FILE_TYPE_SHORT_LABELS: Record<string, string> = {
  keywords: 'Keywords — CSV',
  reviews: 'Reviews — CSV',
  qna: 'Q&A — CSV',
  rufus_qna: 'Rufus Q&A — CSV',
  keywords_analysis: 'Keywords — Analysis',
  reviews_analysis: 'Reviews — Analysis',
  qna_analysis: 'Q&A — Analysis',
  sp_prompts: 'SP Prompts',
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

export const DEFAULT_CHAR_LIMITS = {
  title: 200,
  bullet: 500,
  bulletCount: 5,
  description: 2000,
  searchTerms: 250,
}

// --- Phase 9: Image Builder ---

export const IMAGE_POSITIONS = [
  'main', 'image_1', 'image_2', 'image_3', 'image_4',
  'image_5', 'image_6', 'image_7', 'aplus_hero', 'aplus_comparison',
] as const

export const IMAGE_POSITION_LABELS: Record<string, string> = {
  main: 'Main Image',
  image_1: 'Image 1 — Q&A Gap',
  image_2: 'Image 2 — Feature Highlight',
  image_3: 'Image 3 — Size/Scale',
  image_4: 'Image 4 — Lifestyle',
  image_5: 'Image 5 — Bundle/Flat Lay',
  image_6: 'Image 6 — Comparison',
  image_7: 'Image 7 — In Action',
  aplus_hero: 'A+ Hero Banner',
  aplus_comparison: 'A+ Comparison',
}

export const IMAGE_ORIENTATIONS = ['square', 'portrait', 'landscape'] as const

export const IMAGE_ORIENTATION_LABELS: Record<string, string> = {
  square: 'Square (1:1)',
  portrait: 'Portrait (9:16)',
  landscape: 'Landscape (16:9)',
}

export const IMAGE_QUALITIES = ['standard', 'hd'] as const

export const IMAGE_BACKGROUNDS = ['White', 'Transparent', 'Lifestyle', 'Studio', 'Custom'] as const
export const IMAGE_LIGHTINGS = ['Studio', 'Natural', 'Dramatic', 'Soft', 'Backlit'] as const
export const IMAGE_ANGLES = ['Front', 'Top-down', '45-degree', 'Side', 'Close-up'] as const
export const IMAGE_ARRANGEMENTS = ['Single product', 'Group/Bundle', 'In-use', 'Flat lay', 'Comparison'] as const

// --- Phase 10: A+ Content ---

export const APLUS_TEMPLATE_TYPES = [
  'hero_banner', 'comparison_chart', 'feature_grid',
  'technical_specs', 'usage_scenarios', 'brand_story',
] as const

export const APLUS_TEMPLATE_LABELS: Record<string, string> = {
  hero_banner: 'Hero Banner',
  comparison_chart: 'Comparison Chart',
  feature_grid: 'Feature Grid',
  technical_specs: 'Technical Specs',
  usage_scenarios: 'Usage Scenarios',
  brand_story: 'Brand Story',
}

export const APLUS_TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  hero_banner: 'Full-width banner with headline, description, and call-to-action',
  comparison_chart: 'Side-by-side feature comparison across product variants',
  feature_grid: 'Grid of 3-5 key features with titles and descriptions',
  technical_specs: 'Detailed technical specifications in a clean table format',
  usage_scenarios: 'Real-world usage scenarios demonstrating product benefits',
  brand_story: 'Brand narrative with company values and mission',
}

// --- AI Model Configuration ---

export interface ClaudeModelConfig {
  id: string
  name: string
  description: string
  inputPer1M: number   // USD per 1M input tokens
  outputPer1M: number  // USD per 1M output tokens
  tier: 'budget' | 'recommended' | 'premium'
}

export const CLAUDE_MODELS: ClaudeModelConfig[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fastest model. Great for simple refinements and quick tasks.',
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    tier: 'budget',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Best balance of speed, quality, and cost.',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    tier: 'recommended',
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    description: 'Most intelligent. Best for complex listings and critical content.',
    inputPer1M: 5.00,
    outputPer1M: 25.00,
    tier: 'premium',
  },
]

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'

// --- Phased Generation ---

export const GENERATION_PHASES = ['title', 'bullets', 'description', 'backend'] as const

export const GENERATION_PHASE_LABELS: Record<string, string> = {
  title: 'Title',
  bullets: 'Bullet Points',
  description: 'Description & Search Terms',
  backend: 'Subject Matter & Backend',
}

export const GENERATION_PHASE_DESCRIPTIONS: Record<string, string> = {
  title: 'Generate 5 title variations with highest-priority keywords',
  bullets: 'Generate 5 bullets × 9 variations, covering remaining keywords',
  description: 'Generate descriptions and search terms, filling keyword gaps',
  backend: 'Generate subject matter and backend attribute recommendations',
}
