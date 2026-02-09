'use client'

import { useEffect } from 'react'
import { useListingStore } from '@/stores/listing-store'
import { StepCategoryCountry } from './StepCategoryCountry'
import { StepProductDetails } from './StepProductDetails'
import { StepGeneration } from './StepGeneration'
import { StepReviewExport } from './StepReviewExport'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, RotateCcw } from 'lucide-react'
import type { LbCategory, LbCountry } from '@/types/database'

const STEPS = [
  { label: 'Category & Country', shortLabel: 'Category' },
  { label: 'Product Details', shortLabel: 'Details' },
  { label: 'Generate', shortLabel: 'Generate' },
  { label: 'Review & Export', shortLabel: 'Review' },
]

interface ListingWizardProps {
  categories: LbCategory[]
  countries: LbCountry[]
  editData?: {
    listing: Record<string, unknown>
    sections: Record<string, unknown>[]
    category: LbCategory | null
    country: LbCountry | null
    productType: Record<string, unknown> | null
  } | null
}

export function ListingWizard({ categories, countries, editData }: ListingWizardProps) {
  const currentStep = useListingStore((s) => s.currentStep)
  const setStep = useListingStore((s) => s.setStep)
  const resetWizard = useListingStore((s) => s.resetWizard)
  const loadEditListing = useListingStore((s) => s.loadEditListing)
  const categoryId = useListingStore((s) => s.categoryId)
  const productName = useListingStore((s) => s.productName)
  const listingId = useListingStore((s) => s.listingId)

  // Load edit data on mount
  useEffect(() => {
    if (editData?.listing && editData?.sections && editData?.category && editData?.country) {
      loadEditListing(
        editData.listing as never,
        editData.sections as never[],
        editData.category,
        editData.country,
        editData.productType as never
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Step validation
  const canAdvance = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!categoryId
      case 1:
        return productName.trim().length >= 3
      case 2:
        return !!listingId
      default:
        return true
    }
  }

  const handleNext = () => {
    if (currentStep < 3 && canAdvance(currentStep)) {
      setStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setStep(currentStep - 1)
    }
  }

  const handleReset = () => {
    resetWizard()
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {editData ? 'Edit Listing' : 'New Listing'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate an optimized Amazon listing using AI-powered research analysis
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Start Over
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={index} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                    index < currentStep
                      ? 'bg-primary border-primary text-primary-foreground'
                      : index === currentStep
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    index <= currentStep
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-3 mt-[-1.5rem]',
                    index < currentStep ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 0 && (
          <StepCategoryCountry categories={categories} countries={countries} />
        )}
        {currentStep === 1 && (
          <StepProductDetails categories={categories} />
        )}
        {currentStep === 2 && <StepGeneration />}
        {currentStep === 3 && <StepReviewExport />}
      </div>

      {/* Navigation Buttons */}
      {currentStep !== 2 && currentStep !== 3 && (
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canAdvance(currentStep)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
