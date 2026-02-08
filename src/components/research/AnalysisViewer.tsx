'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type {
  KeywordAnalysisResult,
  ReviewAnalysisResult,
  QnAAnalysisResult,
} from '@/lib/claude'

interface AnalysisViewerProps {
  analyses: Array<{
    id: string
    analysis_type: string
    analysis_result: Record<string, unknown>
    status: string
    model_used: string | null
    tokens_used: number | null
    updated_at: string
  }>
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-gray-100 text-gray-800',
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority] || PRIORITY_COLORS.LOW
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {priority}
    </span>
  )
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

// --- Keyword Analysis View ---

function KeywordAnalysisView({ data }: { data: KeywordAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Keywords</p>
          <p className="text-2xl font-bold">{formatNumber(data.summary.totalKeywords)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Search Volume</p>
          <p className="text-2xl font-bold">{formatNumber(data.summary.totalSearchVolume)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Data Quality</p>
          <p className="text-lg font-semibold">{data.summary.dataQuality}</p>
        </div>
      </div>

      {/* High Relevancy Keywords */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">High Relevancy Keywords</h4>
          <p className="text-xs text-muted-foreground">Relevancy 0.6+ — Priority for title and first 3 bullets</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">#</th>
                <th className="text-left font-medium p-3">Keyword</th>
                <th className="text-right font-medium p-3">Search Volume</th>
                <th className="text-right font-medium p-3">Relevancy</th>
                <th className="text-right font-medium p-3">Strategic Value</th>
              </tr>
            </thead>
            <tbody>
              {data.highRelevancy.map((kw, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{kw.keyword}</td>
                  <td className="p-3 text-right">{formatNumber(kw.searchVolume)}</td>
                  <td className="p-3 text-right">{kw.relevancy.toFixed(3)}</td>
                  <td className="p-3 text-right font-medium">{formatNumber(Math.round(kw.strategicValue))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Medium Relevancy Keywords */}
      {data.mediumRelevancy.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold">Medium Relevancy Keywords</h4>
            <p className="text-xs text-muted-foreground">Relevancy 0.4-0.6 — For bullets 4-5 and description</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">#</th>
                  <th className="text-left font-medium p-3">Keyword</th>
                  <th className="text-right font-medium p-3">Search Volume</th>
                  <th className="text-right font-medium p-3">Relevancy</th>
                </tr>
              </thead>
              <tbody>
                {data.mediumRelevancy.map((kw, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{kw.keyword}</td>
                    <td className="p-3 text-right">{formatNumber(kw.searchVolume)}</td>
                    <td className="p-3 text-right">{kw.relevancy.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Intent + Feature Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Customer Intent Patterns */}
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold">Customer Intent Patterns</h4>
          </div>
          <div className="p-4 space-y-2">
            {data.customerIntentPatterns.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{p.category}</span>
                  <PriorityBadge priority={p.priority} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatNumber(p.totalSearchVolume)} vol / {p.keywordCount} kw
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Demand */}
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold">Feature Demand</h4>
          </div>
          <div className="p-4 space-y-2">
            {data.featureDemand.map((f, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{f.feature}</span>
                  <PriorityBadge priority={f.priority} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatNumber(f.totalSearchVolume)} vol / {f.keywordCount} kw
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Surface Demand */}
      {data.surfaceDemand.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold">Surface Type Demand</h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {data.surfaceDemand.map((s, i) => (
                <div key={i} className="rounded-lg border p-3 text-center">
                  <p className="text-sm font-medium">{s.surfaceType}</p>
                  <p className="text-lg font-bold">{formatNumber(s.totalSearchVolume)}</p>
                  <p className="text-xs text-muted-foreground">{s.keywordCount} keywords</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyword Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Title Keywords</h4>
          </div>
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.titleKeywords.map((kw, i) => (
              <Badge key={i} variant="default" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Bullet Keywords</h4>
          </div>
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.bulletKeywords.map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Search Terms</h4>
          </div>
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.searchTermKeywords.map((kw, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Review Analysis View ---

function ReviewAnalysisView({ data }: { data: ReviewAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Reviews</p>
          <p className="text-2xl font-bold">{formatNumber(data.summary.totalReviews)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Average Rating</p>
          <p className="text-2xl font-bold">{data.summary.averageRating.toFixed(1)} / 5</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Positive (4-5 star)</p>
          <p className="text-2xl font-bold text-green-600">{data.summary.positivePercent.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Negative (1-2 star)</p>
          <p className="text-2xl font-bold text-red-600">{data.summary.negativePercent.toFixed(1)}%</p>
        </div>
      </div>

      {/* Rating Distribution */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Rating Distribution</h4>
        </div>
        <div className="p-4 space-y-2">
          {data.ratingDistribution
            .sort((a, b) => b.stars - a.stars)
            .map((r) => (
              <div key={r.stars} className="flex items-center gap-3">
                <span className="text-sm w-12">{r.stars} star</span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.stars >= 4 ? 'bg-green-500' : r.stars === 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${r.percentage}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-20 text-right">
                  {r.count} ({r.percentage.toFixed(1)}%)
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-green-700">Strengths</h4>
          </div>
          <div className="p-4 space-y-2">
            {data.strengths.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-green-700">{i + 1}.</span>
                  <span className="text-sm">{s.strength}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{s.mentions} mentions</span>
                  <span className="text-[10px] text-green-600 font-medium">{s.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-red-700">Weaknesses</h4>
          </div>
          <div className="p-4 space-y-2">
            {data.weaknesses.map((w, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-red-700">{i + 1}.</span>
                  <span className="text-sm">{w.weakness}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{w.mentions} mentions</span>
                  <span className="text-[10px] text-red-600 font-medium">{w.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Customer Use Cases</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">#</th>
                <th className="text-left font-medium p-3">Use Case</th>
                <th className="text-right font-medium p-3">Frequency</th>
                <th className="text-right font-medium p-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {data.useCases.map((uc, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium">{uc.useCase}</td>
                  <td className="p-3 text-right">{formatNumber(uc.frequency)}</td>
                  <td className="p-3 text-right"><PriorityBadge priority={uc.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Language Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Positive Language</h4>
          </div>
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.positiveLanguage.map((w, i) => (
              <Badge key={i} variant="success" className="text-xs">
                {w.word} ({w.frequency})
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h4 className="font-semibold text-sm">Negative Language</h4>
          </div>
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.negativeLanguage.map((w, i) => (
              <Badge key={i} variant="destructive" className="text-xs">
                {w.word} ({w.frequency})
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Bullet Strategy */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Bullet Point Strategy</h4>
          <p className="text-xs text-muted-foreground">Recommended focus for each bullet based on review insights</p>
        </div>
        <div className="p-4 space-y-3">
          {data.bulletStrategy.map((b) => (
            <div key={b.bulletNumber} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{b.bulletNumber}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{b.focus}</p>
                  <PriorityBadge priority={b.priority} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{b.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Q&A Analysis View ---

function QnAAnalysisView({ data }: { data: QnAAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Questions</p>
          <p className="text-2xl font-bold">{formatNumber(data.summary.totalQuestions)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Top Concerns</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.summary.topConcerns.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Question Themes */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Question Themes</h4>
        </div>
        <div className="p-4 space-y-4">
          {data.themes.map((theme, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{theme.theme}</span>
                  <PriorityBadge priority={theme.priority} />
                </div>
                <span className="text-xs text-muted-foreground">{theme.questionCount} questions</span>
              </div>
              <div className="space-y-1">
                {theme.sampleQuestions.map((q, j) => (
                  <p key={j} className="text-xs text-muted-foreground pl-3 border-l-2 border-muted">
                    {q}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Concerns */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Customer Concerns</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">Concern</th>
                <th className="text-center font-medium p-3">Frequency</th>
                <th className="text-center font-medium p-3">Address in Listing</th>
                <th className="text-left font-medium p-3">Suggested Response</th>
              </tr>
            </thead>
            <tbody>
              {data.customerConcerns.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 font-medium">{c.concern}</td>
                  <td className="p-3 text-center">{c.frequency}</td>
                  <td className="p-3 text-center">
                    {c.addressInListing ? (
                      <Badge variant="success" className="text-[10px]">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">No</Badge>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[300px]">{c.suggestedResponse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content Gaps */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">Content Gaps</h4>
          <p className="text-xs text-muted-foreground">Information your listing should address</p>
        </div>
        <div className="p-4 space-y-3">
          {data.contentGaps.map((g, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
              <PriorityBadge priority={g.importance} />
              <div>
                <p className="text-sm font-medium">{g.gap}</p>
                <p className="text-xs text-muted-foreground mt-1">{g.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ for Description */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h4 className="font-semibold">FAQ for Description</h4>
          <p className="text-xs text-muted-foreground">Top Q&As to weave into listing description</p>
        </div>
        <div className="p-4 space-y-3">
          {data.faqForDescription.map((faq, i) => (
            <div key={i} className="rounded-lg border p-3">
              <p className="text-sm font-medium">Q: {faq.question}</p>
              <p className="text-sm text-muted-foreground mt-1">A: {faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Main Viewer ---

export function AnalysisViewer({ analyses }: AnalysisViewerProps) {
  const completedAnalyses = analyses.filter((a) => a.status === 'completed')

  if (completedAnalyses.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No completed analyses yet. Run analysis on uploaded research files to see results here.
      </div>
    )
  }

  const ANALYSIS_LABELS: Record<string, string> = {
    keyword_analysis: 'Keywords',
    review_analysis: 'Reviews',
    qna_analysis: 'Q&A',
  }

  const defaultTab = completedAnalyses[0].analysis_type

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList>
        {completedAnalyses.map((a) => (
          <TabsTrigger key={a.analysis_type} value={a.analysis_type}>
            {ANALYSIS_LABELS[a.analysis_type] || a.analysis_type}
          </TabsTrigger>
        ))}
      </TabsList>

      {completedAnalyses.map((a) => (
        <TabsContent key={a.analysis_type} value={a.analysis_type}>
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Model: {a.model_used || 'unknown'}</span>
            {a.tokens_used && <span>Tokens: {a.tokens_used.toLocaleString()}</span>}
            <span>Analyzed: {new Date(a.updated_at).toLocaleDateString()}</span>
          </div>

          {a.analysis_type === 'keyword_analysis' && (
            <KeywordAnalysisView data={a.analysis_result as unknown as KeywordAnalysisResult} />
          )}
          {a.analysis_type === 'review_analysis' && (
            <ReviewAnalysisView data={a.analysis_result as unknown as ReviewAnalysisResult} />
          )}
          {a.analysis_type === 'qna_analysis' && (
            <QnAAnalysisView data={a.analysis_result as unknown as QnAAnalysisResult} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
