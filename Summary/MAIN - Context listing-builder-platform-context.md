# Amazon Listing Builder Platform - Complete Context Document

> **Version:** 1.0  
> **Last Updated:** January 2025  
> **Status:** Phase 1 Complete, Phase 2 Ready  
> **Owner:** Anuj (Amazon FBA Operations)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [Business Context](#business-context)
5. [System Architecture](#system-architecture)
6. [Tech Stack](#tech-stack)
7. [Database Schema](#database-schema)
8. [Module Specifications](#module-specifications)
9. [User Interface Flows](#user-interface-flows)
10. [API Endpoints](#api-endpoints)
11. [AI Integration](#ai-integration)
12. [Key Design Decisions](#key-design-decisions)
13. [Implementation Phases](#implementation-phases)
14. [File Structure](#file-structure)
15. [Environment Configuration](#environment-configuration)
16. [Deployment](#deployment)
17. [Future Considerations](#future-considerations)

---

## Executive Summary

The **Amazon Listing Builder Platform** is an AI-powered system designed to eliminate repetitive research analysis across Amazon product listings and marketplaces. It leverages cached category-level research (keywords, Q&A, reviews) to generate optimized listings using Claude AI, with support for multiple international marketplaces.

### Key Value Propositions

1. **Category-Level Intelligence**: Research done once per category/country, reused across all products
2. **AI-Powered Generation**: Claude with extended thinking mode for deep analysis and listing optimization
3. **Multi-Marketplace Support**: 8-10 international Amazon marketplaces with intelligent fallback
4. **Modular Chat Architecture**: Per-section refinement without overwhelming global chat
5. **Research-Driven Automation**: Every output grounded in actual customer data

---

## Problem Statement

### Current Pain Points

1. **Repetitive Research**: Same keyword, Q&A, and review analysis performed for every listing
2. **Inconsistent Quality**: No standardized approach across team members
3. **Time Intensive**: Manual research takes 2-4 hours per listing
4. **Multi-Marketplace Complexity**: 8-10 countries require separate research and translations
5. **No Centralized Knowledge**: Research insights lost between projects
6. **Limited Scalability**: Can't efficiently create batch listings for new products

### Business Impact

- Team of 10-15 people managing multiple Amazon FBA brands (Chalkola, Spedalon, Funcils)
- Operations span 8-10 international marketplaces
- Current toolset: Google Sheets (Gorilla API), Slack, ClickUp, Google Drive
- Need to improve efficiency without replacing team

---

## Solution Overview

### Core Concept

Build a unified platform where:
1. Research files (Keywords CSV, Q&A CSV, Reviews CSV) are stored in Google Drive
2. System automatically syncs and detects new/updated files
3. Claude AI performs deep analysis once per category/country combination
4. Analysis results are cached in Supabase
5. All listing generation uses cached analysis (not raw files)
6. Users can refine individual sections via modular chats
7. Batch mode allows creating 5-10 listings at once via chat

### System Flow

```
Google Drive (Research Files)
         ↓
    Auto/Manual Sync
         ↓
   Supabase (File Registry)
         ↓
   Claude AI Analysis (with extended thinking)
         ↓
   Supabase (Cached Analysis as JSON)
         ↓
   Listing Generation (uses cached analysis)
         ↓
   Section Cards with Modular Chats
         ↓
   Export (CSV, Slack, Email)
```

---

## Business Context

### Brands & Products

| Brand | Category | Primary Markets |
|-------|----------|-----------------|
| Chalkola | Chalk Markers, Art Supplies | US, UK, DE, FR, CA |
| Spedalon | Vacuum Storage Bags | US, UK, DE |
| Funcils | Various | Multiple |

### Target Marketplaces

| Code | Country | Language | Marketplace |
|------|---------|----------|-------------|
| US | United States | English | amazon.com |
| UK | United Kingdom | English | amazon.co.uk |
| DE | Germany | German | amazon.de |
| FR | France | French | amazon.fr |
| IT | Italy | Italian | amazon.it |
| ES | Spain | Spanish | amazon.es |
| CA | Canada | English | amazon.ca |
| MX | Mexico | Spanish | amazon.com.mx |
| AU | Australia | English | amazon.com.au |
| AE | UAE | English | amazon.ae |

### Character Limits by Marketplace

| Element | Default Limit | Notes |
|---------|---------------|-------|
| Title | 200 chars | Some categories allow 250 |
| Bullets | 500 chars each | 5-10 bullets depending on category |
| Description | 2000 chars | HTML allowed in some cases |
| Search Terms | 250 chars | Backend only, not visible |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                     │
│  ┌─────────┐  ┌─────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │Dashboard│  │Listing      │  │Image      │  │Admin         │  │
│  │         │  │Builder      │  │Builder    │  │Settings      │  │
│  └─────────┘  └─────────────┘  └───────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  API Routes       │
                    │  (Next.js)        │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐   ┌─────────▼─────────┐   ┌──────▼──────┐
│  Supabase     │   │  Claude API       │   │ Google      │
│  (PostgreSQL) │   │  (Anthropic)      │   │ Drive API   │
│               │   │                   │   │             │
│ - Users       │   │ - Analysis        │   │ - Research  │
│ - Categories  │   │ - Generation      │   │   Files     │
│ - Research    │   │ - Chat Refinement │   │ - Images    │
│ - Listings    │   │                   │   │             │
│ - Analysis    │   ├───────────────────┤   └─────────────┘
│   Cache       │   │  OpenAI API       │
│               │   │  (DALL-E 3)       │
│               │   ├───────────────────┤
│               │   │  Google AI API    │
│               │   │  (Gemini)         │
└───────────────┘   └───────────────────┘
```

### Data Flow Patterns

#### Research Sync Flow
```
1. User clicks "Sync Now" OR Auto-sync triggers
2. System calls Google Drive API to scan folder structure
3. Compare file modified dates with Supabase registry
4. If new/updated files found:
   a. Update research_files table
   b. Mark existing analysis as "outdated"
   c. Queue for re-analysis
   d. Send notification (Slack/Email)
```

#### Listing Generation Flow
```
1. User selects Category + Country
2. System checks research_analysis for current analysis
3. If missing/outdated → show warning, offer to run analysis
4. User enters Product Details
5. System retrieves cached analysis JSON
6. Claude generates listing using analysis + product details
7. Results displayed in Section Cards
8. User can refine via Modular Chats
9. User approves sections
10. Export to CSV/Slack/Email
```

#### Analysis Freshness Logic
```
IF analysis.analyzed_at > file.file_last_modified THEN
   Use cached analysis (current)
ELSE
   Analysis is outdated → trigger re-analysis
```

---

## Tech Stack

### Confirmed Technologies

| Layer | Technology | Reason |
|-------|------------|--------|
| Frontend | Next.js 14 (React) | Modern, API routes built-in, works with Railway |
| Styling | Tailwind CSS | Utility-first, fast development |
| State Management | Zustand | Lightweight, simple |
| Database | Supabase (PostgreSQL) | Already using, proven |
| ORM | Supabase Client | Direct integration |
| File Storage | Google Drive | Already using for research |
| AI - Analysis | Claude API (Anthropic) | Extended thinking, deep analysis |
| AI - Images | OpenAI (DALL-E 3) | High quality product images |
| AI - Images | Google Gemini | Alternative/comparison |
| Deployment | Railway | Already using |
| Repository | GitHub | Using GitHub Desktop |
| Notifications | Slack Webhooks | Team already on Slack |

### Package Dependencies

```json
{
  "dependencies": {
    "next": "14.2.21",
    "react": "^18.3.1",
    "@supabase/supabase-js": "^2.47.12",
    "@anthropic-ai/sdk": "^0.37.0",
    "openai": "^4.77.0",
    "@google/generative-ai": "^0.21.0",
    "googleapis": "^144.0.0",
    "zustand": "^5.0.2",
    "lucide-react": "^0.468.0",
    "react-hot-toast": "^2.4.1",
    "papaparse": "^5.4.1",
    "date-fns": "^4.1.0"
  }
}
```

---

## Database Schema

### Entity Relationship Diagram (Conceptual)

```
users
  │
  ├──< listings (created_by, approved_by)
  ├──< batch_jobs (created_by)
  ├──< export_logs (exported_by)
  └──< sync_logs (triggered_by)

categories
  │
  ├──< product_types
  ├──< research_files
  ├──< research_analysis
  ├──< listings
  ├──< image_generations
  └──< batch_jobs

countries
  │
  ├──< research_files
  ├──< research_analysis
  ├──< listings
  ├──< image_generations
  └──< batch_jobs

listings
  │
  ├──< listing_chats
  └──< image_generations

research_analysis
  │
  └──< listings (research_analysis_id)
```

### Complete Table Definitions

#### 1. users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. categories
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. countries
```sql
CREATE TABLE countries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  marketplace_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  title_limit INTEGER DEFAULT 200,
  bullet_limit INTEGER DEFAULT 500,
  description_limit INTEGER DEFAULT 2000,
  search_terms_limit INTEGER DEFAULT 250,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 4. research_files
```sql
CREATE TABLE research_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('keywords', 'qna', 'reviews', 'competitors')),
  file_name TEXT NOT NULL,
  google_drive_file_id TEXT NOT NULL,
  google_drive_url TEXT,
  file_size_bytes BIGINT,
  file_last_modified TIMESTAMPTZ NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, country_id, file_type)
);
```

#### 5. research_analysis (THE CACHE)
```sql
CREATE TABLE research_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('keywords', 'qna_gaps', 'review_themes', 'competitor_matrix', 'full')),
  source_file_ids UUID[] NOT NULL,
  analysis_data JSONB NOT NULL,  -- Full Claude output stored here
  summary TEXT,
  status TEXT DEFAULT 'current' CHECK (status IN ('current', 'outdated', 'processing', 'failed')),
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, country_id, analysis_type)
);
```

#### 6. product_types
```sql
CREATE TABLE product_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  default_features JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);
```

#### 7. listings
```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  product_type_id UUID REFERENCES product_types(id),
  product_name TEXT NOT NULL,
  asin TEXT,
  sku TEXT,
  product_details JSONB NOT NULL,
  generated_content JSONB NOT NULL,
  selected_content JSONB,
  research_analysis_id UUID REFERENCES research_analysis(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'exported')),
  is_featured BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  exported_at TIMESTAMPTZ,
  tokens_used INTEGER,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 8. listing_chats
```sql
CREATE TABLE listing_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK (section_type IN (
    'title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5',
    'bullet_6', 'bullet_7', 'bullet_8', 'bullet_9', 'bullet_10',
    'description', 'search_terms'
  )),
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 9. image_generations
```sql
CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES categories(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  position TEXT NOT NULL,
  prompt TEXT NOT NULL,
  prompt_template_id TEXT,
  model TEXT NOT NULL,
  resolution TEXT DEFAULT '1024x1024',
  quality TEXT DEFAULT 'standard',
  image_url TEXT,
  google_drive_file_id TEXT,
  google_drive_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'approved', 'failed')),
  is_approved BOOLEAN DEFAULT false,
  is_4k_generated BOOLEAN DEFAULT false,
  estimated_cost DECIMAL(10, 4),
  error_message TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 10. image_chats
```sql
CREATE TABLE image_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_generation_id UUID REFERENCES image_generations(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 11. batch_jobs
```sql
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('listings', 'images', 'aplus')),
  total_items INTEGER NOT NULL,
  completed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  input_context JSONB NOT NULL,
  result_listing_ids UUID[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 12. admin_settings
```sql
CREATE TABLE admin_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 13. export_logs
```sql
CREATE TABLE export_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id),
  batch_job_id UUID REFERENCES batch_jobs(id),
  export_type TEXT NOT NULL CHECK (export_type IN ('csv', 'excel', 'slack', 'email', 'clipboard')),
  destination TEXT,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  exported_by UUID REFERENCES users(id),
  exported_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 14. sync_logs
```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('manual', 'auto', 'webhook')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  files_checked INTEGER DEFAULT 0,
  files_new INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  analysis_queued INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  triggered_by UUID REFERENCES users(id)
);
```

### Key JSONB Structures

#### product_details (in listings)
```json
{
  "brand_name": "Chalkola",
  "pack_size": 40,
  "colors": ["standard", "neon", "metallic"],
  "nib_size": "6mm reversible",
  "features": ["washable", "non-toxic", "quick-dry"],
  "dimensions": "15x10x5 cm",
  "target_use_cases": ["menu boards", "glass", "mirrors"],
  "target_customer": "restaurant owners, teachers, crafters",
  "special_features": ["reversible tip", "water-based ink"]
}
```

#### generated_content (in listings)
```json
{
  "titles": [
    {
      "id": "title_1",
      "text": "Chalkola Chalk Markers 40-Pack...",
      "character_count": 195,
      "keywords_used": ["chalk markers", "window markers"]
    }
  ],
  "bullets": [
    {
      "id": "bullet_1",
      "bullet_number": 1,
      "theme": "Vibrant Colors",
      "variations": {
        "short": {"text": "...", "character_count": 130},
        "medium": {"text": "...", "character_count": 165},
        "long": {"text": "...", "character_count": 195}
      },
      "keywords_incorporated": ["vibrant", "bold"],
      "qna_gaps_addressed": ["color opacity"],
      "review_themes_addressed": ["bright colors"]
    }
  ],
  "description": [...],
  "search_terms": [...],
  "backend_attributes": {
    "material": "water-based ink",
    "surface_recommendation": "non-porous surfaces"
  }
}
```

#### analysis_data (in research_analysis)
```json
{
  "keywords": {
    "total_keywords": 1247,
    "high_relevancy": [...],
    "medium_relevancy": [...],
    "low_relevancy": [...],
    "themes": [...],
    "target_audience_insights": [...]
  },
  "qna_gaps": {
    "total_questions": 156,
    "critical_gaps": [...],
    "important_gaps": [...],
    "optional_gaps": [...],
    "question_themes": [...]
  },
  "review_themes": {
    "total_reviews": 2341,
    "use_cases": [...],
    "strengths": [...],
    "weaknesses": [...],
    "language_patterns": {...},
    "customer_voice_phrases": [...]
  },
  "competitor_matrix": {...},
  "rufus_patterns": {...}
}
```

---

## Module Specifications

### Module 1: Dashboard

#### Purpose
Central hub showing research status and quick access to recent work.

#### Components
1. **Stats Cards**: Total listings, research complete ratio, images generated, batch jobs
2. **Quick Actions**: New Listing, Speed Mode, Image Builder, Sync Research
3. **Research Status Matrix**: Categories (rows) × Countries (columns) with status indicators
4. **Recent Listings**: Last 5-10 listings with status badges

#### Research Status Indicators
- ✅ **Complete** (green): All files present, analysis current
- ⚠️ **Partial** (yellow): Some files missing or analysis outdated
- ❌ **Missing** (gray): No files or no analysis

---

### Module 2: Listing Builder - Single Mode

#### Purpose
Step-by-step wizard for creating individual optimized listings.

#### Wizard Flow

**Step 1: Category & Country Selection**
- Dropdown for category selection
- Dropdown for country/marketplace selection
- Real-time research status display
- File update dates shown
- "Continue" only if research exists or fallback confirmed

**Step 2: Product Details**
- Product type selection (from product_types table)
- Brand name input
- Pack size input
- Features (structured inputs)
- Similar listings dropdown (from same category/country)
- "Use as Base" option for existing listings

**Step 3: Generation**
- Progress indicators for each section
- Claude generates using cached analysis
- Estimated time: 2-3 minutes
- Shows: "Analyzing keywords... Processing Q&A gaps... Generating titles..."

**Step 4: Section Cards with Modular Chats**
```
┌─────────────────────────────────────────────────────────────┐
│ TITLE SECTION                                      [Approve]│
├─────────────────────────────────────────────────────────────┤
│ ○ Title 1: Chalkola Chalk Markers 40-Pack...   (195 chars) │
│ ○ Title 2: Premium Chalk Markers Set...        (188 chars) │
│ ○ Title 3: Liquid Chalk Markers...             (192 chars) │
├─────────────────────────────────────────────────────────────┤
│ 💬 Title Chat                                    [Expand ▼] │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Context: Research + Product details + Competitor titles ││
│ │ User: Can you make it more keyword-rich?                ││
│ │ Claude: Here's a revised version focusing on...         ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Step 5: Export Options**
- Copy to clipboard
- Download CSV/Excel
- Send to Slack (admin-configured webhook)
- Send via Email (admin-configured recipients)
- Save to listing history

#### Section Types
| Section | Variations | Character Range |
|---------|------------|-----------------|
| Title | 5 (new) or 3 (existing) | 190-200 chars |
| Bullet 1-10 | 3 (short/medium/long) | 110-210 chars |
| Description | 1-2 | 1800-2000 chars |
| Search Terms | 1-2 | 240-250 chars |

#### Cascading Context
Each modular chat knows:
- All previously approved sections
- Remaining keywords not yet used
- Q&A gaps not yet addressed
- Review themes not yet incorporated

---

### Module 3: Listing Builder - Speed Mode (Batch)

#### Purpose
Chat-first approach for creating multiple listings at once.

#### Flow
```
1. Category & Country selection at top
          ↓
2. 💬 Speed Mode Chat
   - Claude asks questions to build context:
     - How many listings needed?
     - What are variations? (pack sizes, colors, etc.)
     - Specific differentiators between them?
   - User provides details conversationally
          ↓
3. Claude confirms understanding, asks clarifying questions
          ↓
4. [Generate All X Listings] button
          ↓
5. Results screen showing all generated listings:
   ✓ 8-pack Standard    [Review & Edit] [Quick Approve]
   ✓ 10-pack Standard   [Review & Edit] [Quick Approve]
   ...
          ↓
6. [Export All to CSV] [Export All to Slack] [Save All]
```

#### Batch Input Context Structure
```json
{
  "conversation_history": [...],
  "products": [
    {
      "product_name": "8-pack Standard Colors",
      "product_details": {...}
    }
  ],
  "common_settings": {
    "brand_name": "Chalkola",
    "nib_size": "6mm"
  }
}
```

---

### Module 4: Image Builder

#### Purpose
Generate product images using AI (ChatGPT DALL-E 3 + Google Gemini).

#### Layout
- **Left Panel**: Prompts for each image position
- **Right Panel**: Generation settings and results

#### Image Positions
| Position | Purpose | Template Focus |
|----------|---------|----------------|
| Main | Product on white background | Amazon compliance |
| Image 1 | Primary Q&A gap | Feature demonstration |
| Image 2 | Feature highlight | Unique selling point |
| Image 3 | Size/scale reference | Hand comparison |
| Image 4 | Usage context | Lifestyle shot |
| Image 5 | Bundle contents | Flat lay |
| Image 6 | Comparison | vs competitors |
| Image 7 | In action | Real-world use |
| A+ Hero | Banner image | Brand story |
| A+ Comparison | Chart | Feature matrix |

#### Prompt Generation Logic
System auto-generates prompts using:
- Product details
- Review analysis (surfaces, use cases, customer types)
- Q&A gaps
- Keyword data
- Competitor weaknesses

#### User Controls
- Free-text prompt editing
- Quick adjustment dropdowns (Background, Arrangement, Lighting, Angle)
- Template selection (3 presets)

#### Generation Settings
- Model selection: ChatGPT (DALL-E 3) and/or Google Gemini
- Outputs per model: 1-5 (default 3)
- Resolution: 1K (preview) vs 4K (final)
- Orientation: Square, Portrait, Landscape

#### Admin Resolution Strategy
1. Users get 1K only (cost control)
2. Users get both 1K + 4K (full access)
3. **1K default, 4K only on approval (recommended)**

#### Approval Flow
```
Generate 1K previews → User selects preferred → Approve → 4K generated → Download
```

#### Cost Estimation
Display before generation:
"Generating 6 images × 2 models × 3 outputs = 36 images ≈ $3.60"

---

### Module 5: A+ Content Builder

#### Purpose
Create A+ Content modules with AI-generated images and text.

#### Module Types
- Hero Banner
- Comparison Chart
- Feature Grid (3-5 features)
- Technical Specs
- Usage Scenarios
- Brand Story

#### Flow
Same as Image Builder:
- Left: Prompts per module
- Right: Generation + results

---

### Module 6: Admin Panel

#### Sections

**API Keys Management**
- Claude API (Anthropic)
- OpenAI API (DALL-E)
- Google AI API (Gemini)

**Export Settings**
- Slack webhook URL
- Email recipient list
- Enable/disable export channels

**Resolution Controls**
- 1K/4K availability
- Default resolution

**Featured Listings**
- Mark top listings as templates
- Per category/country limit

**User Management**
- Add/remove team members
- Role assignment (admin/user)
- All team has full access to features
- Admin-only: API keys, settings

**Google Drive Configuration**
- Folder path mapping
- Sync frequency

**Research Sync Settings**
- Periodic sync interval (hours)
- Notification preferences (email/Slack)

---

### Module 7: Research Sync

#### Auto-Sync (Background)
```
Every X hours (admin configurable):
→ System checks Google Drive folders
→ Compares file modified dates with Supabase records
→ If new/updated files found:
   → Queue for analysis
   → Send notification to admin
```

#### Manual Trigger + Popup
```
When user opens Listing Builder:
→ System checks if queued analysis exists
→ If yes, show popup:

┌─────────────────────────────────────────────────────────┐
│  📊 New Research Data Detected                          │
│                                                         │
│  Updated files found for Chalk Markers - Germany:       │
│  • keywords_chalk_markers.csv (updated 2 hours ago)     │
│                                                         │
│  ○ Run new analysis now (~5-10 minutes)                │
│  ○ Use existing analysis (from Jan 3, 2025)            │
│  ○ Remind me later                                      │
│                                                         │
│  [Continue]                                             │
└─────────────────────────────────────────────────────────┘
```

---

## User Interface Flows

### Listing Builder Wizard - Complete Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    LISTING BUILDER                              │
├────────────────────────────────────────────────────────────────┤
│  ① Category & Country  →  ② Product Details  →  ③ Generate    │
│        [●]                    [ ]                  [ ]         │
│                                                                │
│                         →  ④ Review & Export                   │
│                                  [ ]                           │
└────────────────────────────────────────────────────────────────┘

STEP 1: Category & Country
┌────────────────────────────────────────┐
│ Category: [Chalk Markers        ▼]     │
│ Country:  [🇺🇸 United States    ▼]     │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ ✅ Research Available              │ │
│ │ Keywords: 1,247 • Q&A: 156        │ │
│ │ Reviews: 2,341 • Last: 2 days ago │ │
│ └────────────────────────────────────┘ │
│                                        │
│                    [Continue →]        │
└────────────────────────────────────────┘

STEP 2: Product Details
┌────────────────────────────────────────┐
│ Product Type: [Standard Colors  ▼]     │
│ Brand Name:   [Chalkola          ]     │
│ Pack Size:    [40                ]     │
│ Nib Size:     [6mm Reversible   ▼]     │
│                                        │
│ Features (select all that apply):      │
│ ☑ Washable  ☑ Non-toxic  ☑ Quick-dry  │
│ ☐ Odorless  ☐ Dustless               │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ 📋 Similar Listings Found          │ │
│ │ • 40-pack Standard (March 2024)   │ │
│ │   [View] [Use as Base]            │ │
│ └────────────────────────────────────┘ │
│                                        │
│         [← Back]    [Generate →]       │
└────────────────────────────────────────┘

STEP 3: Generation (Loading State)
┌────────────────────────────────────────┐
│         🔄 Generating Listing          │
│                                        │
│ ✅ Loading research analysis...        │
│ ✅ Analyzing keyword priorities...     │
│ 🔄 Generating title variations...      │
│ ○ Generating bullet points...         │
│ ○ Creating description...             │
│ ○ Optimizing search terms...          │
│                                        │
│ Estimated time remaining: ~2 minutes   │
│                                        │
│ ████████████░░░░░░░░░░░░░░░░░░ 45%    │
└────────────────────────────────────────┘

STEP 4: Review & Export (Section Cards)
┌────────────────────────────────────────────────────────────────┐
│ TITLES                                          [✓ Approved]   │
├────────────────────────────────────────────────────────────────┤
│ ● Chalkola Chalk Markers 40-Pack Premium...        (195 chars)│
│ ○ Premium Liquid Chalk Markers Set of 40...        (188 chars)│
│ ○ Chalkola 40 Vibrant Chalk Markers for...         (192 chars)│
│                                                                │
│ 💬 Refine Title                                      [Expand]  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ BULLET 1: Vibrant Colors                        [ ] Approved   │
├────────────────────────────────────────────────────────────────┤
│ Length: ○ Short (130)  ● Medium (165)  ○ Long (195)           │
│                                                                │
│ "Vibrant Colors - Our premium chalk markers deliver bold,     │
│ brilliant colors that pop on any non-porous surface including │
│ glass, mirrors, windows, and chalkboards..."                  │
│                                                                │
│ Keywords: vibrant, bold, premium, non-porous                   │
│ Q&A Gap: ✅ Color opacity addressed                            │
│                                                                │
│ 💬 Refine Bullet 1                                  [Expand]  │
└────────────────────────────────────────────────────────────────┘

[... more bullets ...]

┌────────────────────────────────────────────────────────────────┐
│                        EXPORT OPTIONS                          │
├────────────────────────────────────────────────────────────────┤
│ [📋 Copy All]  [📥 CSV]  [💬 Slack]  [📧 Email]  [💾 Save]   │
└────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create category |
| GET | `/api/categories/[id]` | Get category |
| PATCH | `/api/categories/[id]` | Update category |
| DELETE | `/api/categories/[id]` | Delete category |

### Countries
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/countries` | List all marketplaces |

### Research
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/research/status` | Research status matrix |
| POST | `/api/research/analyze` | Trigger analysis |
| GET | `/api/research/analyze?category_id=&country_id=` | Get analysis |

### Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync` | Get sync logs |
| POST | `/api/sync` | Trigger Drive sync |

### Listings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/listings` | List listings (with filters) |
| POST | `/api/listings` | Create/generate listing |
| GET | `/api/listings/[id]` | Get listing with chats |
| PATCH | `/api/listings/[id]` | Update listing |
| DELETE | `/api/listings/[id]` | Delete listing |

### Listing Chats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/listings/[id]/chats` | Get all chats for listing |
| POST | `/api/listings/[id]/chats/[section]` | Add message to section chat |

### Images
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/images` | List generated images |
| POST | `/api/images/generate` | Generate images |
| PATCH | `/api/images/[id]` | Update image (approve) |
| POST | `/api/images/[id]/upscale` | Trigger 4K generation |

### Batch Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/batch` | List batch jobs |
| POST | `/api/batch` | Create batch job |
| GET | `/api/batch/[id]` | Get batch status |
| POST | `/api/batch/[id]/cancel` | Cancel batch |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/settings` | Get all settings |
| PATCH | `/api/admin/settings/[key]` | Update setting |
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Invite user |
| DELETE | `/api/admin/users/[id]` | Remove user |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check for Railway |

---

## AI Integration

### Claude API Usage

#### Analysis Mode
- Model: `claude-sonnet-4-20250514`
- Max tokens: 16,000
- Used for: Research file analysis
- Process ENTIRE files, not samples
- Store complete outputs as JSON in Supabase

#### Generation Mode
- Model: `claude-sonnet-4-20250514`
- Max tokens: 16,000
- Used for: Listing content generation
- Input: Cached analysis + product details
- Output: Structured JSON with variations

#### Chat Refinement Mode
- Model: `claude-sonnet-4-20250514`
- Max tokens: 4,000
- Used for: Section-specific refinements
- Context includes: Current content + research + approved sections

### Analysis Output Structure

#### Keyword Analysis
```json
{
  "total_keywords": 1247,
  "high_relevancy": [
    {"keyword": "chalk markers", "relevancy_score": 0.95, "search_volume": 12000, "intent": "purchase"}
  ],
  "medium_relevancy": [...],
  "low_relevancy": [...],
  "themes": [
    {"theme": "Surface Types", "keywords": ["glass", "mirror", "window"], "customer_need": "versatility"}
  ],
  "target_audience_insights": ["restaurant owners", "teachers", "crafters"]
}
```

#### Q&A Gap Analysis
```json
{
  "total_questions": 156,
  "critical_gaps": [
    {
      "question": "Does it wash off easily?",
      "frequency": 23,
      "business_impact": 5,
      "conversion_influence": 5,
      "total_score": 15,
      "suggested_answer": "Yes, our water-based formula wipes clean with a damp cloth..."
    }
  ],
  "important_gaps": [...],
  "optional_gaps": [...],
  "question_themes": [
    {"theme": "Cleaning & Removal", "questions": [...], "priority": "critical"}
  ]
}
```

#### Review Theme Analysis
```json
{
  "total_reviews": 2341,
  "use_cases": [
    {"use_case": "restaurant menu boards", "frequency": 234, "sentiment_score": 0.92}
  ],
  "strengths": [
    {"item": "vibrant colors", "frequency": 456, "sentiment": "positive"}
  ],
  "weaknesses": [
    {"item": "tip durability", "frequency": 34, "sentiment": "negative"}
  ],
  "language_patterns": {
    "positive_adjectives": [{"word": "vibrant", "frequency": 234}],
    "emotional_triggers": ["love", "amazing", "perfect"],
    "action_verbs": ["pop", "glide", "flow"]
  },
  "customer_voice_phrases": [
    "these markers are a game changer",
    "colors really pop"
  ]
}
```

### OpenAI (DALL-E 3) Integration

```javascript
const response = await openai.images.generate({
  model: "dall-e-3",
  prompt: "Product photography of chalk markers...",
  n: 1,
  size: "1024x1024",
  quality: "standard", // or "hd"
});
```

### Google Gemini Integration

```javascript
const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
const result = await model.generateContent({
  contents: [{ role: "user", parts: [{ text: prompt }] }],
});
```

---

## Key Design Decisions

### Decision 1: Category-Level Caching
**Choice**: Cache analysis at category/country level, not product level
**Rationale**: 
- Keywords, Q&A, reviews are same for all products in category
- Reduces Claude API costs by 90%+
- Analysis runs once, used for unlimited products

### Decision 2: Full JSON Storage
**Choice**: Store complete Claude analysis output as JSONB
**Rationale**:
- No information loss
- Flexible querying
- Easy to display different views
- Future-proof for new analysis types

### Decision 3: Modular Chats
**Choice**: Separate chat per section (not global chat)
**Rationale**:
- Focused context = better refinements
- Cascading context prevents duplication
- Users can refine independently
- Conversation history per section

### Decision 4: Nothing Ever Locked
**Choice**: Users can edit any section at any time
**Rationale**:
- Flexibility > rigidity
- Show warning if changing approved content affects others
- Option to regenerate dependent sections

### Decision 5: 1K → 4K Resolution Flow
**Choice**: Generate 1K previews, 4K only on approval
**Rationale**:
- Cost control (4K is expensive)
- Fast iteration on previews
- High quality for final approved images

### Decision 6: Google Drive as Source of Truth
**Choice**: Research files stay in Google Drive, synced to Supabase
**Rationale**:
- Team already uses Drive
- Easy file sharing
- Supabase stores metadata only
- Analysis stored separately from raw files

### Decision 7: Fallback with Warning
**Choice**: Missing country data → use US + WARNING popup
**Rationale**:
- Don't block user completely
- Make data gap explicit
- Require confirmation before proceeding
- Translation at generation time only

### Decision 8: All Listings Stored Forever
**Choice**: Never delete listings, version tracking
**Rationale**:
- Historical reference
- A/B testing data
- Featured listings as templates
- Low storage cost vs high value

---

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Project structure
- [x] Database schema (15 tables)
- [x] Supabase integration
- [x] Google Drive integration
- [x] Claude API integration
- [x] Dashboard with status matrix
- [x] Research sync API
- [x] Listings API (CRUD)
- [x] Placeholder UI pages
- [x] Railway configuration

### Phase 2: Research & Analysis 🔄 NEXT
- [ ] Real-time research status from Supabase
- [ ] Analysis trigger UI with progress
- [ ] Analysis results viewer
- [ ] Auto-sync background job
- [ ] Notification system (Slack/email)

### Phase 3: Listing Builder - Core
- [ ] Complete wizard flow
- [ ] Section cards with variations
- [ ] Selection/approval system
- [ ] Export functionality (CSV, clipboard)

### Phase 4: Modular Chats
- [ ] Per-section chat interface
- [ ] Cascading context system
- [ ] Chat history persistence
- [ ] Regeneration triggers

### Phase 5: Speed Mode
- [ ] Chat-first batch interface
- [ ] Product extraction logic
- [ ] Batch generation
- [ ] Quick approval flow
- [ ] Batch export

### Phase 6: Image Builder
- [ ] Prompt generation from research
- [ ] ChatGPT integration
- [ ] Gemini integration
- [ ] 1K/4K flow
- [ ] Image storage in Drive

### Phase 7: A+ Content
- [ ] Module templates
- [ ] Image generation per module
- [ ] Text + image composition

### Phase 8: Admin & Polish
- [ ] Complete settings panel
- [ ] User management
- [ ] Featured listings
- [ ] Analytics dashboard
- [ ] Performance optimization

---

## File Structure

```
listing-builder-platform/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── categories/
│   │   │   │   └── route.ts
│   │   │   ├── countries/
│   │   │   │   └── route.ts
│   │   │   ├── health/
│   │   │   │   └── route.ts
│   │   │   ├── listings/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts
│   │   │   ├── research/
│   │   │   │   ├── analyze/
│   │   │   │   │   └── route.ts
│   │   │   │   └── status/
│   │   │   │       └── route.ts
│   │   │   └── sync/
│   │   │       └── route.ts
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── images/
│   │   │   └── page.tsx
│   │   ├── listings/
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── speed/
│   │   │       └── page.tsx
│   │   ├── research/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── QuickActions.tsx
│   │   │   ├── RecentListings.tsx
│   │   │   ├── ResearchStatusMatrix.tsx
│   │   │   └── StatsCards.tsx
│   │   └── layouts/
│   │       └── DashboardLayout.tsx
│   ├── lib/
│   │   ├── claude.ts
│   │   ├── google-drive.ts
│   │   ├── store.ts
│   │   ├── supabase.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── sql/
│   └── schema.sql
├── docs/
├── scripts/
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── railway.toml
├── README.md
├── tailwind.config.ts
└── tsconfig.json
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Claude API (Anthropic)
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI API (DALL-E)
OPENAI_API_KEY=sk-...

# Google AI API (Gemini)
GOOGLE_AI_API_KEY=AIza...

# Google Drive
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=1ABC123...

# Export
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx
RESEND_API_KEY=re_...
EMAIL_FROM=listings@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
ADMIN_EMAIL=admin@yourdomain.com
```

---

## Deployment

### Railway Setup

1. Connect GitHub repository
2. Railway auto-detects Next.js
3. Add environment variables
4. Deploy

### railway.toml Configuration
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Production Considerations

- Enable Supabase RLS policies
- Set up proper API rate limiting
- Configure CORS for production domain
- Set up monitoring/alerting
- Configure backup strategy for Supabase

---

## Future Considerations

### Potential Enhancements

1. **Competitor Tracking**: Auto-monitor competitor listings
2. **A/B Testing Integration**: Track which versions perform better
3. **AI Model Updates**: Support for newer Claude/GPT models
4. **Multi-tenant**: Support multiple organizations
5. **API Access**: External API for other tools
6. **Mobile App**: React Native companion app
7. **Chrome Extension**: Quick listing capture
8. **Translation Memory**: Cache translations for reuse

### Technical Debt to Address

1. Add comprehensive error handling
2. Implement request caching
3. Add unit/integration tests
4. Set up CI/CD pipeline
5. Add logging/monitoring
6. Optimize database queries
7. Implement proper authentication

### Scaling Considerations

- Supabase can handle current scale
- Consider job queue for heavy analysis
- CDN for image delivery
- Consider edge functions for global performance

---

## Appendix

### Google Drive Folder Structure

```
Research/ (ROOT_FOLDER_ID)
├── US/
│   ├── chalk_markers/
│   │   ├── keywords.csv
│   │   ├── qna.csv
│   │   └── reviews.csv
│   ├── vacuum_bags/
│   │   └── ...
│   └── art_supplies/
│       └── ...
├── UK/
│   └── chalk_markers/
│       └── ...
├── DE/
│   └── ...
├── FR/
│   └── ...
└── ...
```

### File Naming Convention

| File Type | Naming Pattern | Example |
|-----------|---------------|---------|
| Keywords | `keywords.csv` or `*keyword*.csv` | `keywords_chalk_markers.csv` |
| Q&A | `qna.csv` or `*q&a*.csv` | `qna_march2024.csv` |
| Reviews | `reviews.csv` or `*review*.csv` | `reviews_all.csv` |
| Competitors | `competitors.csv` | `competitors_main.csv` |

### Listing Generation Prompt Framework

The system uses a detailed prompt framework (referenced as `listing-optimization-3.txt`) that includes:

1. **Keyword Distribution Algorithm**
   - High relevancy → Title + Bullet 1
   - Medium relevancy → Bullets 2-5
   - Low relevancy → Description + Search Terms

2. **Q&A Gap Verification**
   - Critical gaps → First 3 bullets
   - Important gaps → Remaining bullets
   - Optional gaps → Description

3. **Rufus AI Alignment**
   - Question-trigger phrases
   - Defensive positioning
   - Voice search optimization

4. **Backend Attribute Optimization**
   - Based on research patterns
   - Marketplace-specific fields

---

## Document Maintenance

This document should be updated when:
- New modules are added
- Database schema changes
- API endpoints are modified
- Key design decisions are made
- Implementation phases are completed

**Last Updated**: January 2025
**Next Review**: After Phase 2 completion
