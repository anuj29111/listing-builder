// --- Market Intelligence Module Types ---
// Standalone proof-of-concept: 4th tab on /asin-lookup

// Phase 1: Market & Competitive Analysis
export interface MarketIntelligencePhase1Result {
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
  contentGaps: Array<{
    gap: string
    importance: string
    recommendation: string
  }>
}

// Phase 2: Customer Intelligence & Strategy
export interface MarketIntelligencePhase2Result {
  executiveSummary: string
  customerDemographics: Array<{
    ageRange: string
    male: number
    female: number
  }>
  customerSegments: Array<{
    name: string
    ageRange: string
    occupation: string
    traits: string[]
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

// Final merged result (Phase 1 + Phase 2)
export type MarketIntelligenceResult = MarketIntelligencePhase1Result & MarketIntelligencePhase2Result
