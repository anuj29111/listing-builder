'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LbProduct, AsinLookupSummary } from '@/types/database'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'

interface ProductRowProps {
  product: LbProduct
  lookupData: AsinLookupSummary | null
  countryId: string
}

function parseBulletPoints(raw: string | null): string[] {
  if (!raw) return []
  return raw.split('\n').map((b) => b.trim()).filter(Boolean)
}

export function ProductRow({ product, lookupData, countryId }: ProductRowProps) {
  const router = useRouter()
  const [showAllBullets, setShowAllBullets] = useState(false)

  const bullets = parseBulletPoints(lookupData?.bullet_points ?? null)
  const visibleBullets = showAllBullets ? bullets : bullets.slice(0, 3)
  const hasMoreBullets = bullets.length > 3

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
    <div className="border rounded-lg p-4 bg-white dark:bg-zinc-900 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* ASIN + Product Name */}
          <div className="flex items-center gap-3 mb-2">
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono shrink-0">
              {product.asin}
            </code>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {product.product_name}
            </span>
          </div>

          {/* Title from lookup */}
          {lookupData?.title ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2 leading-snug">
              {lookupData.title}
            </p>
          ) : (
            <p className="text-xs text-zinc-400 italic mb-2">No listing data for this country</p>
          )}

          {/* Bullet points */}
          {bullets.length > 0 && (
            <div className="space-y-1 mb-2">
              {visibleBullets.map((bullet, idx) => (
                <p key={idx} className="text-xs text-zinc-600 dark:text-zinc-400 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-zinc-400">
                  {bullet}
                </p>
              ))}
              {hasMoreBullets && (
                <button
                  onClick={() => setShowAllBullets(!showAllBullets)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 pl-3"
                >
                  {showAllBullets ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>+{bullets.length - 3} more <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Metadata */}
          {lookupData && (lookupData.rating || lookupData.price) && (
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {lookupData.rating != null && (
                <span>★ {lookupData.rating}</span>
              )}
              {lookupData.reviews_count != null && (
                <span>({lookupData.reviews_count.toLocaleString()} reviews)</span>
              )}
              {lookupData.price != null && (
                <span>{lookupData.currency || '$'}{lookupData.price}</span>
              )}
            </div>
          )}
        </div>

        {/* Optimize button */}
        <Button
          size="sm"
          onClick={handleOptimize}
          className="shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Optimize
        </Button>
      </div>
    </div>
  )
}
