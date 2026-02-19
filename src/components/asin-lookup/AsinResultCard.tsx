'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronDown,
  ChevronUp,
  Star,
  ExternalLink,
  Package,
  TrendingUp,
} from 'lucide-react'
import type { OxylabsProductResult } from '@/lib/oxylabs'

interface AsinResultCardProps {
  asin: string
  data: OxylabsProductResult
  marketplace: string
  savedId?: string
}

export function AsinResultCard({
  asin,
  data,
  marketplace,
  savedId,
}: AsinResultCardProps) {
  const [expanded, setExpanded] = useState(false)

  const mainImage = data.images?.[0]
  const bsr = data.sales_rank?.[0]
  const categoryPath = data.category?.[0]?.ladder
    ?.map((l) => l.name)
    .join(' > ')

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header — always visible */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* Product Image */}
          {mainImage && (
            <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted">
              <img
                src={mainImage}
                alt={data.title || asin}
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Product Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium leading-tight line-clamp-2">
                  {data.title || 'No title'}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">
                    {asin}
                  </span>
                  {data.manufacturer && (
                    <Badge variant="secondary" className="text-xs">
                      {data.manufacturer}
                    </Badge>
                  )}
                  {data.is_prime_eligible && (
                    <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      Prime
                    </Badge>
                  )}
                  {savedId && (
                    <Badge
                      variant="outline"
                      className="text-xs text-green-600"
                    >
                      Saved
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {data.price != null && (
                <span className="text-lg font-bold">
                  {data.currency || '$'}
                  {typeof data.price === 'number'
                    ? data.price.toFixed(2)
                    : data.price}
                </span>
              )}
              {data.rating != null && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  {data.rating}
                  {data.reviews_count != null && (
                    <span className="text-xs">
                      ({data.reviews_count.toLocaleString()})
                    </span>
                  )}
                </span>
              )}
              {bsr && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  BSR #{bsr.rank?.toLocaleString()}
                </span>
              )}
              {data.stock && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  {data.stock}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full justify-center gap-1 text-xs text-muted-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Hide details
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Show bullets,
              description, images & more
            </>
          )}
        </Button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t divide-y">
          {/* Category */}
          {categoryPath && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Category
              </h4>
              <p className="text-sm">{categoryPath}</p>
            </div>
          )}

          {/* Bullet Points */}
          {data.bullet_points && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Bullet Points
              </h4>
              <div className="text-sm space-y-1.5">
                {data.bullet_points
                  .split('\n')
                  .filter((b) => b.trim())
                  .map((bullet, i) => (
                    <p key={i} className="flex gap-2">
                      <span className="text-muted-foreground flex-shrink-0">
                        {'\u2022'}
                      </span>
                      <span>{bullet.trim()}</span>
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* Description */}
          {data.description && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Description
              </h4>
              <p className="text-sm whitespace-pre-wrap">{data.description}</p>
            </div>
          )}

          {/* Images */}
          {data.images && data.images.length > 1 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Images ({data.images.length})
              </h4>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {data.images.map((img, i) => (
                  <div
                    key={i}
                    className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted border"
                  >
                    <img
                      src={img}
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BSR / Sales Rank */}
          {data.sales_rank && data.sales_rank.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Sales Rank
              </h4>
              <div className="space-y-1">
                {data.sales_rank.map((sr, i) => (
                  <p key={i} className="text-sm">
                    <span className="font-medium">
                      #{sr.rank?.toLocaleString()}
                    </span>
                    {sr.ladder && sr.ladder.length > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        in {sr.ladder.map((l) => l.name).join(' > ')}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Variations */}
          {data.variation && data.variation.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Variations ({data.variation.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {data.variation.slice(0, 20).map((v, i) => {
                  const label =
                    typeof v === 'object' && v !== null
                      ? String(
                          (v as Record<string, unknown>).title ||
                            (v as Record<string, unknown>).asin ||
                            JSON.stringify(v)
                        )
                      : String(v)
                  return (
                    <Badge key={i} variant="outline" className="text-xs">
                      {label}
                    </Badge>
                  )
                })}
                {data.variation.length > 20 && (
                  <Badge variant="secondary" className="text-xs">
                    +{data.variation.length - 20} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Seller Info */}
          {data.featured_merchant &&
            Object.keys(data.featured_merchant).length > 0 && (
              <div className="p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Featured Merchant
                </h4>
                <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                  {JSON.stringify(data.featured_merchant, null, 2)}
                </pre>
              </div>
            )}

          {/* Link to Amazon */}
          {data.url && (
            <div className="p-4">
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                View on {marketplace}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
