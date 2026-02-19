'use client'

import { useState } from 'react'
import { ScanSearch, Search, MessageSquare } from 'lucide-react'
import type { LbCountry, LbAsinLookup, LbKeywordSearch, LbAsinReview } from '@/types'
import { AsinLookupClient } from './AsinLookupClient'
import { KeywordSearchClient } from './KeywordSearchClient'
import { ReviewsClient } from './ReviewsClient'

interface AsinLookupPageClientProps {
  countries: LbCountry[]
  initialLookups: Partial<LbAsinLookup>[]
  initialSearches: Partial<LbKeywordSearch>[]
  initialReviews: Partial<LbAsinReview>[]
}

export function AsinLookupPageClient({
  countries,
  initialLookups,
  initialSearches,
  initialReviews,
}: AsinLookupPageClientProps) {
  const [activeTab, setActiveTab] = useState<'asin' | 'keyword' | 'reviews'>('asin')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          Amazon Product Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetch product data, search keywords, or pull reviews via Oxylabs
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('asin')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reviews'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Reviews
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'asin' ? (
        <AsinLookupClient countries={countries} initialLookups={initialLookups} />
      ) : activeTab === 'keyword' ? (
        <KeywordSearchClient countries={countries} initialSearches={initialSearches} />
      ) : (
        <ReviewsClient countries={countries} initialReviews={initialReviews} />
      )}
    </div>
  )
}
