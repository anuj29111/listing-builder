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
| **Production URL** | `https://listing-builder-production.up.railway.app` |
| **GitHub** | `anuj29111/listing-builder` |
| **Table Prefix** | `lb_` (shared DB with Chalkola ONE, keyword-tracker, etc.) |
| **Storage Bucket** | `lb-research-files` |

---

## Phase Tracker

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project Foundation & DB Schema | **COMPLETED** |
| 1 | Core UI Shell + Auth + Admin | **COMPLETED** |
| 2 | Research Management (Upload) | **COMPLETED** |
| 3 | Research Analysis Engine | **COMPLETED** |
| 4 | Listing Builder - Single Mode | **COMPLETED** |
| 5 | Modular Chats | NOT STARTED |
| 6 | Speed Mode (Batch) | NOT STARTED |
| 7 | Research Acquisition (Apify/DataDive) | NOT STARTED |
| 8 | Google Drive Integration | NOT STARTED |
| 9 | Image Builder | NOT STARTED |
| 10 | A+ Content + Polish | NOT STARTED |

**Current Phase:** 5 (next)
**Last Updated:** February 9, 2026
**App Version:** 0.1.0

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
│   ├── settings/
│   │   ├── SettingsClient.tsx             # Tabs container (Categories, Users, Admin)
│   │   ├── CategoriesTab.tsx              # CRUD table + Dialog form
│   │   ├── UsersTab.tsx                   # User mgmt + role change
│   │   └── AdminSettingsTab.tsx           # Key-value settings
│   ├── providers/
│   │   └── AuthProvider.tsx               # Hydrates Zustand auth store
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
│   ├── auth.ts                            # Auth helpers (getAuthenticatedUser, upsertLoginUser)
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
**Production URL:** `https://listing-builder-production.up.railway.app`
**Railway Project:** `listing-builder` (linked via Railway CLI)

**Railway Environment Variables (set):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://listing-builder-production.up.railway.app`
- `NODE_ENV=production`

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

### Session 2 — February 7, 2026
- **Scope:** Phase 0 — full project scaffolding + database setup
- **What was done:**
  - Initialized Next.js 14.0.4 project, installed all dependencies
  - Configured Tailwind with HSL CSS variables, globals.css with light/dark themes
  - Created Supabase clients, TypeScript types, Zustand stores, utilities, constants
  - Created 12 shadcn/ui components, 4 shared components, layout components
  - Created 17 stub components, 9 placeholder pages, 17 API route stubs
  - Ran 15 database migrations, seeded 10 countries, created storage bucket, enabled RLS (60 policies)
  - Created GitHub repo, pushed, deployed to Railway
- **Issues fixed:** AlertDialogHeader/AlertDialogFooter → plain divs (not Radix exports)

### Session 3 — February 8, 2026
- **Scope:** Phase 1 — Core UI Shell + Auth + Admin
- **What was done:**
  - Created `src/lib/auth.ts` — shared auth helpers (`getAuthenticatedUser`, `requireAdmin`, `upsertLoginUser`)
  - Created `src/middleware.ts` — auth middleware with `@supabase/ssr` cookie pattern
  - Modified callback route — user auto-creation via `upsertLoginUser()`, first user = admin
  - Modified dashboard layout — queries `lb_users`, passes props to Sidebar/Header, wraps in AuthProvider
  - Created `src/components/providers/AuthProvider.tsx` — hydrates Zustand auth store
  - Modified Sidebar (userRole prop, admin badge) and Header (lbUser prop, avatar, admin badge)
  - Implemented API routes: categories CRUD, countries GET, admin users GET/PATCH, admin settings GET/PUT
  - Built dashboard page: 4 stat cards, recent listings, quick actions
  - Built settings page: SettingsClient (Tabs), CategoriesTab (CRUD), UsersTab (role mgmt), AdminSettingsTab (key-value)

