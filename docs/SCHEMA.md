# Database Schema Reference

> This file is reference material moved out of CLAUDE.md to save context.
> Only consult when you need exact column names, types, or DDL.

## Table Overview (16 tables)

| Table | Purpose |
|-------|---------|
| `lb_users` | Users with role (admin/user), synced from Supabase Auth |
| `lb_categories` | Product categories (Chalk Markers, Vacuum Bags, etc.) |
| `lb_countries` | Marketplaces with character limits and language |
| `lb_research_files` | Registry of uploaded CSV files in Supabase Storage |
| `lb_research_analysis` | Cached Claude AI analysis (JSONB) per category/country |
| `lb_product_types` | Product variations within a category |
| `lb_listings` | Generated listing content with status tracking |
| `lb_listing_sections` | Per-section variations and selection state |
| `lb_listing_chats` | Chat history per listing section |
| `lb_image_generations` | AI-generated images with approval flow |
| `lb_image_chats` | Chat refinement for images |
| `lb_batch_jobs` | Batch generation job tracking |
| `lb_admin_settings` | API keys, config values |
| `lb_sync_logs` | Google Drive / external sync logs |
| `lb_export_logs` | Listing export audit trail |
| `lb_aplus_modules` | A+ content templates and content |

## Full SQL (Migration Order)

**Migration 1: lb_users**
```sql
CREATE TABLE lb_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_users_auth_id ON lb_users(auth_id);
CREATE INDEX idx_lb_users_email ON lb_users(email);
```

**Migration 2: lb_categories**
```sql
CREATE TABLE lb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  brand TEXT NOT NULL CHECK (brand IN ('Chalkola', 'Spedalon', 'Funcils', 'Other')),
  created_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_categories_brand ON lb_categories(brand);
```

