'use client'

import { useCallback, useState } from 'react'
import { useListingStore } from '@/stores/listing-store'
import { SectionCard } from '@/components/listings/SectionCard'
import { BulletPlanningMatrix } from '@/components/listings/BulletPlanningMatrix'
import { BackendAttributesCard } from '@/components/listings/BackendAttributesCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  RotateCcw, Tag, MapPin, Package, ArrowRight, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatNumber } from '@/lib/utils'
import { SECTION_TYPE_LABELS, SECTION_CHAR_LIMIT_MAP, GENERATION_PHASE_LABELS } from '@/lib/constants'
import type { KeywordCoverage, LbListingSection } from '@/types/database'

// === Phase Progress Bar ===
function PhaseProgressBar({ currentPhase }: { currentPhase: string }) {
  const phases = ['title', 'bullets', 'description', 'backend']
  const phaseIndex = phases.indexOf(currentPhase)
  const isComplete = currentPhase === 'complete'

  return (
    <div className="flex items-center gap-1 mb-6">
      {phases.map((phase, i) => {
        const isDone = isComplete || i < phaseIndex
        const isCurrent = !isComplete && i === phaseIndex
        return (
          <div key={phase} className="flex items-center gap-1 flex-1">
            <div className={`
              flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shrink-0
              ${isDone ? 'bg-green-500 text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
            `}>
              {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-xs truncate ${isCurrent ? 'font-semibold' : isDone ? 'text-green-600' : 'text-muted-foreground'}`}>
              {GENERATION_PHASE_LABELS[phase]}
            </span>
            {i < phases.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${isDone ? 'bg-green-500' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// === Keyword Coverage Panel ===
function KeywordCoveragePanel({ coverage }: { coverage: KeywordCoverage | null }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!coverage) return null

  const { placed, remaining, coverageScore } = coverage
  const highPriority = remaining.filter((kw) => kw.relevancy >= 0.6)
  const medPriority = remaining.filter((kw) => kw.relevancy >= 0.4 && kw.relevancy < 0.6)

  return (
    <div className="rounded-lg border p-4 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="font-medium text-sm">Keyword Coverage</span>
          <Badge variant={coverageScore >= 80 ? 'default' : coverageScore >= 50 ? 'secondary' : 'outline'}>
            {coverageScore}%
          </Badge>
        </div>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <Progress value={coverageScore} className="mt-2 h-2" />

      {isExpanded && (
        <div className="mt-3 space-y-3 text-xs">
          {placed.length > 0 && (
            <div>
              <p className="font-medium text-green-600 mb-1">Placed ({placed.length} keywords):</p>
              <div className="flex flex-wrap gap-1">
                {placed.slice(0, 30).map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20">
                    {kw.keyword} → {kw.placedIn}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {highPriority.length > 0 && (
            <div>
              <p className="font-medium text-red-600 mb-1">High Priority Remaining ({highPriority.length}):</p>
              <div className="flex flex-wrap gap-1">
                {highPriority.map((kw, i) => (
                  <Badge key={i} variant="destructive" className="text-xs">
                    {kw.keyword} (SV: {formatNumber(kw.searchVolume)})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {medPriority.length > 0 && (
            <div>
              <p className="font-medium text-yellow-600 mb-1">Medium Priority ({medPriority.length}):</p>
              <div className="flex flex-wrap gap-1">
                {medPriority.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {kw.keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// === Confirmed Section Summary ===
function ConfirmedSummary({ label, text, onRegenerate }: { label: string; text: string; onRegenerate?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  return (
    <div className="rounded-md border bg-green-50/50 dark:bg-green-900/10 p-3 mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="outline" className="text-xs">{text.length} chars</Badge>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-xs text-muted-foreground hover:text-foreground">
            {isExpanded ? 'Hide' : 'Show'}
          </button>
          {onRegenerate && (
            <button onClick={onRegenerate} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Regenerate
            </button>
          )}
        </div>
      </div>
      {isExpanded && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

// === Main Component ===
export function StepPhasedGeneration() {
  const store = useListingStore()

  const categoryId = store.categoryId
  const countryId = store.countryId
  const categoryName = store.categoryName
  const countryName = store.countryName
  const productName = store.productName
  const asin = store.asin
  const brand = store.brand
  const attributes = store.attributes
  const productTypeName = store.productTypeName
  const optimizationMode = store.optimizationMode
  const existingListingText = store.existingListingText
  const analysisAvailability = store.analysisAvailability
  const listingId = store.listingId
  const generationPhase = store.generationPhase
  const activePhaseLoading = store.activePhaseLoading
  const generationError = store.generationError
  const keywordCoverage = store.keywordCoverage
  const totalTokensUsed = store.totalTokensUsed
  const modelUsed = store.modelUsed
  const sections = store.sections
  const charLimits = store.charLimits
  const confirmedTitle = store.confirmedTitle
  const confirmedBullets = store.confirmedBullets
  const confirmedDescription = store.confirmedDescription
  const confirmedSearchTerms = store.confirmedSearchTerms
  const planningMatrix = store.planningMatrix
  const backendAttributes = store.backendAttributes

  const filledAttributes = attributes.filter((a) => a.key && a.value)
  const completedAnalysis = Object.entries(analysisAvailability)
    .filter(([, v]) => v === 'completed')
    .map(([k]) => k)

  const getCharLimit = (sectionType: string): number => {
    const field = SECTION_CHAR_LIMIT_MAP[sectionType]
    if (!field) return 500
    return charLimits[field.replace('_limit', '') as keyof typeof charLimits] as number || 500
  }

  const getSectionsByType = (type: string): LbListingSection | undefined =>
    sections.find((s) => s.section_type === type)

  // --- API call handlers ---

  const callPhaseAPI = useCallback(async (phase: string, extraBody: Record<string, unknown> = {}) => {
    store.setActivePhaseLoading(phase as 'title' | 'bullets' | 'description' | 'backend')
    store.setGenerating(true)
    store.setGenerationError(null)
    try {
      const res = await fetch('/api/listings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, listing_id: listingId, ...extraBody }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `${phase} generation failed`)
      return json.data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      store.setGenerationError(message)
      store.setActivePhaseLoading(null)
      store.setGenerating(false)
      toast.error(message)
      return null
    }
  }, [listingId, store])

  const handleGenerateTitle = useCallback(async () => {
    const attrsObj: Record<string, string> = {}
    for (const attr of filledAttributes) attrsObj[attr.key] = attr.value

    const data = await callPhaseAPI('title', {
      category_id: categoryId,
      country_id: countryId,
      product_name: productName,
      asin: asin || undefined,
      brand,
      attributes: attrsObj,
      product_type_name: productTypeName || undefined,
      optimization_mode: optimizationMode,
      existing_listing_text: optimizationMode === 'optimize_existing' ? existingListingText : undefined,
    })

    if (data) {
      store.onTitlePhaseComplete(
        data.listing_id,
        data.sections[0],
        data.keywordCoverage,
        data.model,
        data.tokensUsed
      )
      toast.success('Titles generated!')
    }
  }, [callPhaseAPI, categoryId, countryId, productName, asin, brand, filledAttributes, productTypeName, optimizationMode, existingListingText, store])

  const handleConfirmAndGenerateBullets = useCallback(async () => {
    // Find the final text from the title section
    const titleSection = sections.find((s) => s.section_type === 'title')
    const titleText = titleSection?.final_text?.trim()
    if (!titleText) {
      toast.error('Please set a final title text first (use a "Use" button or type in the Final Text box)')
      return
    }
    store.confirmTitle(titleText)

    // Save the final_text to DB
    if (listingId && titleSection) {
      await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: [{ id: titleSection.id, selected_variation: titleSection.selected_variation, is_approved: true, final_text: titleText }],
        }),
      })
    }

    const data = await callPhaseAPI('bullets')
    if (data) {
      store.onBulletsPhaseComplete(
        data.sections,
        data.planningMatrix,
        data.keywordCoverage,
        data.tokensUsed
      )
      toast.success('Bullets generated!')
    }
  }, [sections, store, listingId, callPhaseAPI])

  const handleConfirmAndGenerateDescription = useCallback(async () => {
    const bulletTexts: string[] = []
    for (let i = 1; i <= 5; i++) {
      const bSec = sections.find((s) => s.section_type === `bullet_${i}`)
      const text = bSec?.final_text?.trim()
      if (!text) {
        toast.error(`Please set final text for Bullet ${i}`)
        return
      }
      bulletTexts.push(text)
    }
    store.confirmBullets(bulletTexts)

    // Save bullet final_texts to DB
    if (listingId) {
      const bulletUpdates = sections
        .filter((s) => s.section_type.startsWith('bullet_'))
        .map((s) => {
          const idx = parseInt(s.section_type.split('_')[1]) - 1
          return { id: s.id, selected_variation: s.selected_variation, is_approved: true, final_text: bulletTexts[idx] }
        })
      await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: bulletUpdates }),
      })
    }

    const data = await callPhaseAPI('description')
    if (data) {
      store.onDescriptionPhaseComplete(data.sections, data.keywordCoverage, data.tokensUsed)
      toast.success('Description & search terms generated!')
    }
  }, [sections, store, listingId, callPhaseAPI])

  const handleConfirmAndGenerateBackend = useCallback(async () => {
    const descSec = sections.find((s) => s.section_type === 'description')
    const stSec = sections.find((s) => s.section_type === 'search_terms')
    const descText = descSec?.final_text?.trim()
    const stText = stSec?.final_text?.trim()

    if (!descText) {
      toast.error('Please set final text for Description')
      return
    }
    if (!stText) {
      toast.error('Please set final text for Search Terms')
      return
    }

    store.confirmDescription(descText, stText)

    // Save to DB
    if (listingId) {
      const updates = [descSec, stSec].filter(Boolean).map((s) => ({
        id: s!.id,
        selected_variation: s!.selected_variation,
        is_approved: true,
        final_text: s!.section_type === 'description' ? descText : stText,
      }))
      await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: updates }),
      })
    }

    const data = await callPhaseAPI('backend')
    if (data) {
      store.onBackendPhaseComplete(data.sections, data.backendAttributes, data.keywordCoverage, data.tokensUsed)
      toast.success('Backend attributes generated! Listing complete.')
    }
  }, [sections, store, listingId, callPhaseAPI])

  // --- If complete, show the completion state ---
  if (generationPhase === 'complete') {
    return (
      <div className="space-y-6">
        <PhaseProgressBar currentPhase="complete" />
        <div className="text-center py-6">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Listing Complete!</h2>
          <p className="text-muted-foreground">
            All sections generated with cascading keyword optimization.
          </p>
        </div>

        <KeywordCoveragePanel coverage={keywordCoverage} />

        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          {modelUsed && <Badge variant="outline">Model: {modelUsed}</Badge>}
          {totalTokensUsed > 0 && <Badge variant="outline">Total Tokens: {formatNumber(totalTokensUsed)}</Badge>}
          <Badge variant="outline">{sections.length} sections</Badge>
        </div>

        <div className="text-center">
          <Button onClick={() => useListingStore.getState().setStep(3)}>
            Continue to Review & Export
          </Button>
        </div>
      </div>
    )
  }

  // --- Pending / active generation phases ---
  return (
    <div className="space-y-6">
      {/* Summary Card (only before first generation) */}
      {generationPhase === 'pending' && (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-1">Generate Listing</h2>
            <p className="text-sm text-muted-foreground">
              Your listing will be generated in 4 phases with cascading keyword optimization
            </p>
          </div>

          <div className="rounded-lg border p-5 space-y-4">
            <h3 className="font-medium">Generation Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Category:</span>
                <span className="font-medium">{categoryName}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Country:</span>
                <span className="font-medium">{countryName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium">{productName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground ml-6">Brand:</span>
                <span className="font-medium">{brand}</span>
              </div>
              {asin && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground ml-6">ASIN:</span>
                  <span className="font-medium font-mono">{asin}</span>
                </div>
              )}
              {optimizationMode === 'optimize_existing' && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground ml-6">Mode:</span>
                  <Badge variant="secondary">Optimize Existing</Badge>
                </div>
              )}
            </div>

            {filledAttributes.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Attributes:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {filledAttributes.map((attr, i) => (
                    <Badge key={i} variant="secondary">{attr.key}: {attr.value}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="text-sm text-muted-foreground">Research data:</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {completedAnalysis.length > 0 ? (
                  completedAnalysis.map((type) => (
                    <Badge key={type} variant="default" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {type.replace('_', ' ')}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    No research data — using general best practices
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Phase Progress Bar */}
      {generationPhase !== 'pending' && (
        <PhaseProgressBar currentPhase={generationPhase} />
      )}

      {/* Keyword Coverage */}
      <KeywordCoveragePanel coverage={keywordCoverage} />

      {/* Error Alert */}
      {generationError && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Generation Failed</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{generationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* === PHASE 1: TITLE === */}
      {(generationPhase === 'pending' || generationPhase === 'title') && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Phase 1: Title Generation</h3>
          <p className="text-sm text-muted-foreground">
            Title has the highest weight in Amazon&apos;s A9 algorithm. The most important keywords go here.
          </p>

          {/* Generate button or loading */}
          {generationPhase === 'pending' && (
            <div className="text-center py-4">
              {activePhaseLoading === 'title' ? (
                <div className="space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                  <p className="font-medium">Generating 5 title variations...</p>
                  <p className="text-sm text-muted-foreground">Analyzing keywords and research data</p>
                </div>
              ) : (
                <Button size="lg" onClick={handleGenerateTitle} className="gap-2">
                  {generationError ? (
                    <><RotateCcw className="h-5 w-5" /> Retry Title Generation</>
                  ) : (
                    <><Sparkles className="h-5 w-5" /> Generate Titles</>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Title section card */}
          {generationPhase === 'title' && getSectionsByType('title') && (
            <div className="space-y-4">
              <SectionCard
                section={getSectionsByType('title')!}
                label="Title"
                charLimit={charLimits.title}
                listingId={listingId || undefined}
                defaultCollapsed={false}
                onFinalTextChange={(id, text) => store.updateFinalText(id, text)}
                onVariationAdded={(id, text, idx) => store.addVariation(id, text, idx)}
              />

              <div className="text-center">
                {activePhaseLoading === 'bullets' ? (
                  <div className="space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm font-medium">Generating bullets with keyword cascading...</p>
                  </div>
                ) : (
                  <Button size="lg" onClick={handleConfirmAndGenerateBullets} className="gap-2">
                    <ArrowRight className="h-5 w-5" />
                    Confirm Title & Generate Bullets
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === PHASE 2: BULLETS === */}
      {generationPhase === 'bullets' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Phase 2: Bullet Points</h3>
          <p className="text-sm text-muted-foreground">
            Bullets have the second highest weight. They cover remaining keywords from the title phase.
          </p>

          {/* Show confirmed title */}
          {confirmedTitle && <ConfirmedSummary label="Confirmed Title" text={confirmedTitle} />}

          {/* Planning Matrix */}
          {planningMatrix && planningMatrix.length > 0 && (
            <BulletPlanningMatrix matrix={planningMatrix} />
          )}

          {/* Bullet section cards */}
          {[1, 2, 3, 4, 5].map((n) => {
            const sec = getSectionsByType(`bullet_${n}`)
            if (!sec) return null
            return (
              <SectionCard
                key={sec.id}
                section={sec}
                label={SECTION_TYPE_LABELS[`bullet_${n}`] || `Bullet ${n}`}
                charLimit={charLimits.bullet}
                listingId={listingId || undefined}
                defaultCollapsed={n > 1}
                onFinalTextChange={(id, text) => store.updateFinalText(id, text)}
                onVariationAdded={(id, text, idx) => store.addVariation(id, text, idx)}
              />
            )
          })}

          <div className="text-center">
            {activePhaseLoading === 'description' ? (
              <div className="space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm font-medium">Generating description & search terms...</p>
              </div>
            ) : (
              <Button size="lg" onClick={handleConfirmAndGenerateDescription} className="gap-2">
                <ArrowRight className="h-5 w-5" />
                Confirm Bullets & Generate Description
              </Button>
            )}
          </div>
        </div>
      )}

      {/* === PHASE 3: DESCRIPTION + SEARCH TERMS === */}
      {generationPhase === 'description' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Phase 3: Description & Search Terms</h3>
          <p className="text-sm text-muted-foreground">
            Description catches remaining keywords naturally. Search terms sweep up everything still missing.
          </p>

          {/* Show confirmed content */}
          {confirmedTitle && <ConfirmedSummary label="Confirmed Title" text={confirmedTitle} />}
          {confirmedBullets && confirmedBullets.map((b, i) => (
            <ConfirmedSummary key={i} label={`Bullet ${i + 1}`} text={b} />
          ))}

          {/* Description + Search Terms cards */}
          {getSectionsByType('description') && (
            <SectionCard
              section={getSectionsByType('description')!}
              label="Description"
              charLimit={charLimits.description}
              listingId={listingId || undefined}
              defaultCollapsed={false}
              onFinalTextChange={(id, text) => store.updateFinalText(id, text)}
              onVariationAdded={(id, text, idx) => store.addVariation(id, text, idx)}
            />
          )}

          {getSectionsByType('search_terms') && (
            <SectionCard
              section={getSectionsByType('search_terms')!}
              label="Search Terms"
              charLimit={charLimits.searchTerms}
              listingId={listingId || undefined}
              defaultCollapsed={false}
              onFinalTextChange={(id, text) => store.updateFinalText(id, text)}
              onVariationAdded={(id, text, idx) => store.addVariation(id, text, idx)}
            />
          )}

          <div className="text-center">
            {activePhaseLoading === 'backend' ? (
              <div className="space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm font-medium">Generating backend attributes...</p>
              </div>
            ) : (
              <Button size="lg" onClick={handleConfirmAndGenerateBackend} className="gap-2">
                <ArrowRight className="h-5 w-5" />
                Confirm & Generate Backend Attributes
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Token stats */}
      {totalTokensUsed > 0 && (
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground pt-4 border-t">
          {modelUsed && <Badge variant="outline">Model: {modelUsed}</Badge>}
          <Badge variant="outline">Total Tokens: {formatNumber(totalTokensUsed)}</Badge>
        </div>
      )}
    </div>
  )
}
