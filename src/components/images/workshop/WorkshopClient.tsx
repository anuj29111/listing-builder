'use client'

import Link from 'next/link'
import { useWorkshopStore } from '@/stores/workshop-store'
import { WorkshopStep1Setup } from './WorkshopStep1Setup'
import { WorkshopStep2Collage } from './WorkshopStep2Collage'
import { WorkshopStep3Combine } from './WorkshopStep3Combine'
import { WorkshopStep4Compare } from './WorkshopStep4Compare'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface WorkshopClientProps {
  listings: Array<{ id: string; title: string | null; generation_context: Record<string, unknown> }>
  categories: Array<{ id: string; name: string; brand: string }>
  countries: Array<{ id: string; name: string; code: string; flag_emoji: string | null }>
}

const STEPS = [
  { num: 1, label: 'Setup & Prompts' },
  { num: 2, label: 'Collage & Tag' },
  { num: 3, label: 'Combine' },
  { num: 4, label: 'Compare' },
]

export function WorkshopClient({ listings, categories, countries }: WorkshopClientProps) {
  const step = useWorkshopStore((s) => s.step)
  const workshopId = useWorkshopStore((s) => s.workshopId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Main Image Workshop</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate, compare, and optimize your Amazon main images
          </p>
        </div>
        <Link href="/images">
          <Button variant="outline" size="sm">Back to Image Builder</Button>
        </Link>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <Badge
              variant={step === s.num ? 'default' : step > s.num ? 'secondary' : 'outline'}
              className={step === s.num ? '' : step > s.num ? 'bg-green-100 text-green-800' : 'opacity-50'}
            >
              {step > s.num ? '\u2713' : s.num}
            </Badge>
            <span className={`text-sm ${step === s.num ? 'font-semibold' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
            {s.num < STEPS.length && (
              <span className="text-muted-foreground mx-1">&rarr;</span>
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 1 && (
        <WorkshopStep1Setup
          listings={listings}
          categories={categories}
          countries={countries}
        />
      )}
      {step === 2 && <WorkshopStep2Collage />}
      {step === 3 && <WorkshopStep3Combine />}
      {step === 4 && <WorkshopStep4Compare />}
    </div>
  )
}
