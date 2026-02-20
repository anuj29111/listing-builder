'use client'

import { useState, useCallback } from 'react'
import { Package, Star, ExternalLink, ChevronDown, ChevronUp, Tag, Zap, ShoppingCart, TrendingUp, Download, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface CompetitorProductsSectionProps {
  competitorsData: Array<Record<string, unknown>>
  marketplaceDomain?: string
  ourAsins?: Set<string>
}

export function CompetitorProductsSection({ competitorsData, marketplaceDomain = 'amazon.com', ourAsins }: CompetitorProductsSectionProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [lightboxImages, setLightboxImages] = useState<string[]>([])
  const [lightboxIdx, setLightboxIdx] = useState(0)

  const products = competitorsData.filter(c => !c.error)

  const openLightbox = useCallback((images: string[], startIdx: number) => {
    setLightboxImages(images)
    setLightboxIdx(startIdx)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxImages([])
  }, [])

  const exportReviews = useCallback(() => {
    const rows: string[] = ['ASIN,Brand,Rating,Title,Content,Author,Verified,Helpful Count']
    for (const prod of products) {
      const reviews = (prod.top_reviews || []) as Array<Record<string, unknown>>
      const asin = prod.asin as string
      const brand = (prod.brand as string) || ''
      for (const r of reviews) {
        const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
        rows.push([
          asin,
          escape(brand),
          (r.rating as number) || 0,
          escape((r.title as string) || ''),
          escape((r.content as string) || ''),
          escape((r.author as string) || ''),
          (r.is_verified as boolean) ? 'Yes' : 'No',
          (r.helpful_count as number) || 0,
        ].join(','))
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `competitor-reviews-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [products])

  if (products.length === 0) return null

  const totalReviews = products.reduce((sum, p) => {
    const reviews = (p.top_reviews || []) as Array<Record<string, unknown>>
    return sum + reviews.length
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-emerald-500" />
          Competitor Products ({products.length})
        </h3>
        {totalReviews > 0 && (
          <Button variant="outline" size="sm" onClick={exportReviews} className="text-xs">
            <Download className="h-3 w-3 mr-1" />
            Export Reviews ({totalReviews})
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {products.map((prod, i) => {
          const images = (prod.images as string[]) || []
          const title = (prod.title as string) || ''
          const brand = (prod.brand as string) || ''
          const asin = prod.asin as string
          const price = prod.price as number | null
          const priceInitial = prod.price_initial as number | null
          const currency = (prod.currency as string) || '$'
          const rating = (prod.rating as number) || 0
          const reviewsCount = (prod.reviews_count as number) || 0
          const isPrime = prod.is_prime_eligible as boolean
          const isAmazonChoice = prod.amazon_choice as boolean
          const isOurProduct = ourAsins?.has(asin) ?? false
          const expanded = expandedIdx === i
          const salesVolume = prod.sales_volume as string | null
          const dealType = prod.deal_type as string | null
          const coupon = prod.coupon as string | null
          const couponPct = prod.coupon_discount_percentage as number | null
          const discountPct = prod.discount_percentage as number | null
          const salesRank = prod.sales_rank as Array<{ rank: number; ladder?: Array<{ name: string }> }> | null
          const bulletPoints = prod.bullet_points as string | null
          const description = prod.description as string | null
          const productOverview = prod.product_overview as Array<{ title: string; description: string }> | null
          const productDetails = prod.product_details as Record<string, unknown> | null
          const ratingDist = prod.rating_stars_distribution as Array<{ rating: number; percentage: string }> | null
          const topReviews = (prod.top_reviews || []) as Array<Record<string, unknown>>
          const amazonUrl = `https://www.${marketplaceDomain}/dp/${asin}`

          return (
            <div key={i} className="rounded-lg border bg-card overflow-hidden">
              {/* Collapsed view */}
              <div className="p-4">
                <div className="flex gap-4">
                  {/* Main image */}
                  {images[0] && (
                    <div
                      className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => openLightbox(images, 0)}
                    >
                      <img src={images[0]} alt={title} className="w-full h-full object-contain" loading="lazy" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm leading-tight line-clamp-2">{title}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {brand && <span className="text-xs text-muted-foreground font-medium">{brand}</span>}
                      <span className="text-[10px] text-muted-foreground font-mono">{asin}</span>
                      {isPrime && (
                        <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1 py-0">Prime</Badge>
                      )}
                      {isAmazonChoice && (
                        <Badge className="text-[10px] bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 px-1 py-0">AC</Badge>
                      )}
                      {isOurProduct && (
                        <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 px-1 py-0">Our Product</Badge>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {price != null && (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold">{currency}{price.toFixed(2)}</span>
                          {priceInitial != null && priceInitial !== price && (
                            <span className="text-xs text-muted-foreground line-through">{currency}{priceInitial.toFixed(2)}</span>
                          )}
                          {discountPct != null && discountPct > 0 && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0">-{discountPct}%</Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">({reviewsCount.toLocaleString()})</span>
                      </div>
                      {salesRank?.[0] && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          #{salesRank[0].rank?.toLocaleString()}
                        </span>
                      )}
                      {salesVolume && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <ShoppingCart className="h-3 w-3" />
                          {salesVolume}
                        </span>
                      )}
                    </div>

                    {/* Deal badges */}
                    {(dealType || coupon || couponPct) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {dealType && (
                          <Badge variant="outline" className="text-[9px] border-orange-300 text-orange-700 dark:text-orange-400 px-1 py-0">
                            <Zap className="h-2.5 w-2.5 mr-0.5" />{dealType}
                          </Badge>
                        )}
                        {coupon && (
                          <Badge variant="outline" className="text-[9px] border-green-300 text-green-700 dark:text-green-400 px-1 py-0">
                            <Tag className="h-2.5 w-2.5 mr-0.5" />{coupon}
                          </Badge>
                        )}
                        {!coupon && couponPct != null && couponPct > 0 && (
                          <Badge variant="outline" className="text-[9px] border-green-300 text-green-700 dark:text-green-400 px-1 py-0">
                            <Tag className="h-2.5 w-2.5 mr-0.5" />{couponPct}% coupon
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Image strip */}
                {images.length > 1 && (
                  <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                    {images.map((img, j) => (
                      <img
                        key={j}
                        src={img}
                        alt={`${title} ${j + 1}`}
                        className="h-14 w-14 object-contain rounded border bg-white flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        loading="lazy"
                        onClick={() => openLightbox(images, j)}
                      />
                    ))}
                  </div>
                )}

                {/* Expand/Collapse + Amazon Link */}
                <div className="flex items-center justify-between mt-2">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedIdx(expanded ? null : i)} className="text-xs text-muted-foreground">
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                    {expanded ? 'Hide details' : 'Show details'}
                  </Button>
                  <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    View on Amazon <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Expanded details */}
              {expanded && (
                <div className="border-t divide-y">
                  {/* Product Overview */}
                  {productOverview && productOverview.length > 0 && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Product Overview</h5>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {productOverview.map((attr, ai) => (
                          <div key={ai} className="flex gap-2">
                            <span className="text-muted-foreground flex-shrink-0">{attr.title}:</span>
                            <span className="font-medium">{attr.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bullet Points */}
                  {bulletPoints && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bullet Points</h5>
                      <div className="text-sm space-y-1.5">
                        {bulletPoints.split('\n').filter(b => b.trim()).map((bullet, bi) => (
                          <p key={bi} className="flex gap-2">
                            <span className="text-muted-foreground flex-shrink-0">{'\u2022'}</span>
                            <span>{bullet.trim()}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {description && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h5>
                      <p className="text-sm whitespace-pre-wrap line-clamp-6">{description}</p>
                    </div>
                  )}

                  {/* Rating Breakdown */}
                  {ratingDist && ratingDist.length > 0 && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rating Breakdown</h5>
                      <div className="space-y-1 max-w-xs">
                        {Array.from(ratingDist).sort((a, b) => b.rating - a.rating).map((dist, di) => {
                          const pct = parseInt(dist.percentage) || 0
                          return (
                            <div key={di} className="flex items-center gap-2 text-xs">
                              <span className="w-12 text-right">{dist.rating} star</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-8 text-muted-foreground">{dist.percentage}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sales Rank */}
                  {salesRank && salesRank.length > 0 && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sales Rank</h5>
                      {salesRank.map((sr, si) => (
                        <p key={si} className="text-sm">
                          <span className="font-medium">#{sr.rank?.toLocaleString()}</span>
                          {sr.ladder && sr.ladder.length > 0 && (
                            <span className="text-muted-foreground"> in {sr.ladder.map(l => l.name).join(' > ')}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Product Details */}
                  {productDetails && Object.keys(productDetails).length > 0 && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Product Details</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {Object.entries(productDetails).map(([key, val]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-muted-foreground flex-shrink-0">{key}:</span>
                            <span className="font-medium">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Reviews */}
                  {topReviews.length > 0 && (
                    <div className="p-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Top Reviews ({topReviews.length})
                      </h5>
                      <div className="space-y-2">
                        {topReviews.slice(0, 5).map((review, ri) => (
                          <div key={ri} className="text-sm border rounded p-2.5 bg-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex">
                                {Array.from({ length: 5 }).map((_, si) => (
                                  <Star key={si} className={`h-3 w-3 ${si < ((review.rating as number) || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
                                ))}
                              </div>
                              {review.title ? <span className="font-medium text-xs">{String(review.title)}</span> : null}
                            </div>
                            {review.content ? <p className="text-xs text-muted-foreground line-clamp-3">{String(review.content)}</p> : null}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              {review.author ? <span>By {String(review.author)}</span> : null}
                              {(review.is_verified as boolean) && <Badge variant="outline" className="text-[9px] px-1 py-0">Verified</Badge>}
                              {(review.helpful_count as number) > 0 && <span>{review.helpful_count as number} helpful</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Image Lightbox Dialog */}
      <Dialog open={lightboxImages.length > 0} onOpenChange={() => closeLightbox()}>
        <DialogContent className="max-w-3xl p-0 bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[400px]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
              onClick={closeLightbox}
            >
              <X className="h-5 w-5" />
            </Button>

            {lightboxImages.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 text-white hover:bg-white/20 z-10"
                  onClick={() => setLightboxIdx((lightboxIdx - 1 + lightboxImages.length) % lightboxImages.length)}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 text-white hover:bg-white/20 z-10"
                  onClick={() => setLightboxIdx((lightboxIdx + 1) % lightboxImages.length)}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}

            {lightboxImages[lightboxIdx] && (
              <img
                src={lightboxImages[lightboxIdx]}
                alt={`Image ${lightboxIdx + 1} of ${lightboxImages.length}`}
                className="max-h-[80vh] max-w-full object-contain p-8"
              />
            )}

            {lightboxImages.length > 1 && (
              <div className="absolute bottom-4 text-white/80 text-sm">
                {lightboxIdx + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
