'use client'

import { useState } from 'react'
import { HelpCircle, ChevronDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MarketIntelligenceQnAPhaseResult } from '@/types/market-intelligence'

interface QnASectionProps {
  qnaResult?: MarketIntelligenceQnAPhaseResult
  questionsData?: Record<string, Array<Record<string, unknown>>>
  competitorsData?: Array<Record<string, unknown>>
}

export function QnASection({ qnaResult, questionsData, competitorsData }: QnASectionProps) {
  const [showAllRaw, setShowAllRaw] = useState(false)
  const [activeTab, setActiveTab] = useState<'analysis' | 'raw'>('analysis')

  // Aggregate raw Q&A from all products
  const allRawQnA: Array<{ question: string; answer: string; votes: number; asin: string; brand: string }> = []
  if (questionsData && competitorsData) {
    for (const comp of competitorsData) {
      if (comp.error) continue
      const asin = comp.asin as string
      const brand = (comp.brand as string) || ''
      const questions = questionsData[asin] || []
      for (const q of questions) {
        allRawQnA.push({
          question: (q.question as string) || '',
          answer: (q.answer as string) || '',
          votes: (q.votes as number) || 0,
          asin,
          brand,
        })
      }
    }
  }

  const hasAnalysis = qnaResult && (
    (qnaResult.topQuestions?.length > 0) ||
    (qnaResult.questionThemes?.length > 0) ||
    (qnaResult.buyerConcerns?.length > 0)
  )
  const hasRawData = allRawQnA.length > 0

  if (!hasAnalysis && !hasRawData) return null

  const displayedRaw = showAllRaw ? allRawQnA : allRawQnA.slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-blue-500" />
          Questions & Answers ({allRawQnA.length})
        </h3>
        {hasAnalysis && hasRawData && (
          <div className="flex gap-1">
            <Button
              variant={activeTab === 'analysis' ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveTab('analysis')}
            >
              Analysis
            </Button>
            <Button
              variant={activeTab === 'raw' ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setActiveTab('raw')}
            >
              Raw Q&A
            </Button>
          </div>
        )}
      </div>

      {/* Analysis Tab */}
      {(activeTab === 'analysis' || !hasRawData) && hasAnalysis && qnaResult && (
        <div className="space-y-6">
          {/* Question Themes */}
          {qnaResult.questionThemes?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Question Themes</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {qnaResult.questionThemes.map((theme, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{theme.theme}</span>
                      <Badge variant="secondary" className="text-[10px]">{theme.count} questions</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{theme.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buyer Concerns */}
          {qnaResult.buyerConcerns?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Pre-Purchase Concerns</h4>
              <div className="space-y-2">
                {qnaResult.buyerConcerns.map((concern, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{concern.concern}</span>
                      <Badge variant="outline" className="text-[10px]">{concern.frequency}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{concern.resolution}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Gaps from Q&A */}
          {qnaResult.contentGaps?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Content Gaps (from Q&A)</h4>
              <div className="space-y-2">
                {qnaResult.contentGaps.map((gap, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{gap.gap}</span>
                      <Badge
                        variant={gap.importance === 'CRITICAL' ? 'destructive' : 'outline'}
                        className="text-[10px]"
                      >
                        {gap.importance}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{gap.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Questions */}
          {qnaResult.topQuestions?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Top Questions</h4>
              <div className="space-y-2">
                {qnaResult.topQuestions.slice(0, 10).map((q, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-primary font-bold text-sm mt-0.5">Q:</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{q.question}</p>
                        <p className="text-xs text-muted-foreground mt-1">{q.answer}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <Badge variant="secondary" className="text-[9px]">{q.category}</Badge>
                          {q.votes > 0 && (
                            <span className="flex items-center gap-0.5">
                              <ThumbsUp className="h-2.5 w-2.5" />{q.votes}
                            </span>
                          )}
                          <span className="font-mono">{q.asin}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw Q&A Tab */}
      {(activeTab === 'raw' || !hasAnalysis) && hasRawData && (
        <div className="space-y-2">
          {displayedRaw.map((q, i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-2">
                <span className="text-primary font-bold text-sm mt-0.5">Q:</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.question}</p>
                  <p className="text-xs text-muted-foreground mt-1">{q.answer || 'No answer'}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    {q.votes > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="h-2.5 w-2.5" />{q.votes}
                      </span>
                    )}
                    <span>{q.brand || q.asin}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {allRawQnA.length > 10 && (
            <div className="text-center">
              <Button variant="outline" size="sm" onClick={() => setShowAllRaw(!showAllRaw)}>
                <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showAllRaw ? 'rotate-180' : ''}`} />
                {showAllRaw ? 'Show Less' : `Show All ${allRawQnA.length} Q&As`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
