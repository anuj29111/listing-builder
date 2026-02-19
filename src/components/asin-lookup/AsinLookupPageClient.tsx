'use client'

import { useState } from 'react'
import { ScanSearch, Search } from 'lucide-react'
import type { LbCountry, LbAsinLookup, LbKeywordSearch } from '@/types'
import { AsinLookupClient } from './AsinLookupClient'
import { KeywordSearchClient } from './KeywordSearchClient'

interface AsinLookupPageClientProps {
  countries: LbCountry[]
  initialLookups: Partial<LbAsinLookup>[]
  initialSearches: Partial<LbKeywordSearch>[]
}

export function AsinLookupPageClient({
  countries,
  initialLookups,
  initialSearches,
}: AsinLookupPageClientProps) {
  const [activeTab, setActiveTab] = useState<'asin' | 'keyword'>('asin')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          Amazon Product Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetch product data by ASIN or search Amazon by keyword via Oxylabs
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
      </div>

      {/* Tab Content */}
      {activeTab === 'asin' ? (
        <AsinLookupClient countries={countries} initialLookups={initialLookups} />
      ) : (
        <KeywordSearchClient countries={countries} initialSearches={initialSearches} />
      )}
    </div>
  )
}
