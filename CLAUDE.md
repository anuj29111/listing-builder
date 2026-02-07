# Amazon Listing Builder Platform

## Quick Reference

| Key | Value |
|-----|-------|
| **Framework** | Next.js 14 + TypeScript (App Router, `src/` directory) |
| **Styling** | Tailwind CSS + shadcn/ui HSL variables |
| **State** | Zustand |
| **Database** | Supabase PostgreSQL (shared project `yawaopfqkkvdqtsagmng`) |
| **Auth** | Google OAuth via Supabase Auth (`@chalkola.com` only) |
| **Deployment** | Railway (auto-deploy from GitHub `main`) |
| **GitHub** | `anuj29111/listing-builder` |
| **Table Prefix** | `lb_` (shared DB with Chalkola ONE, keyword-tracker, etc.) |
| **Storage Bucket** | `lb-research-files` |

---

## Phase Tracker

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project Foundation & DB Schema | **NOT STARTED** |
| 1 | Core UI Shell + Auth + Admin | NOT STARTED |
| 2 | Research Management (Upload) | NOT STARTED |
| 3 | Research Analysis Engine | NOT STARTED |
| 4 | Listing Builder - Single Mode | NOT STARTED |
| 5 | Modular Chats | NOT STARTED |
| 6 | Speed Mode (Batch) | NOT STARTED |
| 7 | Research Acquisition (Apify/DataDive) | NOT STARTED |
| 8 | Google Drive Integration | NOT STARTED |
| 9 | Image Builder | NOT STARTED |
| 10 | A+ Content + Polish | NOT STARTED |

**Current Phase:** 0
**Last Updated:** February 7, 2026
**App Version:** 0.0.0

### Phase Dependencies & Parallelization Rules

**IMPORTANT: Phases 0 → 1 → 2 → 3 → 4 MUST run sequentially. Do NOT attempt to skip or parallelize these.**

If a user asks to start a phase before its dependency is complete, REFUSE and explain which phase must finish first.

```
Phase 0 (foundation, DB, folders)         ← MUST BE FIRST
  └── Phase 1 (auth, sidebar, admin)      ← needs Phase 0
        └── Phase 2 (research upload)     ← needs Phase 1
              ├── Phase 3 (analysis)      ← needs Phase 2
              │     └── Phase 4 (listing builder) ← needs Phase 3
              │           ├── Phase 5 (modular chats)   ← CAN PARALLEL after Phase 4
              │           │     └── Phase 6 (batch mode) ← needs Phase 5
              │           ├── Phase 9 (image builder)    ← CAN PARALLEL after Phase 4
              │           └── Phase 10 (A+ content)      ← CAN PARALLEL after Phase 4
              ├── Phase 7 (Apify/DataDive)  ← CAN PARALLEL after Phase 2
              └── Phase 8 (Google Drive)    ← CAN PARALLEL after Phase 2
```

**Sequential (no choice):** 0 → 1 → 2 → 3 → 4
**After Phase 4 completes, these can run in parallel sessions:**
- Session A: Phase 5 → Phase 6
- Session B: Phase 9 (images)
- Session C: Phase 10 (A+ content)
**After Phase 2 completes, these can also run in parallel:**
- Phase 7 (Apify/DataDive) — independent of Phase 3/4
- Phase 8 (Google Drive) — independent of Phase 3/4

---

## Project Overview

Internal tool for 10-15 people managing Amazon FBA brands (**Chalkola**, **Spedalon**, **Funcils**) across 8-10 international marketplaces.

**Core Architecture: Category-Level Intelligence Caching**
Research is analyzed once per category/country combination by Claude AI, then reused for all products in that category. Eliminates 90%+ of redundant research work.

**Data Flow:**
```
Research Files (CSV upload) → Supabase Storage → Claude Analysis → Cached JSONB → Listing Generation → Modular Chat Refinement → Export
```

**What it generates:** Title, 5 bullet points, description, search terms, subject matter — per product, per marketplace.

---