### Session 4 — February 8, 2026
- **Scope:** Fix production deployment issues + OAuth login
- **What was done:**
  - Fixed 500 error: removed `src/app/(dashboard)/page.tsx` (redirect-only page caused `page_client-reference-manifest.js` missing error in Next.js 14.0.4)
  - Tried standalone mode for Railway — failed (Nixpacks `COPY . /app` overwrites build output), reverted
  - Pinned Node 20 in `package.json` engines field
  - Added `images.remotePatterns` for Google avatars in `next.config.js`
  - Fixed OAuth login: hardcoded production URL in login page + callback route (was using `process.env.NEXT_PUBLIC_APP_URL` which isn't available at build time in client components)
  - Fixed middleware: now runs Supabase `getUser()` for ALL routes (including `/auth/callback`) to ensure cookies are properly propagated during session exchange
  - Fixed stale Supabase anon key on Railway — the `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var had an old/invalid JWT, causing `exchangeCodeForSession` to fail with "Invalid API key 401"
  - Added `https://listing-builder-production.up.railway.app/auth/callback` to Supabase Auth → URL Configuration → Redirect URLs
- **Verification results:**
  - `npm run build` ✅
  - Railway deploy ✅
  - Health check ✅
  - Google OAuth login ✅ (tested end-to-end with @chalkola.com account)
  - User auto-created in `lb_users` as admin ✅

### Session 5 — February 8, 2026
- **Scope:** Phase 2 — Research Management (Upload)
- **What was done:**
  - Implemented `src/lib/csv-parser.ts` — PapaParse wrapper with BOM stripping, file type auto-detection (keywords/reviews/qna), row counting, 5-row preview
  - Added constants to `src/lib/constants.ts` — `FILE_TYPE_LABELS`, `FILE_TYPES`, `MAX_FILE_SIZE_BYTES`
  - Added `formatFileSize()` and `formatNumber()` helpers to `src/lib/utils.ts`
  - Implemented `src/stores/research-store.ts` — minimal Zustand store for category/country selection
  - Implemented `src/app/api/research/files/route.ts` — GET (list with filters + joins) + POST (FormData upload to Supabase Storage + DB insert with cleanup on failure)
  - Created `src/app/api/research/files/[id]/route.ts` — DELETE (storage + DB cleanup)
  - Implemented `src/app/api/research/status/route.ts` — GET coverage map (categories × countries → file types)
  - Built `src/components/dashboard/ResearchStatusMatrix.tsx` — category × country grid with colored dots per file type, clickable cells navigate to `/research?category=X&country=Y`
  - Built `src/components/research/FileUploader.tsx` — react-dropzone + file type selector + CSV preview + upload via FormData POST
  - Built `src/components/research/FileList.tsx` — table with type badges, delete with ConfirmDialog
  - Created `src/components/research/ResearchClient.tsx` — client wrapper with category/country dropdowns, manages files state, coordinates FileUploader + FileList
  - Built `src/app/(dashboard)/research/page.tsx` — server page fetching categories, countries, coverage, pre-filtered files in parallel
  - Fixed Railway deploy: git push didn't trigger auto-deploy — used `railway deploy` CLI to force direct upload, confirmed live with new image digest
  - Updated CLAUDE.md: Phase 2 → COMPLETED, Session 5 log, Phase 3 Handoff, new gotchas
- **Verification results:**
  - `npm run build` ✅ (28 routes, zero errors)
  - Railway deploy ✅ (healthcheck passed, confirmed live on production)
  - Research page verified working on production ✅

### Session 6 — February 8-9, 2026
- **Scope:** Phase 3 — Research Analysis Engine + API key config fix
- **What was done:**
  - Implemented `src/lib/claude.ts` — Anthropic API wrapper with typed result interfaces (KeywordAnalysisResult, ReviewAnalysisResult, QnAAnalysisResult), analysis prompts tailored to each CSV format, model `claude-sonnet-4-20250514`, MAX_TOKENS=8192
  - Implemented `src/app/api/research/analyze/route.ts` — POST endpoint: validates inputs, downloads CSVs from Supabase Storage, sends to Claude, caches JSONB result in `lb_research_analysis`, handles re-analysis by deleting existing records first
  - Created `src/app/api/research/analysis/route.ts` — GET endpoint for cached analysis results filtered by category/country/type
  - Updated `src/app/api/research/status/route.ts` — added `analysisStatus` map alongside `coverage` in response
  - Built `src/components/research/AnalysisProgress.tsx` — AnalysisProgress (status icon + badge) + AnalysisStatusPanel (lists 3 analysis types with Analyze/Re-analyze buttons)
  - Built `src/components/research/AnalysisViewer.tsx` — Tabbed display with KeywordAnalysisView (tiers, stats), ReviewAnalysisView (themes, sentiment), QnAAnalysisView (gaps, insights)
  - Created `src/components/research/AnalysisPageClient.tsx` — Client wrapper with optimistic UI updates, trigger flow, react-hot-toast notifications
  - Built `src/app/(dashboard)/research/[categoryId]/[countryId]/page.tsx` — Server page with breadcrumb, file summary cards, AnalysisPageClient
  - Modified `src/components/research/ResearchClient.tsx` — added "View Analysis" link when files exist
  - Fixed TypeScript build errors: `[...new Set()]` → `Array.from(new Set())`, typed analysis result casting, removed unused `FILE_TYPE_TO_ANALYSIS` constant
  - Updated `src/lib/claude.ts` to read API key from `lb_admin_settings` (key: `anthropic_api_key`) first, with env var fallback — admins can set/rotate key from Settings UI without redeploying
- **Verification results:**
  - `npm run build` ✅ (28 routes, zero errors)
  - Railway deploy ✅ (healthcheck passed, new image digest confirmed)
- **Pending user action:** Set `anthropic_api_key` in Admin Settings UI to enable Claude analysis

### Session 7 — February 9, 2026
- **Scope:** Phase 4 — Listing Builder - Single Mode (complete)
- **What was done:**
  - Replaced `src/stores/listing-store.ts` stub — full Zustand wizard store: 4 step tracking, category/country/product state, generation state, section review state, loadEditListing for edit mode
  - Extended `src/types/api.ts` — GenerateListingRequest, GenerateListingResponse, ListingWithJoins, UpdateListingSectionsRequest, ExportRequest, ExportResponse
  - Extended `src/lib/constants.ts` — SECTION_TYPE_LABELS (9 section labels), SECTION_CHAR_LIMIT_MAP (maps section to country char limit field)
  - Extended `src/lib/claude.ts` — `generateListing()` function + comprehensive prompt: conditionally includes keyword/review/Q&A data, generates 3 variations per section (SEO-focused, benefit-focused, balanced), max_tokens=12288
  - Replaced `src/app/api/listings/route.ts` — GET (list with joins) + POST (full generation pipeline: auth → fetch category/country → fetch cached analyses → optionally create product type → call Claude → insert listing + 9 sections with 3 variations each)
  - Replaced `src/app/api/listings/[id]/route.ts` — GET (with joins + ordered sections) + PATCH (update section selections + sync denormalized fields) + DELETE (cascade)
  - Replaced `src/app/api/export/route.ts` — POST: clipboard (formatted text), CSV (headers + rows), flat_file (Amazon format); logs to lb_export_logs
  - Replaced `src/app/(dashboard)/listings/new/page.tsx` — server page fetching categories + countries, supports `?edit=LISTING_ID` for edit mode
  - Created `src/components/listings/wizard/ListingWizard.tsx` — client wrapper with horizontal step indicator, Back/Next nav with per-step validation, "Start Over" reset
  - Replaced `StepCategoryCountry.tsx` — two selects, analysis availability check via API, status rows with green/yellow icons
  - Replaced `StepProductDetails.tsx` — product name, ASIN, brand, dynamic key-value attributes, product type name
  - Replaced `StepGeneration.tsx` — summary card, generate button with loading state, success/error display
  - Replaced `StepReviewExport.tsx` — sorted section cards, status dropdown, save button (PATCH), ExportOptions
  - Replaced `SectionCard.tsx` — variation Tabs (3 tabs: SEO/Benefit/Balanced), char count badge (green/yellow/red), approval Switch
  - Replaced `ExportOptions.tsx` — 3 export buttons (clipboard copy, CSV download, flat file download) with loading states
  - Replaced `src/app/(dashboard)/listings/page.tsx` — server page with listing query + joins
  - Created `src/components/listings/ListingsHistoryClient.tsx` — table with product/country/status/created/actions columns, delete confirmation, edit navigation
- **Files changed:** 18 files (16 modified + 2 new), +2,493 lines
- **Verification results:**
  - `npm run build` ✅ (28 routes, zero errors)
  - Railway deploy ✅ (healthcheck passed, image digest sha256:a743aae...)
- **Pending user action:** Set `anthropic_api_key` in Admin Settings UI to test end-to-end generation

---

## Lessons Learned / Gotchas

1. **`NEXT_PUBLIC_*` env vars in client components** — Inlined at build time, not read at runtime. If Railway builds before the env var is set, the value is `undefined`. **Always hardcode production URLs** in login/callback routes (matching keyword-tracker pattern).
2. **Supabase API keys on Railway** — If Supabase rotates keys, Railway env vars become stale. The error is `Invalid API key 401`. Always verify with `get_publishable_keys` MCP tool.
3. **Next.js 14.0.4 route groups** — A redirect-only `page.tsx` inside a route group `(dashboard)` causes missing `page_client-reference-manifest.js`. Don't create pages that only redirect.
4. **Nixpacks + standalone mode** — Nixpacks runs `COPY . /app` after build, overwriting `.next/standalone`. Don't use `output: 'standalone'` with Nixpacks. Use `npm run start` instead.
5. **Middleware cookie propagation** — The middleware must run the Supabase client for ALL routes (including `/auth/callback`) to ensure cookies from `exchangeCodeForSession` are properly propagated. Don't early-return before creating the Supabase client.
6. **Supabase Redirect URLs** — Multiple apps can share the same Supabase project. Each app needs its callback URL added to Auth → URL Configuration → Redirect URLs. The Site URL is separate and is the default fallback.
7. **FormData file upload** — Never set `Content-Type` header manually; the browser sets it with the multipart boundary. Server-side: convert File to Buffer via `Buffer.from(await file.arrayBuffer())` for Supabase Storage upload.
8. **DataDive CSV BOM character** — Keyword CSVs from DataDive start with `\uFEFF` (BOM). Must strip before header detection. Also have empty first column — filter empty strings from headers.
9. **Q&A vs Rufus Q&A** — Identical CSV format, can't auto-distinguish. Auto-detect defaults to `qna`, user manually selects `rufus_qna` via dropdown.
10. **Railway auto-deploy can silently fail** — Git pushes to `main` don't always trigger Railway auto-deploy (webhook issues). If production shows stale code after push, use `railway up` CLI to force a direct upload from local. Always verify deploy happened by checking `list-deployments` timestamps.
11. **TypeScript Set spread syntax** — `[...new Set()]` fails with `--downlevelIteration` error in Next.js 14.0.4 tsconfig. Use `Array.from(new Set())` instead.

---

## Current State (as of February 9, 2026)

### What's Working
- Google OAuth login with @chalkola.com ✅
- Dashboard with stat cards ✅
- Settings page: Categories CRUD, User management, Admin settings ✅
- Sidebar navigation with admin badge ✅
- Header with user avatar and name ✅
- Auth middleware protecting all dashboard routes ✅
- First user auto-created as admin ✅
- Production deploy on Railway ✅
- Health check endpoint ✅
- Research file upload (CSV drag-and-drop with preview, type auto-detection) ✅
- Research file list with delete ✅
- Research coverage status matrix (category × country grid with colored dots) ✅
- CSV parsing with BOM handling, row count, 5-row preview ✅
- File storage in Supabase Storage (`lb-research-files` bucket) ✅
- Research analysis engine: Claude AI analysis trigger + cached JSONB results ✅
- Analysis viewer page with keyword tiers, review themes, Q&A gaps ✅
- Analysis status panel with Analyze/Re-analyze buttons ✅
- Analysis progress tracking with optimistic UI updates ✅
- Anthropic API key configurable via Admin Settings UI (no Railway env var needed) ✅
- Listing builder: 4-step wizard (category/country → product details → generate → review/export) ✅
- Claude listing generation with 3 variation styles per section (SEO, benefit, balanced) ✅
- SectionCard with variation tabs, char count badges, approval switches ✅
- Export: clipboard copy, CSV download, Amazon flat file ✅
- Listings history page with table, edit, delete ✅

### What's Not Built Yet (stub pages/routes return 501)
- Modular chats (Phase 5)
- Speed/batch mode (Phase 6)
- Apify/DataDive integration (Phase 7)
- Google Drive integration (Phase 8)
- Image builder (Phase 9)
- A+ content (Phase 10)

---

## Phase 4 — COMPLETED

Phase 4 (Listing Builder - Single Mode) was completed in Session 7. See Session Log above for details.

**To test end-to-end:** Set `anthropic_api_key` in Admin Settings UI (or `ANTHROPIC_API_KEY` env var as fallback).

## Phase 5 Handoff — Modular Chats

**Goal:** Per-section chat refinement with cascading context — refine any section via chat with Claude, with approved sections flowing as context into subsequent refinements.

### What Phase 4 Already Built
- `SectionCard.tsx` with variation tabs, char count, approval switch
- `StepReviewExport.tsx` showing all 9 sections with selection/approval state
- `PATCH /api/listings/[id]` for saving section selections
- Full listing generation with 3 variations per section

### What Phase 5 Needs to Implement
- `src/components/listings/ModularChat.tsx` — Chat UI per section (collapsible panel)
- `src/app/api/listings/[id]/chats/[section]/route.ts` — GET + POST chat messages
- Updated `SectionCard.tsx` with chat toggle button
- Chat context: includes current section text + all approved section texts as context
- Messages stored in `lb_listing_chats` table (JSONB messages array)

