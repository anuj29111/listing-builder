'use client'

import { useState } from 'react'
import { ScanSearch, Search, MessageSquare, BarChart3, FolderOpen } from 'lucide-react'
import type { LbCountry, LbAsinLookup, LbKeywordSearch, LbAsinReview, LbMarketIntelligence } from '@/types'
import { AsinLookupClient } from './AsinLookupClient'
import { KeywordSearchClient } from './KeywordSearchClient'
import { ReviewsClient } from './ReviewsClient'
import { MarketIntelligenceClient } from '@/components/market-intelligence/MarketIntelligenceClient'
import { CollectionsPanel } from './CollectionsPanel'

interface AsinLookupPageClientProps {
  countries: LbCountry[]
  initialLookups: Partial<LbAsinLookup>[]
  initialSearches: Partial<LbKeywordSearch>[]
  initialReviews: Partial<LbAsinReview>[]
  initialIntelligence: Partial<LbMarketIntelligence>[]
}

export function AsinLookupPageClient({
  countries,
  initialLookups,
  initialSearches,
  initialReviews,
  initialIntelligence,
}: AsinLookupPageClientProps) {
  const [activeTab, setActiveTab] = useState<'asin' | 'keyword' | 'reviews' | 'market_intel' | 'collections'>('asin')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          Amazon Product Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetch product data, search keywords, pull reviews, or generate market intelligence via Oxylabs
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b overflow-x-auto">
        <button
          onClick={() => setActiveTab('asin')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'asin'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ScanSearch className="h-4 w-4" />
          ASIN Lookup
        </button>
        <button
          onClick={() => setActiveTab('keyword')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'keyword'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="h-4 w-4" />
          Keyword Search
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'reviews'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Reviews
        </button>
        <button
          onClick={() => setActiveTab('market_intel')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'market_intel'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Market Intelligence
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'collections'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          Collections
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'asin' ? (
        <AsinLookupClient countries={countries} initialLookups={initialLookups} />
      ) : activeTab === 'keyword' ? (
        <KeywordSearchClient countries={countries} initialSearches={initialSearches} />
      ) : activeTab === 'reviews' ? (
        <ReviewsClient countries={countries} initialReviews={initialReviews} />
      ) : activeTab === 'market_intel' ? (
        <MarketIntelligenceClient countries={countries} initialIntelligence={initialIntelligence} />
      ) : (
        <CollectionsPanel />
      )}
    </div>
  )
}
