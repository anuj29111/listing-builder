'use client'

import { useState } from 'react'
import { MessageSquare, ChevronDown, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SimilarReviewsSectionProps {
  competitorsData: Array<Record<string, unknown>>
}

export function SimilarReviewsSection({ competitorsData }: SimilarReviewsSectionProps) {
  const [showAll, setShowAll] = useState(false)

  // Gather all reviews from competitors
  const allReviews: Array<{ rating: number; title: string; content: string; author: string; is_verified: boolean; helpful_count: number; asin: string; brand: string }> = []

  for (const comp of competitorsData) {
    if (comp.error) continue
    const reviews = (comp.top_reviews || []) as Array<Record<string, unknown>>
    for (const r of reviews) {
      allReviews.push({
        rating: (r.rating as number) || 0,
        title: (r.title as string) || '',
        content: (r.content as string) || '',
        author: (r.author as string) || 'Anonymous',
        is_verified: (r.is_verified as boolean) || false,
        helpful_count: (r.helpful_count as number) || 0,
        asin: comp.asin as string,
        brand: (comp.brand as string) || '',
      })
    }
  }

  const displayed = showAll ? allReviews : allReviews.slice(0, 5)

  if (allReviews.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-amber-500" />
          Similar Reviews ({allReviews.length})
        </h3>
      </div>

      <div className="space-y-3">
        {displayed.map((review, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center">
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star key={si} className={`h-3.5 w-3.5 ${si < review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                ))}
              </div>
              <span className="text-xs font-medium">{review.rating.toFixed(1)}</span>
            </div>
            <h4 className="font-medium text-sm">{review.title}</h4>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{review.content}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{review.author}</span>
              {review.is_verified && <span className="text-green-600 font-medium">Verified Purchase</span>}
              {review.helpful_count > 0 && <span>{review.helpful_count} helpful</span>}
              <span className="ml-auto text-[10px]">{review.brand || review.asin}</span>
            </div>
          </div>
        ))}
      </div>

      {allReviews.length > 5 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(!showAll)}>
            <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            {showAll ? 'Show Less' : `Show All ${allReviews.length} Reviews`}
          </Button>
        </div>
      )}
    </div>
  )
}
