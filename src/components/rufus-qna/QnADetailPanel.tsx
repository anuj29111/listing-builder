'use client'

import { useState, useEffect } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

interface QAPair {
  question: string
  answer: string
  votes?: number
  source?: string
}

interface QnADetailPanelProps {
  asin: string
  countryId: string
}

const PAGE_SIZE = 25

export function QnADetailPanel({ asin, countryId }: QnADetailPanelProps) {
  const [questions, setQuestions] = useState<QAPair[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const fetchQA = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/asin-questions?asin=${asin}&country_id=${countryId}`)
        if (res.ok) {
          const data = await res.json()
          setQuestions(data.questions || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchQA()
  }, [asin, countryId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 ml-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 ml-6">
        No Q&A data found.
      </div>
    )
  }

  const totalPages = Math.ceil(questions.length / PAGE_SIZE)
  const pageQuestions = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const rufusCount = questions.filter((q) => q.source === 'rufus').length
  const oxylabsCount = questions.length - rufusCount

  return (
    <div className="ml-6 my-2 border rounded bg-background p-3 space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{questions.length} total Q&A</span>
        {rufusCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700">
            Rufus: {rufusCount}
          </span>
        )}
        {oxylabsCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            Oxylabs: {oxylabsCount}
          </span>
        )}
      </div>

      {/* Q&A List */}
      <div className="space-y-2">
        {pageQuestions.map((qa, i) => (
          <div key={`${page}-${i}`} className="border-b last:border-b-0 pb-2 last:pb-0">
            <div className="flex items-start gap-2">
              <span className="text-xs font-semibold text-muted-foreground mt-0.5">Q:</span>
              <div className="flex-1">
                <span className="text-sm font-medium">{qa.question}</span>
                {qa.source && (
                  <span
                    className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      qa.source === 'rufus'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {qa.source === 'rufus' ? 'Rufus' : 'Oxylabs'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 mt-1">
              <span className="text-xs font-semibold text-muted-foreground mt-0.5">A:</span>
              <p className="text-sm text-muted-foreground flex-1">{qa.answer}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
