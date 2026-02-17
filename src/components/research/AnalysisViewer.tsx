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
    source?: string
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

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString()
}

// Shared section wrapper
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h4 className="font-semibold">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// Executive summary block
function ExecutiveSummary({ text }: { text?: string }) {
  if (!text) return null
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <h4 className="text-sm font-semibold text-primary mb-1">Executive Summary</h4>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  )
}

// Keyword table with optional placement column
function KeywordTable({ keywords, title, subtitle, showPlacement }: {
  keywords: KeywordAnalysisResult['highRelevancy']
  title: string
  subtitle: string
  showPlacement?: boolean
}) {
  if (!keywords || keywords.length === 0) return null
  return (
    <Section title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3">#</th>
              <th className="text-left font-medium p-3">Keyword</th>
              <th className="text-right font-medium p-3">Search Vol</th>
              <th className="text-right font-medium p-3">Relevancy</th>
              <th className="text-right font-medium p-3">Strategic Value</th>
              {showPlacement && <th className="text-left font-medium p-3">Placement</th>}
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-3 text-muted-foreground">{i + 1}</td>
                <td className="p-3 font-medium">{kw.keyword}</td>
                <td className="p-3 text-right">{fmt(kw.searchVolume)}</td>
                <td className="p-3 text-right">{(kw.relevancy ?? 0).toFixed(2)}</td>
                <td className="p-3 text-right font-medium">{fmt(Math.round(kw.strategicValue ?? 0))}</td>
                {showPlacement && (
                  <td className="p-3">
                    {kw.strategicPlacement && (
                      <Badge variant="outline" className="text-[10px]">{kw.strategicPlacement}</Badge>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// --- Keyword Analysis View ---

function KeywordAnalysisView({ data }: { data: KeywordAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <ExecutiveSummary text={data.executiveSummary} />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Keywords</p>
          <p className="text-2xl font-bold">{fmt(data.summary.totalKeywords)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Search Volume</p>
          <p className="text-2xl font-bold">{fmt(data.summary.totalSearchVolume)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Data Quality</p>
          <p className="text-lg font-semibold">{data.summary.dataQuality}</p>
        </div>
      </div>

      {/* Keyword Distribution (new) */}
      {data.keywordDistribution && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['high', 'medium', 'low'] as const).map((tier) => {
            const d = data.keywordDistribution![tier]
            const colors = { high: 'border-green-200 bg-green-50', medium: 'border-yellow-200 bg-yellow-50', low: 'border-gray-200 bg-gray-50' }
            const labels = { high: 'High Relevancy (0.6+)', medium: 'Medium (0.4-0.6)', low: 'Low (<0.4)' }
            return (
              <div key={tier} className={`rounded-lg border p-4 ${colors[tier]}`}>
                <p className="text-xs text-muted-foreground">{labels[tier]}</p>
                <p className="text-xl font-bold">{fmt(d.count)} keywords</p>
                <p className="text-sm text-muted-foreground">{fmt(d.totalVolume)} vol &middot; avg {(d.avgRelevancy ?? 0).toFixed(2)}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Market Opportunity (new) */}
      {data.marketOpportunity && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Addressable Market</p>
            <p className="text-lg font-bold">{fmt(data.marketOpportunity.totalAddressableMarket)}</p>
            <p className="text-xs text-muted-foreground">monthly searches</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Primary Target</p>
            <p className="text-lg font-bold">{fmt(data.marketOpportunity.primaryTargetMarket)}</p>
            <p className="text-xs text-muted-foreground">monthly searches</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Competition</p>
            <p className="text-lg font-bold">{data.marketOpportunity.competitionLevel}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Growth Potential</p>
            <p className="text-lg font-bold">{data.marketOpportunity.growthPotential}</p>
          </div>
        </div>
      )}

      {/* High Relevancy Keywords */}
      <KeywordTable
        keywords={data.highRelevancy}
        title="High Relevancy Keywords"
        subtitle="Relevancy 0.6+ — Priority for title and first 3 bullets"
        showPlacement
      />

      {/* Medium Relevancy Keywords */}
      <KeywordTable
        keywords={data.mediumRelevancy}
        title="Medium Relevancy Keywords"
        subtitle="Relevancy 0.4-0.6 — For bullets 4-5 and description"
        showPlacement
      />

      {/* Low Relevancy Keywords (new) */}
      {data.lowRelevancy && data.lowRelevancy.length > 0 && (
        <KeywordTable
          keywords={data.lowRelevancy}
          title="Low Relevancy Keywords"
          subtitle="Below 0.4 — Background keywords for search terms"
        />
      )}

      {/* Keyword Themes (new) */}
      {data.keywordThemes && data.keywordThemes.length > 0 && (
        <Section title="Keyword Themes" subtitle="Keywords grouped by dimension">
          <div className="p-4 space-y-4">
            {data.keywordThemes.map((dim, i) => (
              <div key={i}>
                <p className="text-sm font-semibold mb-2">{dim.dimension}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {dim.themes.map((t, j) => (
                    <div key={j} className="rounded-lg border p-2 text-center">
                      <p className="text-xs font-medium">{t.name}</p>
                      <p className="text-sm font-bold">{fmt(t.totalSearchVolume)}</p>
                      <p className="text-[10px] text-muted-foreground">{t.keywordCount} kw</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Customer Intent Patterns */}
      <Section title="Customer Intent Patterns">
        <div className="p-4 space-y-3">
          {data.customerIntentPatterns.map((p, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.category}</span>
                  <PriorityBadge priority={p.priority} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {fmt(p.totalSearchVolume)} vol / {p.keywordCount} kw
                </span>
              </div>
              {p.painPoints && (
                <p className="text-xs text-muted-foreground"><span className="font-medium">Pain Points:</span> {p.painPoints}</p>
              )}
              {p.opportunity && (
                <p className="text-xs text-muted-foreground"><span className="font-medium">Opportunity:</span> {p.opportunity}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Feature Demand + Surface Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Feature Demand">
          <div className="p-4 space-y-2">
            {data.featureDemand.map((f, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{f.feature}</span>
                  <PriorityBadge priority={f.priority} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {fmt(f.totalSearchVolume)} vol / {f.keywordCount} kw
                </span>
              </div>
            ))}
          </div>
        </Section>

        {data.surfaceDemand.length > 0 && (
          <Section title="Surface / Application Demand">
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                {data.surfaceDemand.map((s, i) => (
                  <div key={i} className="rounded-lg border p-2 text-center">
                    <p className="text-sm font-medium">{s.surfaceType}</p>
                    <p className="text-lg font-bold">{fmt(s.totalSearchVolume)}</p>
                    <p className="text-xs text-muted-foreground">{s.keywordCount} keywords</p>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}
      </div>

      {/* Competitive Intelligence (new) */}
      {data.competitiveIntelligence && (
        <Section title="Competitive Intelligence">
          <div className="p-4 space-y-4">
            {data.competitiveIntelligence.brandPresence.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Brand Presence in Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {data.competitiveIntelligence.brandPresence.map((b, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {b.brand} ({fmt(b.searchVolume)} SV)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {data.competitiveIntelligence.featureDifferentiation.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Feature Differentiation Opportunities</p>
                <ul className="space-y-1">
                  {data.competitiveIntelligence.featureDifferentiation.map((f, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">+</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.competitiveIntelligence.marketGaps.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Market Gaps</p>
                <ul className="space-y-1">
                  {data.competitiveIntelligence.marketGaps.map((g, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">&#9679;</span> {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Bullet Keyword Map (new) */}
      {data.bulletKeywordMap && data.bulletKeywordMap.length > 0 && (
        <Section title="Bullet Point Keyword Strategy" subtitle="Recommended keywords for each bullet point">
          <div className="p-4 space-y-3">
            {data.bulletKeywordMap.map((b) => (
              <div key={b.bulletNumber} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{b.bulletNumber}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">{b.focus}</p>
                  <div className="flex flex-wrap gap-1">
                    {b.keywords.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Keyword Recommendations (flat lists) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Title Keywords">
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.titleKeywords.map((kw, i) => (
              <Badge key={i} variant="default" className="text-xs">{kw}</Badge>
            ))}
          </div>
        </Section>
        <Section title="Bullet Keywords">
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.bulletKeywords.map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
            ))}
          </div>
        </Section>
        <Section title="Search Terms">
          <div className="p-4 flex flex-wrap gap-1.5">
            {data.searchTermKeywords.map((kw, i) => (
              <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
            ))}
          </div>
        </Section>
      </div>

      {/* Rufus Question Anticipation (new) */}
      {data.rufusQuestionAnticipation && data.rufusQuestionAnticipation.length > 0 && (
        <Section title="Rufus AI Question Anticipation" subtitle="Questions customers will likely ask Rufus — address these in your listing">
          <div className="p-4 space-y-2">
            {data.rufusQuestionAnticipation.map((q, i) => (
              <p key={i} className="text-sm text-muted-foreground pl-3 border-l-2 border-blue-300">
                &ldquo;{q}&rdquo;
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Review Analysis View ---

function ReviewAnalysisView({ data }: { data: ReviewAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <ExecutiveSummary text={data.executiveSummary} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Reviews</p>
          <p className="text-2xl font-bold">{fmt(data.summary.totalReviews)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Average Rating</p>
          <p className="text-2xl font-bold">{(data.summary.averageRating ?? 0).toFixed(1)} / 5</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Positive (4-5 star)</p>
          <p className="text-2xl font-bold text-green-600">{(data.summary.positivePercent ?? 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Negative (1-2 star)</p>
          <p className="text-2xl font-bold text-red-600">{(data.summary.negativePercent ?? 0).toFixed(1)}%</p>
        </div>
      </div>

      {/* Rating Distribution */}
      <Section title="Rating Distribution">
        <div className="p-4 space-y-2">
          {[...data.ratingDistribution].sort((a, b) => b.stars - a.stars).map((r) => (
            <div key={r.stars} className="flex items-center gap-3">
              <span className="text-sm w-12">{r.stars} star</span>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.stars >= 4 ? 'bg-green-500' : r.stars === 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${r.percentage}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground w-32 text-right">
                {r.count} ({(r.percentage ?? 0).toFixed(1)}%)
                {r.sentiment && <span className="text-[10px] ml-1">· {r.sentiment}</span>}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Customer Profiles (new) */}
      {data.customerProfiles && data.customerProfiles.length > 0 && (
        <Section title="Customer Profiles" subtitle="Key buyer personas identified from reviews">
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.customerProfiles.map((p, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{p.profile}</p>
                  <span className="text-xs text-muted-foreground">{fmt(p.mentions)} mentions</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Strengths">
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
        </Section>

        <Section title="Weaknesses">
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
        </Section>
      </div>

      {/* Use Cases */}
      <Section title="Customer Use Cases" subtitle={`${data.useCases.length} distinct use cases identified`}>
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
                  <td className="p-3 text-right">{fmt(uc.frequency)}</td>
                  <td className="p-3 text-right"><PriorityBadge priority={uc.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Language Analysis — expanded */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Positive Language">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Word</th>
                  <th className="text-right font-medium p-3">Frequency</th>
                  {data.positiveLanguage[0]?.optimizationValue && (
                    <th className="text-left font-medium p-3">Optimization</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.positiveLanguage.map((w, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium text-green-700">{w.word}</td>
                    <td className="p-3 text-right">{fmt(w.frequency)}</td>
                    {w.optimizationValue && (
                      <td className="p-3 text-xs text-muted-foreground">{w.optimizationValue}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Negative Language">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Word</th>
                  <th className="text-right font-medium p-3">Frequency</th>
                  {data.negativeLanguage[0]?.issueToAddress && (
                    <th className="text-left font-medium p-3">Issue</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.negativeLanguage.map((w, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium text-red-700">{w.word}</td>
                    <td className="p-3 text-right">{fmt(w.frequency)}</td>
                    {w.issueToAddress && (
                      <td className="p-3 text-xs text-muted-foreground">{w.issueToAddress}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* Product Nouns (new) */}
      {data.productNouns && data.productNouns.length > 0 && (
        <Section title="Product-Defining Nouns" subtitle="Words customers use to describe the product">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Noun</th>
                  <th className="text-right font-medium p-3">Frequency</th>
                  <th className="text-left font-medium p-3">Listing Integration</th>
                </tr>
              </thead>
              <tbody>
                {data.productNouns.map((n, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium">{n.noun}</td>
                    <td className="p-3 text-right">{fmt(n.frequency)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{n.listingIntegration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Cross-Product Analysis (new) */}
      {data.crossProductAnalysis && data.crossProductAnalysis.length > 0 && (
        <Section title="Cross-Product Analysis" subtitle="Performance by ASIN/variation">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Product</th>
                  <th className="text-right font-medium p-3">Reviews</th>
                  <th className="text-right font-medium p-3">Positive %</th>
                  <th className="text-right font-medium p-3">Negative %</th>
                  <th className="text-left font-medium p-3">Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.crossProductAnalysis.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs">{p.productId}</td>
                    <td className="p-3 text-right">{p.reviewCount}</td>
                    <td className="p-3 text-right text-green-600">{(p.positiveRate ?? 0).toFixed(1)}%</td>
                    <td className="p-3 text-right text-red-600">{(p.negativeRate ?? 0).toFixed(1)}%</td>
                    <td className="p-3">
                      <Badge variant={p.performanceRating?.includes('BEST') || p.performanceRating?.includes('HIGH') ? 'success' : p.performanceRating?.includes('POOR') || p.performanceRating?.includes('WORST') ? 'destructive' : 'outline'} className="text-[10px]">
                        {p.performanceRating}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Bullet Strategy */}
      <Section title="Bullet Point Strategy" subtitle="Recommended focus for each bullet based on review insights">
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
                {b.customerPainPoint && (
                  <p className="text-xs text-orange-600 mt-1">Pain point: {b.customerPainPoint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Image Optimization (new) */}
      {data.imageOptimizationOpportunities && data.imageOptimizationOpportunities.length > 0 && (
        <Section title="Image Optimization Opportunities" subtitle="Image suggestions driven by review insights">
          <div className="p-4 space-y-3">
            {data.imageOptimizationOpportunities.map((img, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{i + 1}. {img.imageType}</p>
                <p className="text-xs text-muted-foreground mt-1">{img.rationale}</p>
                <p className="text-xs text-blue-600 mt-1">Evidence: {img.reviewEvidence}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Competitive Positioning (new) */}
      {data.competitivePositioning && (
        <Section title="Competitive Positioning">
          <div className="p-4 space-y-4">
            {data.competitivePositioning.marketGaps.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Market Gaps</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium p-2">Gap</th>
                        <th className="text-left font-medium p-2">Customer Need</th>
                        <th className="text-left font-medium p-2">Opportunity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.competitivePositioning.marketGaps.map((g, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 font-medium">{g.gap}</td>
                          <td className="p-2 text-xs text-muted-foreground">{g.customerNeed}</td>
                          <td className="p-2 text-xs text-muted-foreground">{g.opportunity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-semibold mb-2">Messaging Framework</p>
              <p className="text-sm"><span className="font-medium">Primary:</span> {data.competitivePositioning.messagingFramework.primaryMessage}</p>
              <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Support:</span> {data.competitivePositioning.messagingFramework.supportPoints.join(' · ')}</p>
              <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Proof:</span> {data.competitivePositioning.messagingFramework.proofPoints.join(' · ')}</p>
              <p className="text-xs text-orange-600 mt-1"><span className="font-medium">Risk Reversal:</span> {data.competitivePositioning.messagingFramework.riskReversal}</p>
            </div>
          </div>
        </Section>
      )}

      {/* Customer Voice Phrases (new) */}
      {data.customerVoicePhrases && (
        <Section title="Authentic Customer Voice" subtitle="Real phrases from reviews — use in listing copy">
          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-green-700 mb-2">Positive Emotional</p>
              {data.customerVoicePhrases.positiveEmotional.map((p, i) => (
                <p key={i} className="text-xs text-muted-foreground mb-1">&ldquo;{p}&rdquo;</p>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold mb-2">Functional</p>
              {data.customerVoicePhrases.functional.map((p, i) => (
                <p key={i} className="text-xs text-muted-foreground mb-1">&ldquo;{p}&rdquo;</p>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-2">Use Case Language</p>
              {data.customerVoicePhrases.useCaseLanguage.map((p, i) => (
                <p key={i} className="text-xs text-muted-foreground mb-1">&ldquo;{p}&rdquo;</p>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Q&A Analysis View ---

function QnAAnalysisView({ data }: { data: QnAAnalysisResult }) {
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <ExecutiveSummary text={data.executiveSummary} />

      {/* Summary + Rufus Score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Questions</p>
          <p className="text-2xl font-bold">{fmt(data.summary.totalQuestions)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Top Concerns</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.summary.topConcerns.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
            ))}
          </div>
        </div>
        {data.rufusOptimizationScore && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Rufus Optimization Score</p>
            <p className="text-2xl font-bold">
              {data.rufusOptimizationScore.score} / {data.rufusOptimizationScore.maxScore}
            </p>
          </div>
        )}
      </div>

      {/* Product Specs Confirmed (new) */}
      {data.productSpecsConfirmed && data.productSpecsConfirmed.length > 0 && (
        <Section title="Product Specs Confirmed from Q&A" subtitle="Specifications verified from customer answers">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Specification</th>
                  <th className="text-left font-medium p-3">Value</th>
                  <th className="text-left font-medium p-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.productSpecsConfirmed.map((s, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium">{s.spec}</td>
                    <td className="p-3">{s.value}</td>
                    <td className="p-3 text-xs text-muted-foreground">{s.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Contradictions (new) */}
      {data.contradictions && data.contradictions.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50">
          <div className="p-4 border-b border-red-200">
            <h4 className="font-semibold text-red-800">Contradictions Detected</h4>
            <p className="text-xs text-red-600 mt-1">Conflicting answers that must be resolved in the listing</p>
          </div>
          <div className="p-4 space-y-4">
            {data.contradictions.map((c, i) => (
              <div key={i} className="rounded-lg border border-red-200 bg-white p-3">
                <p className="text-sm font-semibold text-red-800">{c.topic}</p>
                <div className="mt-2 space-y-1">
                  {c.conflictingAnswers.map((a, j) => (
                    <p key={j} className="text-xs text-muted-foreground pl-3 border-l-2 border-red-300">{a}</p>
                  ))}
                </div>
                <p className="text-xs mt-2"><span className="font-medium text-red-700">Impact:</span> {c.impact}</p>
                <p className="text-xs mt-1"><span className="font-medium text-green-700">Resolution:</span> {c.resolution}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question Themes */}
      <Section title="Question Themes">
        <div className="p-4 space-y-4">
          {data.themes.map((theme, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{theme.theme}</span>
                  <PriorityBadge priority={theme.priority} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {theme.questionCount} questions
                  {theme.percentageOfTotal != null && ` (${theme.percentageOfTotal}%)`}
                </span>
              </div>
              <div className="space-y-1">
                {theme.sampleQuestions.map((q, j) => (
                  <p key={j} className="text-xs text-muted-foreground pl-3 border-l-2 border-muted">{q}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Question Type Breakdown (new) */}
      {data.questionTypeBreakdown && data.questionTypeBreakdown.length > 0 && (
        <Section title="Question Type Breakdown" subtitle="How customers phrase their questions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Question Pattern</th>
                  <th className="text-right font-medium p-3">Count</th>
                  <th className="text-right font-medium p-3">%</th>
                  <th className="text-left font-medium p-3">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {data.questionTypeBreakdown.map((qt, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium">&ldquo;{qt.type}&rdquo;</td>
                    <td className="p-3 text-right">{qt.count}</td>
                    <td className="p-3 text-right">{qt.percentage}%</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[250px]">{qt.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Confirmed Features (new) */}
      {data.confirmedFeatures && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Confirmed Features">
            <div className="p-4 space-y-2">
              {data.confirmedFeatures.positive.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">&#10003;</span>
                  <div>
                    <p className="text-sm font-medium">{f.feature}</p>
                    <p className="text-xs text-muted-foreground">{f.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Confirmed Limitations">
            <div className="p-4 space-y-2">
              {data.confirmedFeatures.limitations.map((l, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 flex-shrink-0">&#10007;</span>
                  <div>
                    <p className="text-sm font-medium">{l.limitation}</p>
                    <p className="text-xs text-muted-foreground">{l.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Customer Concerns */}
      <Section title="Customer Concerns">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">Concern</th>
                <th className="text-center font-medium p-3">Freq</th>
                <th className="text-center font-medium p-3">In Listing?</th>
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
      </Section>

      {/* Content Gaps — expanded */}
      <Section title="Content Gaps" subtitle="Information your listing should address — ordered by priority">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">Gap</th>
                <th className="text-center font-medium p-3">Priority</th>
                {data.contentGaps[0]?.priorityScore != null && (
                  <th className="text-center font-medium p-3">Score</th>
                )}
                {data.contentGaps[0]?.customerImpact && (
                  <th className="text-center font-medium p-3">Impact</th>
                )}
                <th className="text-left font-medium p-3">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {data.contentGaps.map((g, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 font-medium">{g.gap}</td>
                  <td className="p-3 text-center"><PriorityBadge priority={g.importance} /></td>
                  {g.priorityScore != null && (
                    <td className="p-3 text-center font-bold">{g.priorityScore}/15</td>
                  )}
                  {g.customerImpact && (
                    <td className="p-3 text-center"><PriorityBadge priority={g.customerImpact} /></td>
                  )}
                  <td className="p-3 text-xs text-muted-foreground max-w-[250px]">{g.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* High Risk Questions (new) */}
      {data.highRiskQuestions && data.highRiskQuestions.length > 0 && (
        <Section title="High-Risk Questions" subtitle="Questions where competitors could place ads or steal customers">
          <div className="p-4 space-y-3">
            {data.highRiskQuestions.map((q, i) => (
              <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="text-sm font-medium">&ldquo;{q.question}&rdquo;</p>
                <p className="text-xs text-orange-700 mt-1"><span className="font-medium">Risk:</span> {q.risk}</p>
                <p className="text-xs text-green-700 mt-1"><span className="font-medium">Defense:</span> {q.defensiveAction}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* FAQ for Description */}
      <Section title="FAQ for Description" subtitle="Top Q&As to weave into listing description">
        <div className="p-4 space-y-3">
          {data.faqForDescription.map((faq, i) => (
            <div key={i} className="rounded-lg border p-3">
              <p className="text-sm font-medium">Q: {faq.question}</p>
              <p className="text-sm text-muted-foreground mt-1">A: {faq.answer}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Competitive Defense (new) */}
      {data.competitiveDefense && (
        <Section title="Competitive Defense Strategy">
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold mb-2">Brand Protection Opportunities</p>
              <ul className="space-y-1">
                {data.competitiveDefense.brandProtectionOpportunities.map((o, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">&#9679;</span> {o}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Information Gap Advantages</p>
              <ul className="space-y-1">
                {data.competitiveDefense.informationGapAdvantages.map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">&#9679;</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Rufus Optimization Score details (new) */}
      {data.rufusOptimizationScore && (
        <Section title={`Rufus AI Optimization Score: ${data.rufusOptimizationScore.score}/${data.rufusOptimizationScore.maxScore}`}>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold text-green-700 mb-2">Strengths</p>
              <ul className="space-y-1">
                {data.rufusOptimizationScore.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">&#10003;</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-700 mb-2">Needs Improvement</p>
              <ul className="space-y-1">
                {data.rufusOptimizationScore.improvements.map((im, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">!</span> {im}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Source Labels ---

const SOURCE_SUFFIXES: Record<string, string> = {
  csv: 'CSV',
  file: 'Analysis File',
  merged: 'Merged',
}

// Normalize legacy 'primary' source to 'csv'
function normalizeSource(source?: string): string {
  if (!source || source === 'primary') return 'csv'
  return source
}

const ANALYSIS_TYPE_PREFIXES: Record<string, string> = {
  keyword_analysis: 'Keywords',
  review_analysis: 'Reviews',
  qna_analysis: 'Q&A',
}

// Render a single analysis result based on type
function AnalysisContent({ analysisType, result }: { analysisType: string; result: Record<string, unknown> }) {
  if (analysisType === 'keyword_analysis') {
    return <KeywordAnalysisView data={result as unknown as KeywordAnalysisResult} />
  }
  if (analysisType === 'review_analysis') {
    return <ReviewAnalysisView data={result as unknown as ReviewAnalysisResult} />
  }
  if (analysisType === 'qna_analysis') {
    return <QnAAnalysisView data={result as unknown as QnAAnalysisResult} />
  }
  return null
}

// Metadata footer for each analysis
function AnalysisMeta({ record }: { record: AnalysisViewerProps['analyses'][number] }) {
  return (
    <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
      <span>Model: {record.model_used || 'unknown'}</span>
      {record.tokens_used != null && record.tokens_used > 0 && (
        <span>Tokens: {record.tokens_used.toLocaleString()}</span>
      )}
      <span>Analyzed: {new Date(record.updated_at).toLocaleDateString()}</span>
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

  const TYPE_LABELS: Record<string, string> = {
    keyword_analysis: 'Keywords',
    review_analysis: 'Reviews',
    qna_analysis: 'Q&A',
  }

  // Group by analysis_type, preserving order
  const orderedTypes = ['keyword_analysis', 'review_analysis', 'qna_analysis']
  const byType = new Map<string, typeof completedAnalyses>()
  for (const a of completedAnalyses) {
    if (!byType.has(a.analysis_type)) byType.set(a.analysis_type, [])
    byType.get(a.analysis_type)!.push(a)
  }

  // Only show tabs for types that have at least one completed analysis
  const availableTypes = orderedTypes.filter((t) => byType.has(t))
  if (availableTypes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No completed analyses yet. Run analysis on uploaded research files to see results here.
      </div>
    )
  }

  const defaultTab = availableTypes[0]

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList>
        {availableTypes.map((at) => (
          <TabsTrigger key={at} value={at}>
            {TYPE_LABELS[at] || at}
          </TabsTrigger>
        ))}
      </TabsList>

      {availableTypes.map((at) => {
        const records = byType.get(at) || []
        const hasMultipleSources = records.length > 1

        // Sort: merged first, then csv, then file
        const sourceOrder = ['merged', 'csv', 'file']
        const sorted = [...records].sort((a, b) => {
          const ai = sourceOrder.indexOf(normalizeSource(a.source))
          const bi = sourceOrder.indexOf(normalizeSource(b.source))
          return ai - bi
        })

        // Default to merged if available, otherwise first
        const defaultSource = normalizeSource(
          sorted.find((r) => normalizeSource(r.source) === 'merged')?.source
            ?? sorted[0]?.source
        )

        return (
          <TabsContent key={at} value={at}>
            {hasMultipleSources ? (
              <Tabs defaultValue={defaultSource} className="w-full">
                <TabsList className="mb-3">
                  {sorted.map((record) => {
                    const src = normalizeSource(record.source)
                    const prefix = ANALYSIS_TYPE_PREFIXES[at] || at
                    const suffix = SOURCE_SUFFIXES[src] || src
                    return (
                      <TabsTrigger key={src} value={src} className="text-xs">
                        {src === 'merged' ? '\u2728 ' : ''}{prefix} — {suffix}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                {sorted.map((record) => {
                  const src = normalizeSource(record.source)
                  return (
                    <TabsContent key={src} value={src}>
                      <AnalysisMeta record={record} />
                      <AnalysisContent analysisType={at} result={record.analysis_result} />
                    </TabsContent>
                  )
                })}
              </Tabs>
            ) : (
              <>
                <AnalysisMeta record={sorted[0]} />
                <AnalysisContent analysisType={at} result={sorted[0].analysis_result} />
              </>
            )}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
