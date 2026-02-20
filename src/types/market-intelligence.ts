// --- Market Intelligence Module Types ---
// 4-phase waterfall analysis: Reviews → Q&A → Market/Competitive → Customer/Strategy

// Phase 1: Review Deep-Dive (per-product summaries)
export interface MarketIntelligenceReviewPhaseResult {
  sentimentAnalysis: {
    positive: number
    painPoints: number
    featureRequests: number
    totalReviews: number
    averageRating: number
  }
  topPositiveThemes: Array<{ theme: string; mentions: number }>
  painPointsList: Array<{ theme: string; mentions: number }>
  featureRequestsList: Array<{ theme: string; mentions: number }>
  topPainPoints: Array<{
    title: string
    description: string
    impactPercentage: number
  }>
  primaryMotivations: Array<{
    title: string
    description: string
    frequencyDescription: string
  }>
  buyingDecisionFactors: Array<{
    rank: number
    title: string
    description: string
  }>
  perProductSummaries: Array<{
    asin: string
    brand: string
    title: string
    positiveThemes: string[]
    negativeThemes: string[]
    uniqueSellingPoints: string[]
    commonComplaints: string[]
    reviewCount: number
    avgRating: number
  }>
}

// Phase 2: Q&A Analysis
export interface MarketIntelligenceQnAPhaseResult {
  topQuestions: Array<{
    question: string
    answer: string
    votes: number
    category: string
    asin: string
  }>
  questionThemes: Array<{
    theme: string
    count: number
    description: string
  }>
  unansweredGaps: Array<{
    gap: string
    importance: string
    recommendation: string
  }>
  buyerConcerns: Array<{
    concern: string
    frequency: string
    resolution: string
  }>
  contentGaps: Array<{
    gap: string
    importance: string
    recommendation: string
  }>
}

// Phase 3: Market & Competitive Analysis
export interface MarketIntelligenceMarketPhaseResult {
  competitiveLandscape: Array<{
    brand: string
    avgRating: number
    reviewCount: number
    category: string
    keyFeatures: string[]
    marketShare: string
  }>
  competitorPatterns: {
    titlePatterns: Array<{ pattern: string; frequency: number; example: string }>
    bulletThemes: Array<{ theme: string; frequency: number; example: string }>
    pricingRange: {
      min: number
      max: number
      average: number
      median: number
      currency: string
    }
  }
  customerSegments: Array<{
    name: string
    ageRange: string
    occupation: string
    traits: string[]
  }>
}

// Phase 4: Customer Intelligence & Strategy
export interface MarketIntelligenceStrategyPhaseResult {
  executiveSummary: string
  customerDemographics: Array<{
    ageRange: string
    male: number
    female: number
  }>
  detailedAvatars: Array<{
    name: string
    initials: string
    role: string
    buyerPercentage: number
    demographics: {
      age: number
      gender: string
      location: string
      income: string
      purchaseFrequency: string
    }
    psychographics: {
      lifestyle: string
      values: string[]
      interests: string[]
    }
    buyingBehavior: string[]
    keyMotivations: string
  }>
  imageRecommendations: string[]
  keyMarketInsights: {
    primaryTargetMarket: {
      priceRange: string
      region: string
      income: string
      ageRange: string
    }
    growthOpportunity: {
      growthRate: string
      focusArea: string
      marketType: string
    }
    featurePriority: {
      importance: string
      features: string[]
    }
  }
  strategicRecommendations: {
    pricing: string[]
    product: string[]
    marketing: string[]
    operations: string[]
  }
  messagingFramework: {
    primaryMessage: string
    supportPoints: string[]
    proofPoints: string[]
    riskReversal: string
  }
  customerVoicePhrases: {
    positiveEmotional: string[]
    functional: string[]
    useCaseLanguage: string[]
  }
}

// Final merged result (all 4 phases)
export type MarketIntelligenceResult =
  MarketIntelligenceReviewPhaseResult &
  MarketIntelligenceQnAPhaseResult &
  MarketIntelligenceMarketPhaseResult &
  MarketIntelligenceStrategyPhaseResult

// Legacy aliases for backward compatibility with existing Phase1/Phase2 naming
export type MarketIntelligencePhase1Result = MarketIntelligenceReviewPhaseResult & MarketIntelligenceMarketPhaseResult
export type MarketIntelligencePhase2Result = MarketIntelligenceStrategyPhaseResult
