'use client'

import { useState } from 'react'
import { LbProduct, LbCountry } from '@/types/database'
import { ProductCatalog } from './ProductCatalog'
import { ProductMapper } from './ProductMapper'

interface ProductCatalogPageProps {
  initialProducts: LbProduct[]
  categories: string[]
  countries: LbCountry[]
}

export function ProductCatalogPage({
  initialProducts,
  categories,
  countries,
}: ProductCatalogPageProps) {
  const [view, setView] = useState<'catalog' | 'manage'>('catalog')

  return (
    <div className="w-full px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Products</h1>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setView('catalog')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === 'catalog'
                ? 'bg-white dark:bg-zinc-700 shadow-sm font-medium'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Catalog
          </button>
          <button
            onClick={() => setView('manage')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === 'manage'
                ? 'bg-white dark:bg-zinc-700 shadow-sm font-medium'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            Manage
          </button>
        </div>
      </div>

      {view === 'catalog' ? (
        <ProductCatalog initialProducts={initialProducts} countries={countries} />
      ) : (
        <ProductMapper initialProducts={initialProducts} categories={categories} />
      )}
    </div>
  )
}