## Tech Stack

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | `14.0.4` | Framework (App Router) |
| `react` / `react-dom` | `^18.2.0` | UI |
| `typescript` | `^5.3.0` | Type safety |
| `tailwindcss` | `^3.4.0` | Styling |
| `@supabase/supabase-js` | `^2.39.0` | Database client |
| `@supabase/ssr` | `^0.1.0` | Server-side Supabase |
| `zustand` | `^5.0.0` | State management |

### UI
| Package | Version | Purpose |
|---------|---------|---------|
| `lucide-react` | `^0.303.0` | Icons |
| `recharts` | `^2.10.3` | Charts |
| `class-variance-authority` | `^0.7.0` | Component variants |
| `clsx` | `^2.1.0` | Class merging |
| `tailwind-merge` | `^2.2.0` | Tailwind class merge |
| `react-hot-toast` | `^2.4.0` | Notifications |
| `react-dropzone` | `^14.2.3` | File upload |

### AI & APIs
| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | `^0.24.0` | Claude AI (analysis + generation) |
| `openai` | `^4.24.0` | DALL-E 3 images (Phase 9) |
| `@google/generative-ai` | `^0.21.0` | Gemini images (Phase 9) |
| `googleapis` | `^144.0.0` | Google Drive sync (Phase 8) |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `papaparse` | `^5.4.0` | CSV parsing |
| `date-fns` | `^3.0.0` | Date formatting |
| `zod` | `^3.22.0` | Schema validation |

### Radix UI Primitives (add as needed)
`@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-switch`, `@radix-ui/react-label`, `@radix-ui/react-separator`, `@radix-ui/react-progress`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-toast`

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx                 # Google OAuth login page
│   │   └── auth/callback/route.ts         # OAuth callback handler
│   ├── (dashboard)/
│   │   ├── layout.tsx                     # Sidebar + header shell
│   │   ├── page.tsx                       # Redirect to /dashboard
│   │   ├── dashboard/page.tsx             # Stats + research matrix
│   │   ├── research/
│   │   │   ├── page.tsx                   # Research file management + status matrix
│   │   │   └── [categoryId]/
│   │   │       └── [countryId]/page.tsx   # Analysis viewer
│   │   ├── listings/
│   │   │   ├── page.tsx                   # Listing history
│   │   │   ├── new/page.tsx               # Single mode wizard
│   │   │   └── speed/page.tsx             # Batch/speed mode
│   │   ├── images/page.tsx                # Image builder (Phase 9)
│   │   ├── aplus/page.tsx                 # A+ content (Phase 10)
│   │   └── settings/page.tsx              # Admin settings
│   ├── api/
│   │   ├── health/route.ts               # Health check
│   │   ├── categories/
│   │   │   ├── route.ts                   # GET list, POST create
│   │   │   └── [id]/route.ts             # GET, PATCH, DELETE
│   │   ├── countries/route.ts             # GET list
│   │   ├── research/
│   │   │   ├── files/route.ts             # GET, POST upload
│   │   │   ├── analyze/route.ts           # POST trigger analysis
│   │   │   └── status/route.ts            # GET status matrix
│   │   ├── listings/
│   │   │   ├── route.ts                   # GET, POST
│   │   │   ├── [id]/route.ts             # GET, PATCH, DELETE
│   │   │   └── [id]/chats/
│   │   │       └── [section]/route.ts     # GET, POST chat messages
│   │   ├── images/
│   │   │   ├── generate/route.ts          # POST generate image
│   │   │   └── [id]/route.ts             # GET, PATCH approve/reject
│   │   ├── batch/
│   │   │   ├── route.ts                   # GET, POST batch job
│   │   │   └── [id]/route.ts             # GET status, PATCH
│   │   ├── admin/
│   │   │   ├── settings/route.ts          # GET, PUT settings
│   │   │   └── users/route.ts             # GET, PATCH users
│   │   └── export/route.ts               # POST export listing
│   ├── globals.css                        # Tailwind + HSL variables
│   ├── layout.tsx                         # Root layout (fonts, metadata)
│   └── page.tsx                           # Root → redirect to /login or /dashboard
├── components/
│   ├── ui/                                # Reusable primitives (Button, Input, Select, Badge, Dialog, etc.)
│   ├── layouts/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── dashboard/
│   │   ├── StatsCards.tsx
│   │   ├── ResearchStatusMatrix.tsx
│   │   ├── RecentListings.tsx
│   │   └── QuickActions.tsx
│   ├── research/
│   │   ├── FileUploader.tsx
│   │   ├── FileList.tsx
│   │   ├── AnalysisViewer.tsx
│   │   └── AnalysisProgress.tsx
│   ├── listings/
│   │   ├── wizard/
│   │   │   ├── StepCategoryCountry.tsx
│   │   │   ├── StepProductDetails.tsx
│   │   │   ├── StepGeneration.tsx
│   │   │   └── StepReviewExport.tsx
│   │   ├── SectionCard.tsx
│   │   ├── ModularChat.tsx
│   │   └── ExportOptions.tsx
│   ├── images/
│   │   ├── PromptEditor.tsx
│   │   └── ImageGallery.tsx
│   └── shared/
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       ├── ConfirmDialog.tsx
│       └── StatusBadge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                      # Browser client (createBrowserClient)
│   │   └── server.ts                      # Server client + admin client
│   ├── claude.ts                          # Anthropic API wrapper
│   ├── openai.ts                          # DALL-E wrapper
│   ├── gemini.ts                          # Google Gemini wrapper
│   ├── google-drive.ts                    # Google Drive API wrapper
│   ├── csv-parser.ts                      # PapaParse wrapper with format detection
│   ├── utils.ts                           # cn(), formatDate, etc.
│   └── constants.ts                       # Character limits, section types, brands
├── stores/
│   ├── auth-store.ts                      # User session state
│   ├── research-store.ts                  # Research files + analysis cache
│   ├── listing-store.ts                   # Listing wizard state
│   └── ui-store.ts                        # Sidebar, modals, etc.
└── types/
    ├── database.ts                        # Row types for all lb_* tables
    ├── api.ts                             # API request/response types
    └── index.ts                           # Shared enums, unions
```

