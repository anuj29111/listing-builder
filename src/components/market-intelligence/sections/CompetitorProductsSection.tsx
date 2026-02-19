'use client'

import { useState } from 'react'
import { Package, Star, ExternalLink, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CompetitorProductsSectionProps {
  competitorsData: Array<Record<string, unknown>>
}

export function CompetitorProductsSection({ competitorsData }: CompetitorProductsSectionProps) {
  const [showAll, setShowAll] = useState(false)

  const products = competitorsData.filter(c => !c.error)
  const displayed = showAll ? products : products.slice(0, 5)

  if (products.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Package className="h-5 w-5 text-emerald-500" />
        Similar Products ({products.length})
      </h3>

      <div className="space-y-3">
        {displayed.map((prod, i) => {
          const images = (prod.images as string[]) || []
          const title = (prod.title as string) || ''
          const brand = (prod.brand as string) || ''
          const asin = prod.asin as string
          const price = prod.price as number | null
          const currency = (prod.currency as string) || '$'
          const rating = (prod.rating as number) || 0
          const reviewsCount = (prod.reviews_count as number) || 0
          const marketplace = (prod.marketplace_domain as string) || 'amazon.com'

          return (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="flex gap-4">
                {/* Image strip */}
                <div className="flex gap-1 flex-shrink-0 overflow-x-auto max-w-[280px]">
                  {images.slice(0, 5).map((img, j) => (
                    <img
                      key={j}
                      src={img}
                      alt={`${title} image ${j + 1}`}
                      className="h-16 w-16 object-contain rounded border bg-white flex-shrink-0"
                      loading="lazy"
                    />
                  ))}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm line-clamp-2">{title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {brand && <span className="font-medium">{brand}</span>}
                    <span className="font-mono text-[10px]">{asin}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{reviewsCount.toLocaleString()} reviews</span>
                    {price !== null && <span className="text-sm font-semibold">{currency}{price.toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {products.length > 5 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            {showAll ? 'Show Less' : `Show All ${products.length} Products`}
          </Button>
        </div>
      )}
    </div>
  )
}
