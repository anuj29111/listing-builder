'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, MessageSquare, X } from 'lucide-react'
import { ModularChat } from '@/components/listings/ModularChat'
import type { LbListingSection } from '@/types/database'

interface SectionCardProps {
  section: LbListingSection
  label: string
  charLimit: number
  listingId: string
  onSelectVariation: (sectionId: string, variationIndex: number) => void
  onToggleApproval: (sectionId: string) => void
  onVariationAdded: (sectionId: string, newText: string, newIndex: number) => void
}

function getCharCountColor(length: number, limit: number): string {
  const ratio = length / limit
  if (ratio > 1) return 'text-red-600 dark:text-red-400'
  if (ratio > 0.8) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function getCharBadgeVariant(length: number, limit: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  const ratio = length / limit
  if (ratio > 1) return 'destructive'
  if (ratio > 0.8) return 'outline'
  return 'secondary'
}

function getTabLabel(index: number): string {
  if (index === 0) return 'SEO'
  if (index === 1) return 'Benefit'
  if (index === 2) return 'Balanced'
  return `V${index + 1}`
}

export function SectionCard({
  section,
  label,
  charLimit,
  listingId,
  onSelectVariation,
  onToggleApproval,
  onVariationAdded,
}: SectionCardProps) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const variations = (section.variations || []) as string[]
  const selectedIndex = section.selected_variation || 0
  const currentText = variations[selectedIndex] || ''
  const charCount = currentText.length

  if (variations.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{label}</h3>
        </div>
        <p className="text-sm text-muted-foreground italic">No variations generated for this section.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium">{label}</h3>
          <Badge variant={getCharBadgeVariant(charCount, charLimit)}>
            <span className={getCharCountColor(charCount, charLimit)}>
              {charCount}
            </span>
            <span className="text-muted-foreground">/{charLimit}</span>
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isChatOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="gap-1 h-7 text-xs"
          >
            {isChatOpen ? (
              <>
                <X className="h-3 w-3" />
                Close
              </>
            ) : (
              <>
                <MessageSquare className="h-3 w-3" />
                Refine
              </>
            )}
          </Button>

          {section.is_approved && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          <Label htmlFor={`approve-${section.id}`} className="text-sm text-muted-foreground">
            Approved
          </Label>
          <Switch
            id={`approve-${section.id}`}
            checked={section.is_approved || false}
            onCheckedChange={() => onToggleApproval(section.id)}
          />
        </div>
      </div>

      {/* Variation Tabs */}
      <Tabs
        value={String(selectedIndex)}
        onValueChange={(val) => onSelectVariation(section.id, parseInt(val, 10))}
      >
        <TabsList>
          {variations.map((_, i) => (
            <TabsTrigger key={i} value={String(i)}>
              {getTabLabel(i)}
            </TabsTrigger>
          ))}
        </TabsList>

        {variations.map((text, i) => (
          <TabsContent key={i} value={String(i)}>
            <div className="rounded-md bg-muted/50 p-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {text}
              </p>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Modular Chat */}
      {isChatOpen && (
        <div className="border-t pt-3">
          <ModularChat
            listingId={listingId}
            sectionId={section.id}
            sectionType={section.section_type}
            sectionLabel={label}
            onNewVariation={onVariationAdded}
          />
        </div>
      )}
    </div>
  )
}
