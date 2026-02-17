'use client'

import { useState } from 'react'
import { useWorkshopStore } from '@/stores/workshop-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, X, Search, Download } from 'lucide-react'
import toast from 'react-hot-toast'

const CALLOUT_LABELS: Record<string, string> = {
  keyword: 'Keyword',
  benefit: 'Benefit',
  usp: 'USP',
}

const CALLOUT_COLORS: Record<string, string> = {
  keyword: 'bg-blue-600',
  benefit: 'bg-green-600',
  usp: 'bg-purple-600',
}

export function WorkshopStep4Compare() {
  const store = useWorkshopStore()
  const [competitorInput, setCompetitorInput] = useState('')
  const [savingComplete, setSavingComplete] = useState(false)

  const handleAddCompetitor = () => {
    const url = competitorInput.trim()
    if (!url) return

    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
      toast.error('Please enter a valid image URL')
      return
    }

    store.addCompetitorUrl(url)
    setCompetitorInput('')
  }

  const handleCalloutChange = (index: number, text: string) => {
    const updated = [...store.calloutTexts]
    updated[index] = { ...updated[index], text }
    store.setCalloutTexts(updated)
  }

  const handleFinish = async () => {
    if (!store.workshopId) return

    setSavingComplete(true)
    try {
      await fetch(`/api/images/workshop/${store.workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 4,
          callout_texts: store.calloutTexts,
          competitor_urls: store.competitorUrls,
        }),
      })
      toast.success('Workshop saved! Your images are ready for split testing.')
    } catch {
      toast.error('Failed to save workshop')
    } finally {
      setSavingComplete(false)
    }
  }

  const finalImageUrl = store.finalImage?.preview_url || store.finalImage?.full_url

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Compare Callouts & Search Results</h2>
        <p className="text-sm text-muted-foreground">
          Test different callout text overlays on your final image, then see how it looks in search results.
        </p>
      </div>

      {/* Section 1: Callout Variations */}
      <div className="space-y-4">
        <h3 className="font-medium">Callout Text Variations</h3>
        <p className="text-sm text-muted-foreground">
          These text badges are applied on top of the image in post-production. Compare which callout stands out most.
        </p>

        {/* Callout Text Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {store.calloutTexts.map((callout, i) => (
            <div key={i}>
              <Label className="text-xs">
                <Badge variant="outline" className="mr-1">
                  {CALLOUT_LABELS[callout.type] || callout.type}
                </Badge>
              </Label>
              <Input
                value={callout.text}
                onChange={(e) => handleCalloutChange(i, e.target.value)}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        {/* Callout Preview Cards */}
        {finalImageUrl && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {store.calloutTexts.map((callout, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <div className="relative aspect-square bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={finalImageUrl}
                    alt={`Callout: ${callout.text}`}
                    className="w-full h-full object-contain"
                  />
                  {/* Callout Overlay */}
                  {callout.text && (
                    <div className="absolute top-3 left-3 right-3">
                      <div className={`${CALLOUT_COLORS[callout.type] || 'bg-gray-800'} text-white px-3 py-1.5 rounded-md text-sm font-bold text-center shadow-lg`}>
                        {callout.text}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-2 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {CALLOUT_LABELS[callout.type] || callout.type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Search Results Mock-up */}
      <div className="space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          <Search className="h-4 w-4" />
          Search Results Mock-up
        </h3>
        <p className="text-sm text-muted-foreground">
          Paste competitor main image URLs to see how your image stands out in search results.
        </p>

        {/* Add Competitor URL */}
        <div className="flex gap-2">
          <Input
            value={competitorInput}
            onChange={(e) => setCompetitorInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCompetitor()}
            placeholder="Paste competitor image URL..."
            className="flex-1"
          />
          <Button variant="outline" onClick={handleAddCompetitor}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Mock Search Results Grid */}
        <div className="border rounded-lg p-4 bg-white dark:bg-gray-950">
          <div className="text-xs text-muted-foreground mb-3">
            Amazon Search Results Preview
          </div>
          <div className="grid grid-cols-4 gap-3">
            {/* Competitor images */}
            {store.competitorUrls.map((url, i) => (
              <div key={`comp-${i}`} className="relative group">
                <div className="aspect-square bg-white border rounded overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Competitor ${i + 1}`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = ''
                      ;(e.target as HTMLImageElement).alt = 'Failed to load'
                    }}
                  />
                </div>
                <button
                  onClick={() => store.removeCompetitorUrl(url)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="text-[10px] text-muted-foreground text-center mt-1">Competitor</p>
              </div>
            ))}

            {/* Our image (highlighted) */}
            {finalImageUrl && (
              <div className="relative">
                <div className="aspect-square bg-white border-2 border-primary rounded overflow-hidden ring-2 ring-primary/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={finalImageUrl}
                    alt="Your image"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[10px] text-primary font-bold text-center mt-1">YOURS</p>
              </div>
            )}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 8 - store.competitorUrls.length - (finalImageUrl ? 1 : 0)) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square border border-dashed rounded flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Empty</span>
              </div>
            ))}
          </div>
        </div>

        {store.competitorUrls.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Tip: Right-click any Amazon search result image, copy image URL, and paste above.
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => store.setStep(3)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Combine
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleFinish}
            disabled={savingComplete}
          >
            <Download className="mr-2 h-4 w-4" />
            {savingComplete ? 'Saving...' : 'Save Workshop'}
          </Button>
        </div>
      </div>
    </div>
  )
}
