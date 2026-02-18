'use client'

import { useCallback } from 'react'
import { useListingStore } from '@/stores/listing-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, AlertCircle, CheckCircle2, RotateCcw, Tag, MapPin, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatNumber } from '@/lib/utils'

export function StepGeneration() {
  const categoryId = useListingStore((s) => s.categoryId)
  const countryId = useListingStore((s) => s.countryId)
  const categoryName = useListingStore((s) => s.categoryName)
  const countryName = useListingStore((s) => s.countryName)
  const productName = useListingStore((s) => s.productName)
  const asin = useListingStore((s) => s.asin)
  const brand = useListingStore((s) => s.brand)
  const attributes = useListingStore((s) => s.attributes)
  const productTypeName = useListingStore((s) => s.productTypeName)
  const isGenerating = useListingStore((s) => s.isGenerating)
  const generationError = useListingStore((s) => s.generationError)
  const listingId = useListingStore((s) => s.listingId)
  const modelUsed = useListingStore((s) => s.modelUsed)
  const tokensUsed = useListingStore((s) => s.tokensUsed)
  const sections = useListingStore((s) => s.sections)
  const analysisAvailability = useListingStore((s) => s.analysisAvailability)
  const optimizationMode = useListingStore((s) => s.optimizationMode)
  const existingListingText = useListingStore((s) => s.existingListingText)
  const setGenerating = useListingStore((s) => s.setGenerating)
  const setGenerationError = useListingStore((s) => s.setGenerationError)
  const setGenerationResult = useListingStore((s) => s.setGenerationResult)

  const filledAttributes = attributes.filter((a) => a.key && a.value)
  const completedAnalysis = Object.entries(analysisAvailability)
    .filter(([, v]) => v === 'completed')
    .map(([k]) => k)

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const attrsObj: Record<string, string> = {}
      for (const attr of filledAttributes) {
        attrsObj[attr.key] = attr.value
      }

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          country_id: countryId,
          product_name: productName,
          asin: asin || undefined,
          brand,
          attributes: attrsObj,
          product_type_name: productTypeName || undefined,
          optimization_mode: optimizationMode,
          existing_listing_text: optimizationMode === 'optimize_existing' ? existingListingText : undefined,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Generation failed')
      }

      const { listing, sections: secs } = json.data
      setGenerationResult(
        listing.id,
        secs,
        listing.model_used || 'unknown',
        listing.tokens_used || 0
      )
      toast.success('Listing generated successfully!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      setGenerationError(message)
      toast.error(message)
    }
  }, [
    categoryId, countryId, productName, asin, brand, filledAttributes,
    productTypeName, optimizationMode, existingListingText,
    setGenerating, setGenerationError, setGenerationResult,
  ])

  // If already generated, show success state
  if (listingId && sections.length > 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Listing Generated!</h2>
          <p className="text-muted-foreground">
            Your listing has been created with {sections.length} sections, each with 3 variations.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          {modelUsed && (
            <Badge variant="outline">Model: {modelUsed}</Badge>
          )}
          {tokensUsed && (
            <Badge variant="outline">Tokens: {formatNumber(tokensUsed)}</Badge>
          )}
          <Badge variant="outline">{sections.length} sections</Badge>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Review your listing sections and select your preferred variations below.
          </p>
          <Button onClick={() => useListingStore.getState().setStep(3)}>
            Continue to Review & Export
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Generate Listing</h2>
        <p className="text-sm text-muted-foreground">
          Review your inputs and generate the listing with Claude AI
        </p>
      </div>

      {/* Summary Card */}
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
                <Badge key={i} variant="secondary">
                  {attr.key}: {attr.value}
                </Badge>
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

      {/* Error Alert */}
      {generationError && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                Generation Failed
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {generationError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="text-center py-4">
        {isGenerating ? (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Generating your listing...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Claude AI is creating 3 variations for each section. This may take 15-30 seconds.
              </p>
            </div>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={handleGenerate}
            className="gap-2"
          >
            {generationError ? (
              <>
                <RotateCcw className="h-5 w-5" />
                Retry Generation
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate Listing
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