**Migration 3: lb_countries**
```sql
CREATE TABLE lb_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  language TEXT NOT NULL,
  amazon_domain TEXT NOT NULL,
  flag_emoji TEXT,
  currency TEXT,
  title_limit INTEGER DEFAULT 200,
  bullet_limit INTEGER DEFAULT 500,
  bullet_count INTEGER DEFAULT 5,
  description_limit INTEGER DEFAULT 2000,
  search_terms_limit INTEGER DEFAULT 250,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 4: lb_research_files**
```sql
CREATE TABLE lb_research_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES lb_categories(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES lb_countries(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('keywords', 'reviews', 'qna', 'rufus_qna')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_upload' CHECK (source IN ('manual_upload', 'google_drive', 'apify', 'datadive')),
  file_size_bytes BIGINT,
  row_count INTEGER,
  uploaded_by UUID REFERENCES lb_users(id),
  google_drive_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_research_files_category ON lb_research_files(category_id);
CREATE INDEX idx_lb_research_files_country ON lb_research_files(country_id);
CREATE INDEX idx_lb_research_files_type ON lb_research_files(file_type);
```

**Migration 5: lb_research_analysis**
```sql
CREATE TABLE lb_research_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES lb_categories(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES lb_countries(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('keyword_analysis', 'review_analysis', 'qna_analysis')),
  source_file_ids UUID[] NOT NULL,
  analysis_result JSONB NOT NULL DEFAULT '{}',
  model_used TEXT,
  tokens_used INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  analyzed_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, country_id, analysis_type)
);
CREATE INDEX idx_lb_research_analysis_category ON lb_research_analysis(category_id);
CREATE INDEX idx_lb_research_analysis_country ON lb_research_analysis(country_id);
CREATE INDEX idx_lb_research_analysis_status ON lb_research_analysis(status);
```

**Migration 6: lb_product_types**
```sql
CREATE TABLE lb_product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES lb_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asin TEXT,
  attributes JSONB DEFAULT '{}',
  created_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_product_types_category ON lb_product_types(category_id);
```

**Migration 7: lb_batch_jobs**
```sql
CREATE TABLE lb_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  category_id UUID NOT NULL REFERENCES lb_categories(id),
  country_id UUID NOT NULL REFERENCES lb_countries(id),
  product_type_ids UUID[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_listings INTEGER DEFAULT 0,
  completed_listings INTEGER DEFAULT 0,
  created_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 8: lb_listings**
```sql
CREATE TABLE lb_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID REFERENCES lb_product_types(id),
  country_id UUID NOT NULL REFERENCES lb_countries(id),
  title TEXT,
  bullet_points JSONB DEFAULT '[]',
  description TEXT,
  search_terms TEXT,
  subject_matter JSONB DEFAULT '[]',
  backend_keywords TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'exported')),
  generation_context JSONB DEFAULT '{}',
  model_used TEXT,
  tokens_used INTEGER,
  created_by UUID REFERENCES lb_users(id),
  approved_by UUID REFERENCES lb_users(id),
  batch_job_id UUID REFERENCES lb_batch_jobs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_listings_product_type ON lb_listings(product_type_id);
CREATE INDEX idx_lb_listings_country ON lb_listings(country_id);
CREATE INDEX idx_lb_listings_status ON lb_listings(status);
CREATE INDEX idx_lb_listings_created_by ON lb_listings(created_by);
```

**Migration 9: lb_listing_sections**
```sql
CREATE TABLE lb_listing_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES lb_listings(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN (
    'title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5',
    'description', 'search_terms', 'subject_matter'
  )),
  variations JSONB DEFAULT '[]',
  selected_variation INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_listing_sections_listing ON lb_listing_sections(listing_id);
```

**Migration 10: lb_listing_chats**
```sql
CREATE TABLE lb_listing_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES lb_listings(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_listing_chats_listing ON lb_listing_chats(listing_id);
```

**Migration 11: lb_image_generations**
```sql
CREATE TABLE lb_image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES lb_listings(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('dalle3', 'gemini')),
  preview_url TEXT,
  full_url TEXT,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'approved', 'rejected')),
  cost_cents INTEGER DEFAULT 0,
  created_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lb_image_generations_listing ON lb_image_generations(listing_id);
```

**Migration 12: lb_image_chats**
```sql
CREATE TABLE lb_image_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_generation_id UUID NOT NULL REFERENCES lb_image_generations(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 13: lb_admin_settings**
```sql
CREATE TABLE lb_admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 14: lb_sync_logs**
```sql
CREATE TABLE lb_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('google_drive', 'apify', 'datadive')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed')),
  details JSONB DEFAULT '{}',
  files_synced INTEGER DEFAULT 0,
  error_message TEXT,
  triggered_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Migration 15: lb_export_logs**
```sql
CREATE TABLE lb_export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES lb_listings(id),
  export_type TEXT NOT NULL CHECK (export_type IN ('csv', 'clipboard', 'flat_file')),
  exported_by UUID REFERENCES lb_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Seed Data: lb_countries
```sql
INSERT INTO lb_countries (name, code, language, amazon_domain, flag_emoji, currency, title_limit, bullet_limit, bullet_count, description_limit, search_terms_limit, is_active) VALUES
('United States', 'US', 'English', 'amazon.com', '🇺🇸', 'USD', 200, 500, 5, 2000, 250, true),
('United Kingdom', 'UK', 'English', 'amazon.co.uk', '🇬🇧', 'GBP', 200, 500, 5, 2000, 250, true),
('Germany', 'DE', 'German', 'amazon.de', '🇩🇪', 'EUR', 200, 500, 5, 2000, 250, true),
('France', 'FR', 'French', 'amazon.fr', '🇫🇷', 'EUR', 200, 500, 5, 2000, 250, true),
('Canada', 'CA', 'English', 'amazon.ca', '🇨🇦', 'CAD', 200, 500, 5, 2000, 250, true),
('Italy', 'IT', 'Italian', 'amazon.it', '🇮🇹', 'EUR', 200, 500, 5, 2000, 250, false),
('Spain', 'ES', 'Spanish', 'amazon.es', '🇪🇸', 'EUR', 200, 500, 5, 2000, 250, false),
('Mexico', 'MX', 'Spanish', 'amazon.com.mx', '🇲🇽', 'MXN', 200, 500, 5, 2000, 250, false),
('Australia', 'AU', 'English', 'amazon.com.au', '🇦🇺', 'AUD', 200, 500, 5, 2000, 250, true),
('UAE', 'AE', 'English', 'amazon.ae', '🇦🇪', 'AED', 200, 500, 5, 2000, 250, true);
```

## RLS Policy Pattern

All tables use this pattern:
```sql
ALTER TABLE lb_<table> ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY "lb_<table>_select" ON lb_<table>
  FOR SELECT TO authenticated USING (true);

-- Write: all authenticated users
CREATE POLICY "lb_<table>_insert" ON lb_<table>
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lb_<table>_update" ON lb_<table>
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "lb_<table>_delete" ON lb_<table>
  FOR DELETE TO authenticated USING (true);
```

Exception — `lb_admin_settings` restricted to admin role:
```sql
CREATE POLICY "lb_admin_settings_select" ON lb_admin_settings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (SELECT auth_id FROM lb_users WHERE role = 'admin'));
```
