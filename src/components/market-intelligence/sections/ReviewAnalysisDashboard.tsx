'use client'

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ReviewAnalysisDashboardProps {
  sentiment: { positive: number; painPoints: number; featureRequests: number; totalReviews: number; averageRating: number }
  demographics?: Array<{ ageRange: string; male: number; female: number }>
  positiveThemes?: Array<{ theme: string; mentions: number }>
  painPoints?: Array<{ theme: string; mentions: number }>
  featureRequests?: Array<{ theme: string; mentions: number }>
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6']

export function ReviewAnalysisDashboard({ sentiment, demographics, positiveThemes, painPoints, featureRequests }: ReviewAnalysisDashboardProps) {
  const donutData = [
    { name: 'Positive', value: sentiment.positive },
    { name: 'Pain Points', value: sentiment.painPoints },
    { name: 'Feature Requests', value: sentiment.featureRequests },
  ]

  return (
    <div className="rounded-lg border bg-card p-6 space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <span className="text-xl">📊</span> Review Analysis Dashboard
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Donut */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Sentiment Distribution</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 text-sm mt-2">
            <span><strong>{sentiment.totalReviews}</strong> reviews</span>
            <span><strong>{sentiment.averageRating?.toFixed(1)}</strong> avg rating</span>
          </div>
        </div>

        {/* Demographics Bar Chart */}
        {demographics && demographics.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Customer Demographics</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demographics}>
                  <XAxis dataKey="ageRange" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="male" fill="#3b82f6" name="Male" />
                  <Bar dataKey="female" fill="#ec4899" name="Female" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Three theme lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {positiveThemes && positiveThemes.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-green-700 mb-2">Top Positive Themes</h4>
            <ul className="space-y-1">
              {positiveThemes.map((t, i) => (
                <li key={i} className="text-xs flex justify-between">
                  <span className="text-green-600">{t.theme}</span>
                  <span className="text-muted-foreground">({t.mentions} mentions)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {painPoints && painPoints.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-red-700 mb-2">Pain Points</h4>
            <ul className="space-y-1">
              {painPoints.map((t, i) => (
                <li key={i} className="text-xs flex justify-between">
                  <span className="text-red-600">{t.theme}</span>
                  <span className="text-muted-foreground">({t.mentions} mentions)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {featureRequests && featureRequests.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-blue-700 mb-2">Feature Requests</h4>
            <ul className="space-y-1">
              {featureRequests.map((t, i) => (
                <li key={i} className="text-xs flex justify-between">
                  <span className="text-blue-600">{t.theme}</span>
                  <span className="text-muted-foreground">({t.mentions} mentions)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
