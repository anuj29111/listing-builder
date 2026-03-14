'use client'

import { useRouter } from 'next/navigation'
import { LbProduct, CatalogProductData } from '@/types/database'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'
import { ExternalLink, CheckCircle2, Circle, ImageIcon } from 'lucide-react'

interface ProductRowProps {
  product: LbProduct
  lookupData: CatalogProductData | null
  countryId: string
  onToggleOptimised: (productId: string, currentValue: boolean) => void
}

function parseBulletPoints(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
}

export function ProductRow({
  product,
  lookupData,
  countryId,
  onToggleOptimised,
}: ProductRowProps) {
  const router = useRouter()

  const bullets = parseBulletPoints(lookupData?.bullet_points ?? null)
  const hasLookupData = lookupData?.source === 'lookup'

  const handleOptimize = () => {
    const params = new URLSearchParams({
      prefill: 'true',
      asin: product.asin,
      product_name: product.product_name,
      country_id: countryId,
    })
    if (product.brand) params.set('brand', product.brand)
    if (product.category) params.set('category', product.category)
    router.push(`/listings/new?${params.toString()}`)
  }

  return (
    <TableRow>
      {/* Image */}
      <TableCell className="w-[50px]">
        {lookupData?.image_url ? (
          <img
            src={lookupData.image_url}
            alt={product.product_name}
            className="w-10 h-10 object-contain rounded border bg-white"
          />
        ) : (
          <div className="w-10 h-10 rounded border bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-zinc-400" />
          </div>
        )}
      </TableCell>

      {/* Product: ASIN + Name + Optimised badge */}
      <TableCell>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
              {product.asin}
            </code>
            {product.is_optimised && (
              <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded-full">
                Done
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">
            {product.product_name}
          </p>
        </div>
      </TableCell>

      {/* Current Title */}
      <TableCell>
        {lookupData?.title ? (
          <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed">
            {lookupData.title}
          </p>
        ) : (
          <span className="text-xs text-zinc-400 italic">No data</span>
        )}
      </TableCell>

      {/* Current Bullets */}
      <TableCell>
        {hasLookupData && bullets.length > 0 ? (
          <div className="space-y-0.5">
            {bullets.slice(0, 5).map((bullet, idx) => (
              <p
                key={idx}
                className="text-[11px] text-zinc-600 dark:text-zinc-400 pl-2.5 relative line-clamp-1 before:content-['•'] before:absolute before:left-0 before:text-zinc-400"
              >
                {bullet}
              </p>
            ))}
            {bullets.length > 5 && (
              <p className="text-[10px] text-zinc-400 pl-2.5">
                +{bullets.length - 5} more
              </p>
            )}
          </div>
        ) : lookupData?.source === 'pull' ? (
          <span className="inline-flex text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded">
            Not scraped yet
          </span>
        ) : (
          <span className="text-xs text-zinc-400 italic">—</span>
        )}
      </TableCell>

      {/* Category */}
      <TableCell>
        <span className="text-xs text-zinc-500">{product.category}</span>
      </TableCell>

      {/* Price + Rating */}
      <TableCell>
        {lookupData && (lookupData.price != null || lookupData.rating != null) ? (
          <div className="space-y-0.5">
            {lookupData.price != null && (
              <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {lookupData.currency || '$'}
                {lookupData.price}
              </p>
            )}
            {lookupData.rating != null && (
              <p className="text-[10px] text-zinc-500">
                ★ {lookupData.rating}
                {lookupData.reviews_count != null && (
                  <span> ({lookupData.reviews_count.toLocaleString()})</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" onClick={handleOptimize} className="text-xs h-7">
            <ExternalLink className="w-3 h-3 mr-1" />
            {hasLookupData ? 'Optimize' : 'Create'}
          </Button>
          <button
            onClick={() => onToggleOptimised(product.id, product.is_optimised)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
              product.is_optimised
                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300'
                : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {product.is_optimised ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            {product.is_optimised ? 'Done' : 'Mark done'}
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}
