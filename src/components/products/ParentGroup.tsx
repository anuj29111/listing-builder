'use client'

import { useState } from 'react'
import { LbProduct, CatalogProductData } from '@/types/database'
import { ProductRow } from './ProductRow'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from '@/components/ui/table'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ParentGroupProps {
  parentName: string
  products: LbProduct[]
  lookupsByAsin: Record<string, CatalogProductData>
  countryId: string
  defaultExpanded?: boolean
  onToggleOptimised: (productId: string, currentValue: boolean) => void
}

export function ParentGroup({
  parentName,
  products,
  lookupsByAsin,
  countryId,
  defaultExpanded = false,
  onToggleOptimised,
}: ParentGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const category = products[0]?.category || ''
  const optimisedCount = products.filter((p) => p.is_optimised).length

  return (
    <div className="border rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          {parentName}
        </span>
        <Badge variant="secondary" className="text-xs">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </Badge>
        {category && (
          <Badge variant="outline" className="text-xs text-zinc-500">
            {category}
          </Badge>
        )}
        {optimisedCount > 0 && (
          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
            {optimisedCount}/{products.length} done
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Img</TableHead>
                <TableHead className="w-[200px]">Product</TableHead>
                <TableHead className="min-w-[250px]">Current Title</TableHead>
                <TableHead className="min-w-[300px]">Current Bullets</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="w-[90px]">Price</TableHead>
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  lookupData={lookupsByAsin[product.asin] || null}
                  countryId={countryId}
                  onToggleOptimised={onToggleOptimised}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