---

## Database Schema

### Overview (16 tables)

| Table | Purpose | Phase |
|-------|---------|-------|
| `lb_users` | Users with role (admin/user), synced from Supabase Auth | 0 |
| `lb_categories` | Product categories (Chalk Markers, Vacuum Bags, etc.) | 0 |
| `lb_countries` | Marketplaces with character limits and language | 0 |
| `lb_research_files` | Registry of uploaded CSV files in Supabase Storage | 0 |
| `lb_research_analysis` | Cached Claude AI analysis (JSONB) per category/country | 0 |
| `lb_product_types` | Product variations within a category | 0 |
| `lb_listings` | Generated listing content with status tracking | 0 |
| `lb_listing_sections` | Per-section variations and selection state | 0 |
| `lb_listing_chats` | Chat history per listing section | 0 |
| `lb_image_generations` | AI-generated images with approval flow | 0 |
| `lb_image_chats` | Chat refinement for images | 0 |
| `lb_batch_jobs` | Batch generation job tracking | 0 |
| `lb_admin_settings` | API keys, config values | 0 |
| `lb_sync_logs` | Google Drive / external sync logs | 0 |
| `lb_export_logs` | Listing export audit trail | 0 |
| `lb_aplus_modules` | A+ content templates and content | 10 |

### Full SQL (Migration Order)

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

**Migration 7: lb_batch_jobs** (before lb_listings due to FK)
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

### Seed Data: lb_countries
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

### RLS Policy Pattern
All tables use this pattern:
```sql
ALTER TABLE lb_<table> ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY "lb_<table>_select" ON lb_<table>
  FOR SELECT TO authenticated
  USING (true);

-- Write: all authenticated users (or admin-only for lb_admin_settings)
CREATE POLICY "lb_<table>_insert" ON lb_<table>
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "lb_<table>_update" ON lb_<table>
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "lb_<table>_delete" ON lb_<table>
  FOR DELETE TO authenticated
  USING (true);
```

