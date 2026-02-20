'use client'

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
}

export function MarketIntelligenceReport({
  analysisResult,
  competitorsData,
  marketplaceDomain,
  ourAsins,
  questionsData,
}: MarketIntelligenceReportProps) {
  const r = analysisResult
  if (!r) return <div className="text-center py-12 text-muted-foreground">No analysis data available.</div>

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

      {/* 6. Similar Reviews (raw data) */}
      <SimilarReviewsSection competitorsData={competitorsData} />

      {/* 7. Competitor Products (raw data) */}
      <CompetitorProductsSection
        competitorsData={competitorsData}
        marketplaceDomain={marketplaceDomain}
        ourAsins={ourAsins}
      />

      {/* 8. Q&A Section */}
      <QnASection
        qnaResult={qnaResult}
        questionsData={questionsData}
        competitorsData={competitorsData}
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
