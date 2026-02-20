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
  Tag,
  Zap,
  MessageSquareMore,
  Video,
  ShoppingCart,
  Truck,
  BarChart3,
  HelpCircle,
  ThumbsUp,
} from 'lucide-react'
import type { OxylabsProductResult } from '@/lib/oxylabs'

interface QnAItem {
  question: string
  answer: string
  votes: number
  author?: string
  date?: string
}

interface AsinResultCardProps {
  asin: string
  data: OxylabsProductResult
  marketplace: string
  savedId?: string
  defaultExpanded?: boolean
  questions?: QnAItem[]
}

export function AsinResultCard({
  asin,
  data,
  marketplace,
  savedId,
  defaultExpanded = false,
  questions,
}: AsinResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showAllQnA, setShowAllQnA] = useState(false)

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
                  {data.parent_asin && data.parent_asin !== asin && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (parent: {data.parent_asin})
                    </span>
                  )}
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
                  {data.amazon_choice && (
                    <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                      Amazon&apos;s Choice
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
              {/* Price block */}
              <div className="flex items-center gap-1.5">
                {data.price != null && (
                  <span className="text-lg font-bold">
                    {data.currency || '$'}
                    {typeof data.price === 'number'
                      ? data.price.toFixed(2)
                      : data.price}
                  </span>
                )}
                {data.price_initial != null && data.price_initial !== data.price && (
                  <span className="text-sm text-muted-foreground line-through">
                    {data.currency || '$'}
                    {data.price_initial.toFixed(2)}
                  </span>
                )}
                {data.discount?.percentage != null && data.discount.percentage > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    -{data.discount.percentage}%
                  </Badge>
                )}
              </div>

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
              {data.sales_volume && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <ShoppingCart className="h-3 w-3" />
                  {data.sales_volume}
                </span>
              )}
              {data.stock && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  {data.stock}
                </span>
              )}
            </div>

            {/* Deal/Coupon badges */}
            {(data.deal_type || data.coupon || data.coupon_discount_percentage) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {data.deal_type && (
                  <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:text-orange-400">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    {data.deal_type}
                  </Badge>
                )}
                {data.coupon && (
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:text-green-400">
                    <Tag className="h-2.5 w-2.5 mr-0.5" />
                    {data.coupon}
                  </Badge>
                )}
                {!data.coupon && data.coupon_discount_percentage != null && data.coupon_discount_percentage > 0 && (
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:text-green-400">
                    <Tag className="h-2.5 w-2.5 mr-0.5" />
                    {data.coupon_discount_percentage}% coupon
                  </Badge>
                )}
                {data.price_sns != null && (
                  <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 dark:text-purple-400">
                    S&S: {data.currency || '$'}{data.price_sns.toFixed(2)}
                  </Badge>
                )}
              </div>
            )}
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
          {/* Quick stats bar */}
          <div className="p-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {data.answered_questions_count != null && data.answered_questions_count > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquareMore className="h-3 w-3" />
                {data.answered_questions_count} Q&A
              </span>
            )}
            {data.has_videos && (
              <span className="flex items-center gap-1">
                <Video className="h-3 w-3" />
                Has videos
              </span>
            )}
            {data.pricing_count != null && data.pricing_count > 0 && (
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {data.pricing_count} seller{data.pricing_count > 1 ? 's' : ''}
              </span>
            )}
            {data.max_quantity != null && (
              <span>Max qty: {data.max_quantity}</span>
            )}
            {data.product_dimensions && (
              <span>Dims: {data.product_dimensions}</span>
            )}
          </div>

          {/* Category */}
          {categoryPath && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Category
              </h4>
              <p className="text-sm">{categoryPath}</p>
            </div>
          )}

          {/* Product Overview (key attributes table) */}
          {data.product_overview && data.product_overview.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Product Overview
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {data.product_overview.map((attr, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground flex-shrink-0">{attr.title}:</span>
                    <span className="font-medium">{attr.description}</span>
                  </div>
                ))}
              </div>
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
                  <a
                    key={i}
                    href={img}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted border hover:ring-2 hover:ring-primary transition-all"
                  >
                    <img
                      src={img}
                      alt={`Image ${i + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Rating Stars Distribution */}
          {data.rating_stars_distribution && data.rating_stars_distribution.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <BarChart3 className="h-3 w-3 inline mr-1" />
                Rating Breakdown
              </h4>
              <div className="space-y-1 max-w-xs">
                {Array.from(data.rating_stars_distribution)
                  .sort((a, b) => b.rating - a.rating)
                  .map((dist, i) => {
                    const pct = parseInt(dist.percentage) || 0
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-12 text-right">{dist.rating} star</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-muted-foreground">{dist.percentage}</span>
                      </div>
                    )
                  })}
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

          {/* BuyBox */}
          {data.buybox && Array.isArray(data.buybox) && data.buybox.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Buy Box Options
              </h4>
              <div className="space-y-2">
                {data.buybox.map((bb, i) => {
                  const box = bb as { name?: string; price?: number; stock?: string; condition?: string; delivery_type?: string }
                  return (
                    <div key={i} className="text-sm flex items-center gap-3 flex-wrap">
                      {box.name && <span className="font-medium">{box.name}</span>}
                      {box.price != null && (
                        <span>{data.currency || '$'}{box.price.toFixed(2)}</span>
                      )}
                      {box.condition && <Badge variant="outline" className="text-[10px]">{box.condition}</Badge>}
                      {box.stock && <span className="text-xs text-muted-foreground">{box.stock}</span>}
                      {box.delivery_type && <span className="text-xs text-muted-foreground">{box.delivery_type}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Delivery */}
          {data.delivery && Array.isArray(data.delivery) && data.delivery.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <Truck className="h-3 w-3 inline mr-1" />
                Delivery
              </h4>
              <div className="space-y-1">
                {data.delivery.map((d, i) => {
                  const del = d as { type?: string; date?: { by?: string; from?: string } }
                  return (
                    <p key={i} className="text-sm">
                      {del.type && <span className="font-medium">{del.type}</span>}
                      {del.date?.by && <span className="text-muted-foreground"> — by {del.date.by}</span>}
                    </p>
                  )
                })}
              </div>
            </div>
          )}

          {/* Lightning Deal */}
          {data.lightning_deal && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <Zap className="h-3 w-3 inline mr-1" />
                Lightning Deal
              </h4>
              <div className="text-sm flex items-center gap-3">
                {data.lightning_deal.price_text && <span className="font-bold">{data.lightning_deal.price_text}</span>}
                {data.lightning_deal.percent_claimed && <span className="text-orange-600">{data.lightning_deal.percent_claimed} claimed</span>}
                {data.lightning_deal.expires && <span className="text-muted-foreground">Expires: {data.lightning_deal.expires}</span>}
              </div>
            </div>
          )}

          {/* S&S Discounts */}
          {data.sns_discounts && Array.isArray(data.sns_discounts) && data.sns_discounts.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Subscribe & Save
              </h4>
              <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                {JSON.stringify(data.sns_discounts, null, 2)}
              </pre>
            </div>
          )}

          {/* Product Details */}
          {data.product_details && Object.keys(data.product_details).length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Product Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(data.product_details).map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-muted-foreground flex-shrink-0">{key}:</span>
                    <span className="font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Reviews */}
          {data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Top Reviews ({data.reviews.length})
              </h4>
              <div className="space-y-3">
                {data.reviews.slice(0, 5).map((review, i) => (
                  <div key={i} className="text-sm border rounded p-3 bg-muted/30">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, si) => (
                          <Star
                            key={si}
                            className={`h-3 w-3 ${si < (review.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                      {review.title && <span className="font-medium text-xs">{review.title}</span>}
                    </div>
                    {review.content && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{review.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      {review.author && <span>By {review.author}</span>}
                      {review.is_verified && <Badge variant="outline" className="text-[9px] px-1 py-0">Verified</Badge>}
                      {review.helpful_count > 0 && <span>{review.helpful_count} helpful</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Q&A */}
          {questions && questions.length > 0 && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                <HelpCircle className="h-3 w-3 inline mr-1" />
                Questions & Answers ({questions.length})
              </h4>
              <div className="space-y-2">
                {(showAllQnA ? questions : questions.slice(0, 5)).map((q, i) => (
                  <div key={i} className="text-sm border rounded p-3 bg-muted/30">
                    <div className="flex items-start gap-2">
                      <span className="text-primary font-bold text-xs mt-0.5 flex-shrink-0">Q:</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{q.question}</p>
                        {q.answer && (
                          <p className="text-xs text-muted-foreground mt-1">{q.answer}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          {q.votes > 0 && (
                            <span className="flex items-center gap-0.5">
                              <ThumbsUp className="h-2.5 w-2.5" />{q.votes}
                            </span>
                          )}
                          {q.author && <span>by {q.author}</span>}
                          {q.date && <span>{q.date}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {questions.length > 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllQnA(!showAllQnA)}
                  className="mt-2 w-full text-xs"
                >
                  <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${showAllQnA ? 'rotate-180' : ''}`} />
                  {showAllQnA ? 'Show Less' : `Show All ${questions.length} Q&As`}
                </Button>
              )}
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
                <div className="text-sm space-y-1">
                  {data.featured_merchant.name && (
                    <p>
                      <span className="text-muted-foreground">Seller:</span>{' '}
                      <span className="font-medium">{data.featured_merchant.name}</span>
                    </p>
                  )}
                  {data.featured_merchant.is_amazon_fulfilled != null && (
                    <p>
                      <span className="text-muted-foreground">Fulfillment:</span>{' '}
                      <Badge variant="outline" className="text-[10px]">
                        {data.featured_merchant.is_amazon_fulfilled ? 'FBA' : 'FBM'}
                      </Badge>
                    </p>
                  )}
                  {data.featured_merchant.shipped_from && (
                    <p>
                      <span className="text-muted-foreground">Ships from:</span>{' '}
                      {data.featured_merchant.shipped_from}
                    </p>
                  )}
                </div>
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