For `lb_admin_settings` — restrict to admin role:
```sql
CREATE POLICY "lb_admin_settings_select" ON lb_admin_settings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (SELECT auth_id FROM lb_users WHERE role = 'admin'));
```

---

## Environment Variables

```bash
# .env.local

# Supabase (SAME project as Chalkola ONE, keyword-tracker)
NEXT_PUBLIC_SUPABASE_URL=https://yawaopfqkkvdqtsagmng.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard>

# AI APIs (add when needed per phase)
ANTHROPIC_API_KEY=           # Phase 3
OPENAI_API_KEY=              # Phase 9
GOOGLE_AI_API_KEY=           # Phase 9

# Google Drive (Phase 8)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## Key Conventions

### Naming
- **Tables:** `lb_snake_case` (e.g., `lb_research_files`)
- **Components:** PascalCase (e.g., `SectionCard.tsx`)
- **Non-component files:** kebab-case (e.g., `csv-parser.ts`)
- **API routes:** kebab-case folders (e.g., `/api/research/files/route.ts`)
- **Types:** PascalCase interfaces (e.g., `ResearchFile`, `ListingSection`)
- **Zustand stores:** `use<Name>Store` (e.g., `useListingStore`)
- **Brands:** Always capitalized: `Chalkola`, `Spedalon`, `Funcils`

### Component Patterns
- Server Components by default, `'use client'` only when needed (interactivity, hooks, browser APIs)
- API routes for all mutations (never mutate from client directly)
- Direct Supabase client reads OK for real-time/client-side data
- Collocate page-specific components in the page folder when small

### Supabase Patterns (from keyword-tracker)
- Use `@supabase/ssr` with separate `client.ts` (browser) and `server.ts` (server + admin)
- Server routes: `createClient()` from `server.ts`
- Admin operations: `createAdminClient()` with service_role key
- RLS: Always wrap `auth.uid()` in `(SELECT auth.uid())` for performance
- Index all columns used in RLS policies and foreign keys

### TypeScript
- Strict mode enabled
- No `any` types — use `unknown` and narrow
- All Supabase responses typed via `types/database.ts`

### CSS / Tailwind
- HSL CSS variables for theming (shadcn/ui pattern from keyword-tracker)
- `darkMode: ['class']` in tailwind config
- Mobile-responsive with sidebar collapse on small screens

---

## Research File Formats

### Keywords CSV (DataDive export)
```
Columns: Search Terms, Type, SV (search volume), Relev. (relevancy score), Sugg. bid & range, [ASIN rank columns...]
Rows: ~600 per file
Example: "chalk markers", "edit", 281733, 0.684, "", 5, 1, 14, ...
```

### Reviews CSV (Apify scrape)
```
Columns: Date, Author, Verified, Helpful, Title, Body, Rating, Images, Videos, URL, Variation, Style
Rows: ~3000+ per file
```

### Q&A CSV (Amazon scrape)
```
Format: Question/Answer pairs, one pair per row
Rows: ~30-100 per file
```

### Rufus Q&A CSV (Amazon Rufus AI)
```
Same format as Q&A CSV but from Amazon's Rufus AI responses
Rows: ~30-100 per file
```

---

## Amazon Character Limits

| Element | Default Limit | Notes |
|---------|--------------|-------|
| Title | 200 chars | Some categories allow 250 |
| Each Bullet | 500 chars | Usually 5 bullets per listing |
| Description | 2000 chars | HTML allowed in some markets |
| Search Terms | 250 chars | Backend only, not visible |
| Subject Matter | 250 chars | Per field, up to 5 fields |

These are stored per-country in `lb_countries` and can be customized.

---

## Phase Details

### Phase 0: Project Foundation & DB Schema
**What:** Initialize the entire project scaffolding, database, and configuration.
**Steps:**
1. `npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
2. Install all dependencies from Tech Stack
3. Configure Tailwind with HSL variables (match keyword-tracker `tailwind.config.js`)
4. Create full folder structure
5. Set up Supabase clients (`lib/supabase/client.ts` + `server.ts`)
6. Create `.env.local` + `.env.example`
7. Run all 15 migrations via Supabase MCP
8. Seed `lb_countries` with 10 marketplaces
9. Create `lb-research-files` storage bucket
10. Enable RLS on all tables with basic policies
11. Create TypeScript types (`types/database.ts`)
12. Create placeholder pages for all routes
13. Create health check API (`/api/health`)
14. Create `railway.toml`, `.gitignore`
15. Git init, commit, create GitHub repo, push
16. Verify: dev server, build, health check, DB tables, login page
**Verify:** `npm run dev` works, `npm run build` succeeds, `/api/health` returns OK, all 15 `lb_*` tables exist in Supabase.

