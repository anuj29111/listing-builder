'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Users } from 'lucide-react'
import toast from 'react-hot-toast'

interface CompetitorEntry {
  id: string
  title: string
  bullets: string[]
  description: string
}

interface CompetitorInputProps {
  categoryId: string
  countryId: string
  onAnalysisComplete?: () => void
}

const MAX_COMPETITORS = 5

function createEmptyCompetitor(): CompetitorEntry {
  return {
    id: crypto.randomUUID(),
    title: '',
    bullets: ['', '', '', '', ''],
    description: '',
  }
}

export function CompetitorInput({ categoryId, countryId, onAnalysisComplete }: CompetitorInputProps) {
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([createEmptyCompetitor()])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)

  const addCompetitor = () => {
    if (competitors.length >= MAX_COMPETITORS) return
    setCompetitors((prev) => [...prev, createEmptyCompetitor()])
  }

  const removeCompetitor = (id: string) => {
    setCompetitors((prev) => prev.filter((c) => c.id !== id))
  }

  const updateCompetitor = (id: string, field: keyof CompetitorEntry, value: string | string[]) => {
    setCompetitors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  const updateBullet = (competitorId: string, bulletIndex: number, value: string) => {
    setCompetitors((prev) =>
      prev.map((c) => {
        if (c.id !== competitorId) return c
        const bullets = [...c.bullets]
        bullets[bulletIndex] = value
        return { ...c, bullets }
      })
    )
  }

  const handleAnalyze = async () => {
    const validCompetitors = competitors.filter((c) => c.title.trim().length > 0)
    if (validCompetitors.length === 0) {
      toast.error('Please enter at least one competitor listing')
      return
    }

    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/research/analyze/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          country_id: countryId,
          competitors: validCompetitors.map((c) => ({
            title: c.title.trim(),
            bullets: c.bullets.filter((b) => b.trim()),
            description: c.description.trim(),
          })),
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analysis failed')

      toast.success('Competitor analysis completed!')
      onAnalysisComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const validCount = competitors.filter((c) => c.title.trim().length > 0).length

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <Users className="h-4 w-4 text-orange-500" />
          <h3 className="font-medium">Competitor Analysis</h3>
          {validCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {validCount} competitor{validCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste competitor listings (title, bullets, description) to generate competitive intelligence
          </p>

          {competitors.map((comp, idx) => (
            <div key={comp.id} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Competitor {idx + 1}</span>
                {competitors.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(comp.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Title</Label>
                <input
                  type="text"
                  value={comp.title}
                  onChange={(e) => updateCompetitor(comp.id, 'title', e.target.value)}
                  placeholder="Competitor product title..."
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Bullet Points</Label>
                {comp.bullets.map((bullet, bIdx) => (
                  <input
                    key={bIdx}
                    type="text"
                    value={bullet}
                    onChange={(e) => updateBullet(comp.id, bIdx, e.target.value)}
                    placeholder={`Bullet ${bIdx + 1}...`}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                  />
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Description</Label>
                <textarea
                  value={comp.description}
                  onChange={(e) => updateCompetitor(comp.id, 'description', e.target.value)}
                  placeholder="Competitor product description..."
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            {competitors.length < MAX_COMPETITORS && (
              <Button
                variant="outline"
                size="sm"
                onClick={addCompetitor}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Competitor
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing || validCount === 0}
              className="gap-1"
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              Analyze {validCount} Competitor{validCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
