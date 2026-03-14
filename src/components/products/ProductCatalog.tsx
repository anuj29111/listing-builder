'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { LbProduct, LbCountry, AsinLookupSummary } from '@/types/database'
import { ParentGroup } from './ParentGroup'
import { Input } from '@/components/ui/input'
import { Search, Loader2 } from 'lucide-react'

const COUNTRY_ORDER = ['US', 'CA', 'UK', 'DE', 'FR', 'AE', 'AU', 'IT', 'ES', 'MX']

interface ProductCatalogProps {
  initialProducts: LbProduct[]
  countries: LbCountry[]
}

export function ProductCatalog({ initialProducts, countries }: ProductCatalogProps) {
  const [products] = useState(initialProducts)
  const [activeCountryId, setActiveCountryId] = useState<string | null>(null)
  const [availableCountryIds, setAvailableCountryIds] = useState<string[]>([])
  const [lookupsByAsin, setLookupsByAsin] = useState<Record<string, AsinLookupSummary>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Sort countries by COUNTRY_ORDER
  const sortedCountries = useMemo(() => {
    return countries
      .filter((c) => availableCountryIds.includes(c.id))
      .sort((a, b) => {
        const aIdx = COUNTRY_ORDER.indexOf(a.code)
        const bIdx = COUNTRY_ORDER.indexOf(b.code)
        const aOrder = aIdx === -1 ? 999 : aIdx
        const bOrder = bIdx === -1 ? 999 : bIdx
        return aOrder - bOrder
      })
  }, [countries, availableCountryIds])

  const fetchCatalog = useCallback(async (countryId?: string) => {
    setLoading(true)
    try {
      const url = countryId
        ? `/api/products/catalog?country_id=${countryId}`
        : '/api/products/catalog'
      const res = await fetch(url)
      const data = await res.json()

      if (data.availableCountryIds) {
        setAvailableCountryIds(data.availableCountryIds)
      }
      if (data.lookupsByAsin) {
        setLookupsByAsin(data.lookupsByAsin)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch to get available countries
  useEffect(() => {
    fetchCatalog().then(() => {})
  }, [fetchCatalog])

  // Once we have available countries, set default tab and fetch data
  useEffect(() => {
    if (availableCountryIds.length > 0 && !activeCountryId) {
      // Pick first country by COUNTRY_ORDER
      const sorted = countries
        .filter((c) => availableCountryIds.includes(c.id))
        .sort((a, b) => {
          const aIdx = COUNTRY_ORDER.indexOf(a.code)
          const bIdx = COUNTRY_ORDER.indexOf(b.code)
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
        })
      if (sorted.length > 0) {
        setActiveCountryId(sorted[0].id)
        fetchCatalog(sorted[0].id)
      }
    }
  }, [availableCountryIds, activeCountryId, countries, fetchCatalog])

  const handleCountryChange = (countryId: string) => {
    setActiveCountryId(countryId)
    fetchCatalog(countryId)
  }

  // Filter products by search
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.asin.toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        (p.parent_name && p.parent_name.toLowerCase().includes(q))
    )
  }, [products, search])

  // Group by parent_name
  const groups = useMemo(() => {
    const map = new Map<string, LbProduct[]>()
    for (const p of filteredProducts) {
      const key = p.parent_name || p.product_name
      const arr = map.get(key) || []
      arr.push(p)
      map.set(key, arr)
    }
    // Sort groups by minimum display_order within each group
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const minA = Math.min(...a.map((p) => p.display_order))
      const minB = Math.min(...b.map((p) => p.display_order))
      return minA - minB
    })
  }, [filteredProducts])

  return (
    <div className="space-y-4">
      {/* Country tabs */}
      {sortedCountries.length > 0 && (
        <div className="flex gap-1 flex-wrap border-b pb-2">
          {sortedCountries.map((country) => (
            <button
              key={country.id}
              onClick={() => handleCountryChange(country.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeCountryId === country.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {country.flag_emoji} {country.code}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input
          placeholder="Search by ASIN, product name, or parent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading catalog...
        </div>
      )}

      {/* Groups */}
      {!loading && (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No products found</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                {groups.length} parent groups · {filteredProducts.length} products
              </p>
              {groups.map(([parentName, groupProducts]) => (
                <ParentGroup
                  key={parentName}
                  parentName={parentName}
                  products={groupProducts}
                  lookupsByAsin={lookupsByAsin}
                  countryId={activeCountryId || ''}
                  defaultExpanded={groups.length <= 5}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
