'use client'

import { useCallback } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MarketIntelligenceResult, MarketIntelligenceQnAPhaseResult } from '@/types/market-intelligence'
import { ReviewAnalysisDashboard } from './sections/ReviewAnalysisDashboard'
import { PainPointsSection } from './sections/PainPointsSection'
import { MotivationsSection } from './sections/MotivationsSection'
import { BuyingFactorsSection } from './sections/BuyingFactorsSection'
import { CustomerSegmentsSection } from './sections/CustomerSegmentsSection'
import { SimilarReviewsSection } from './sections/SimilarReviewsSection'
import { CompetitorProductsSection } from './sections/CompetitorProductsSection'
import { QnASection } from './sections/QnASection'
import { ImageRecommendationsSection } from './sections/ImageRecommendationsSection'
import { CompetitiveLandscapeSection } from './sections/CompetitiveLandscapeSection'
import { DetailedAvatarsSection } from './sections/DetailedAvatarsSection'
import { KeyMarketInsightsSection } from './sections/KeyMarketInsightsSection'
import { StrategicRecommendationsSection } from './sections/StrategicRecommendationsSection'
import { MessagingFrameworkSection } from './sections/MessagingFrameworkSection'
import { CompetitorPatternsSection } from './sections/CompetitorPatternsSection'

interface MarketIntelligenceReportProps {
  analysisResult: MarketIntelligenceResult
  competitorsData: Array<Record<string, unknown>>
  marketplaceDomain?: string
  ourAsins?: Set<string>
  questionsData?: Record<string, Array<Record<string, unknown>>>
  reviewsData?: Record<string, Array<Record<string, unknown>>>
  selectedAsins?: string[]
}

export function MarketIntelligenceReport({
  analysisResult,
  competitorsData,
  marketplaceDomain,
  ourAsins,
  questionsData,
  reviewsData,
  selectedAsins,
}: MarketIntelligenceReportProps) {
  const r = analysisResult
  if (!r) return <div className="text-center py-12 text-muted-foreground">No analysis data available.</div>

  // Filter competitors to selected ASINs only (if available)
  const selectedSet = selectedAsins && selectedAsins.length > 0 ? new Set(selectedAsins) : null
  const filteredCompetitors = selectedSet
    ? competitorsData.filter(c => selectedSet.has(c.asin as string))
    : competitorsData

  const totalReviewCount = reviewsData
    ? Object.values(reviewsData).reduce((sum, arr) => sum + (arr?.length || 0), 0)
    : 0

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleExportReviews = useCallback(() => {
    if (!reviewsData || totalReviewCount === 0) return

    const escape = (val: string) => `"${(val || '').replace(/"/g, '""')}"`
    const rows = ['ASIN,Brand,Rating,Title,Content,Author,Verified,Helpful Count,Date']

    for (const [asin, reviews] of Object.entries(reviewsData)) {
      if (!reviews?.length) continue
      const comp = competitorsData.find(c => (c.asin as string) === asin)
      const brand = (comp?.brand as string) || ''
      for (const rev of reviews) {
        rows.push([
          asin,
          escape(brand),
          (rev.rating as number) || 0,
          escape((rev.title as string) || ''),
          escape((rev.content as string) || ''),
          escape((rev.author as string) || ''),
          (rev.is_verified as boolean) ? 'Yes' : 'No',
          (rev.helpful_count as number) || 0,
          (rev.date as string) || '',
        ].join(','))
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mi-reviews-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [reviewsData, competitorsData, totalReviewCount])

  // Extract Q&A result from merged analysis
  const qnaResult: MarketIntelligenceQnAPhaseResult | undefined = r.topQuestions
    ? {
        topQuestions: r.topQuestions,
        questionThemes: r.questionThemes,
        unansweredGaps: r.unansweredGaps,
        buyerConcerns: r.buyerConcerns,
        contentGaps: r.contentGaps,
      }
    : undefined

  return (
    <div className="space-y-8">
      {/* Export Reviews Button */}
      {totalReviewCount > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExportReviews}>
            <Download className="h-4 w-4 mr-1" />
            Export All Reviews ({totalReviewCount.toLocaleString()})
          </Button>
        </div>
      )}

      {/* Executive Summary */}
      {r.executiveSummary && (
        <div className="rounded-lg border bg-primary/5 p-6">
          <h3 className="text-lg font-semibold mb-2">Executive Summary</h3>
          <p className="text-sm leading-relaxed">{r.executiveSummary}</p>
        </div>
      )}

      {/* 1. Review Analysis Dashboard */}
      {r.sentimentAnalysis && (
        <ReviewAnalysisDashboard
          sentiment={r.sentimentAnalysis}
          demographics={r.customerDemographics}
          positiveThemes={r.topPositiveThemes}
          painPoints={r.painPointsList}
          featureRequests={r.featureRequestsList}
        />
      )}

      {/* 2. Pain Points */}
      {r.topPainPoints?.length > 0 && <PainPointsSection painPoints={r.topPainPoints} />}

      {/* 3. Motivations */}
      {r.primaryMotivations?.length > 0 && <MotivationsSection motivations={r.primaryMotivations} />}

      {/* 4. Buying Decision Factors */}
      {r.buyingDecisionFactors?.length > 0 && <BuyingFactorsSection factors={r.buyingDecisionFactors} />}

      {/* 5. Customer Segments */}
      {r.customerSegments?.length > 0 && <CustomerSegmentsSection segments={r.customerSegments} />}

      {/* 6. Reviews (Apify-fetched, actually analyzed) */}
      <SimilarReviewsSection reviewsData={reviewsData} competitorsData={filteredCompetitors} />

      {/* 7. Competitor Products (selected ASINs only) */}
      <CompetitorProductsSection
        competitorsData={filteredCompetitors}
        marketplaceDomain={marketplaceDomain}
        ourAsins={ourAsins}
      />

      {/* 8. Q&A Section */}
      <QnASection
        qnaResult={qnaResult}
        questionsData={questionsData}
        competitorsData={filteredCompetitors}
      />

      {/* 9. Image Recommendations */}
      {r.imageRecommendations?.length > 0 && <ImageRecommendationsSection recommendations={r.imageRecommendations} />}

      {/* 10. Competitive Landscape */}
      {r.competitiveLandscape?.length > 0 && <CompetitiveLandscapeSection landscape={r.competitiveLandscape} />}

      {/* 11. Detailed Avatars */}
      {r.detailedAvatars?.length > 0 && <DetailedAvatarsSection avatars={r.detailedAvatars} />}

      {/* 12. Key Market Insights */}
      {r.keyMarketInsights && <KeyMarketInsightsSection insights={r.keyMarketInsights} />}

      {/* 13. Strategic Recommendations */}
      {r.strategicRecommendations && <StrategicRecommendationsSection recommendations={r.strategicRecommendations} />}

      {/* 14. Messaging Framework */}
      {r.messagingFramework && (
        <MessagingFrameworkSection
          framework={r.messagingFramework}
          voicePhrases={r.customerVoicePhrases}
        />
      )}

      {/* 15. Competitor Patterns */}
      {r.competitorPatterns && (
        <CompetitorPatternsSection
          patterns={r.competitorPatterns}
          contentGaps={r.contentGaps}
        />
      )}
    </div>
  )
}