### Phase 1: Core UI Shell + Auth + Admin
**What:** Working app with login, sidebar navigation, dashboard layout, admin settings, and categories CRUD.
**Depends on:** Phase 0
**Key files:**
- `app/(auth)/login/page.tsx` — Google OAuth login (pattern from keyword-tracker)
- `app/(auth)/auth/callback/route.ts` — OAuth callback
- `app/(dashboard)/layout.tsx` — Sidebar + header shell
- `app/(dashboard)/dashboard/page.tsx` — Dashboard with stat cards
- `app/(dashboard)/settings/page.tsx` — Admin settings (API keys, config)
- `components/layouts/Sidebar.tsx` — Navigation sidebar
- `components/layouts/Header.tsx` — Top header with user menu
- `api/categories/route.ts` — Categories CRUD
- `api/admin/settings/route.ts` — Admin settings API
- Middleware for auth protection
**Verify:** Can login with @chalkola.com, see dashboard, manage categories, update admin settings.

### Phase 2: Research Management (Upload)
**What:** Upload CSV files, organize by category/country, view research status matrix.
**Depends on:** Phase 1
**Key files:**
- `app/(dashboard)/research/page.tsx` — File upload + status matrix
- `components/research/FileUploader.tsx` — Drag-and-drop CSV upload
- `components/research/FileList.tsx` — List of uploaded files per category/country
- `components/dashboard/ResearchStatusMatrix.tsx` — Category x Country grid
- `api/research/files/route.ts` — Upload to Supabase Storage + registry
**Verify:** Can upload CSVs, see them organized by category/country, status matrix shows coverage.

### Phase 3: Research Analysis Engine
**What:** Trigger Claude analysis on uploaded CSVs, cache results, view analysis.
**Depends on:** Phase 2
**Key files:**
- `lib/claude.ts` — Anthropic API wrapper with analysis prompts
- `api/research/analyze/route.ts` — Trigger + poll analysis
- `app/(dashboard)/research/[categoryId]/[countryId]/page.tsx` — Analysis viewer
- `components/research/AnalysisViewer.tsx` — Display keyword tiers, review themes, Q&A gaps
- `components/research/AnalysisProgress.tsx` — Progress during analysis
**Verify:** Trigger analysis on uploaded CSVs, see cached JSONB results, re-analysis works.

### Phase 4: Listing Builder - Single Mode
**What:** 4-step wizard to generate a single listing using cached analysis.
**Depends on:** Phase 3
**Key files:**
- `app/(dashboard)/listings/new/page.tsx` — Wizard container
- `components/listings/wizard/Step*.tsx` — 4 wizard steps
- `components/listings/SectionCard.tsx` — Display section with variations
- `api/listings/route.ts` — Generate listing via Claude
- `components/listings/ExportOptions.tsx` — CSV, clipboard export
**Verify:** Walk through wizard, generate listing, see variations per section, export.

### Phase 5: Modular Chats
**What:** Per-section chat refinement with cascading context.
**Depends on:** Phase 4
**Key files:**
- `components/listings/ModularChat.tsx` — Chat UI per section
- `api/listings/[id]/chats/[section]/route.ts` — Chat API
- Updated SectionCard with chat toggle
**Verify:** Open chat for title, refine, approved title context flows into bullet generation.

