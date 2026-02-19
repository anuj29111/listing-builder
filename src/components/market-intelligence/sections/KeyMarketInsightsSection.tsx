'use client'

import { Lightbulb, Target, TrendingUp, Star } from 'lucide-react'

interface KeyMarketInsightsSectionProps {
  insights: {
    primaryTargetMarket: { priceRange: string; region: string; income: string; ageRange: string }
    growthOpportunity: { growthRate: string; focusArea: string; marketType: string }
    featurePriority: { importance: string; features: string[] }
  }
}

export function KeyMarketInsightsSection({ insights }: KeyMarketInsightsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-yellow-500" />
        Key Market Insights
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primary Target Market */}
        <div className="rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-violet-600" />
            <h4 className="text-sm font-semibold">Primary Target Market</h4>
          </div>
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-400 mb-2">{insights.primaryTargetMarket.priceRange}</p>
          <p className="text-xs text-muted-foreground">Optimal Price Range</p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Region</span>
              <p className="font-medium">{insights.primaryTargetMarket.region}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Income</span>
              <p className="font-medium">{insights.primaryTargetMarket.income}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Age</span>
              <p className="font-medium">{insights.primaryTargetMarket.ageRange}</p>
            </div>
          </div>
        </div>

        {/* Growth Opportunity */}
        <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <h4 className="text-sm font-semibold">Growth Opportunity</h4>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">{insights.growthOpportunity.growthRate}</p>
          <p className="text-xs text-muted-foreground">Annual Growth Rate</p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Focus Area</span>
              <p className="font-medium">{insights.growthOpportunity.focusArea}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Market Type</span>
              <p className="font-medium">{insights.growthOpportunity.marketType}</p>
            </div>
          </div>
        </div>

        {/* Feature Priority */}
        <div className="rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-semibold">Feature Priority</h4>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-2">{insights.featurePriority.importance}</p>
          <p className="text-xs text-muted-foreground">Feature Importance</p>
          <ul className="mt-3 space-y-1">
            {insights.featurePriority.features.map((f, i) => (
              <li key={i} className="text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