### Phase 6: Speed Mode (Batch)
**What:** Chat-first batch generation for multiple products.
**Depends on:** Phase 5
**Key files:**
- `app/(dashboard)/listings/speed/page.tsx` — Speed mode UI
- `api/batch/route.ts` — Batch job creation + processing
- Batch export functionality
**Verify:** Enter multiple products via chat, batch generate, quick approve, bulk export.

### Phase 7: Research Acquisition (Apify/DataDive)
**What:** Automated scraping integrations for reviews, keywords, Q&A.
**Depends on:** Phase 2
**Key files:**
- `lib/apify.ts` — Apify API wrapper
- `api/research/scrape/route.ts` — Trigger scraping jobs
- Scraping status tracking UI
**Verify:** Enter ASINs, trigger review scrape, results auto-populate research files.

### Phase 8: Google Drive Integration
**What:** Sync research files from Google Drive automatically.
**Depends on:** Phase 2
**Key files:**
- `lib/google-drive.ts` — Google Drive API wrapper
- `api/sync/google-drive/route.ts` — Sync trigger + polling
- Sync status UI
**Verify:** Connect Drive folder, sync detects new files, auto-registers in system.

### Phase 9: Image Builder
**What:** AI image generation with DALL-E 3 + Gemini, preview/approve flow.
**Depends on:** Phase 4
**Key files:**
- `lib/openai.ts` — DALL-E 3 wrapper
- `lib/gemini.ts` — Gemini wrapper
- `app/(dashboard)/images/page.tsx` — Image builder UI
- `api/images/generate/route.ts` — Generate images
- 1K preview → 4K on approval
**Verify:** Generate product images, preview at 1K, approve to get 4K, refine via chat.

### Phase 10: A+ Content + Polish
**What:** A+ content module templates, analytics dashboard, performance optimization.
**Depends on:** Phase 4
**Key files:**
- `app/(dashboard)/aplus/page.tsx` — A+ content builder
- Hero banner, comparison chart, feature highlight templates
- Dashboard analytics with Recharts
**Verify:** Generate A+ content from templates, export, dashboard shows usage stats.

---

## Development Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build (ALWAYS test before pushing)
npm run start        # Start production server
npm run lint         # ESLint check
```

---

## Deployment

**Platform:** Railway (auto-deploys from GitHub `main` branch)
**Build:** Nixpacks (auto-detected Next.js)
**Health check:** `GET /api/health`

```toml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**After code changes:** commit → push to main → Railway auto-deploys.
**Production URL:** Will be set after first Railway deploy (update login redirect URL).

---

## Reference Patterns (from keyword-tracker)

### Supabase Server Client Pattern
File: `/Users/anuj/Desktop/Github/keyword-tracker/lib/supabase/server.ts`
- `createClient()` — uses cookies, anon key
- `createAdminClient()` — no cookies, service role key

### Supabase Browser Client Pattern
File: `/Users/anuj/Desktop/Github/keyword-tracker/lib/supabase/client.ts`
- `createBrowserClient()` from `@supabase/ssr`

### Google OAuth Login Pattern
File: `/Users/anuj/Desktop/Github/keyword-tracker/app/login/page.tsx`
- Uses production URL for redirect (not `window.location.origin`)
- `prompt: 'select_account'` to force account selection
- @chalkola.com restriction message

### Auth Callback Pattern
File: `/Users/anuj/Desktop/Github/keyword-tracker/app/auth/callback/route.ts`
- Exchanges code for session
- Redirects to production URL + `/dashboard`

### Tailwind Config Pattern
File: `/Users/anuj/Desktop/Github/keyword-tracker/tailwind.config.js`
- HSL CSS variables for shadcn/ui
- `darkMode: ['class']`
- Custom success/warning colors
- Geist font family
- Accordion + pulse-slow animations

---

## Session Log

### Session 1 — February 7, 2026
- **Scope:** Created CLAUDE.md file
- **What was done:** Designed and wrote the complete CLAUDE.md with all phases, database schema, project structure, conventions, and reference patterns
- **Next:** Execute Phase 0 (project initialization + database setup)
