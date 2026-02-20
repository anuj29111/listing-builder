'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, MessageSquare, X, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { ModularChat } from '@/components/listings/ModularChat'
import type { LbListingSection } from '@/types/database'

interface SectionCardProps {
  section: LbListingSection
  label: string
  charLimit: number
  listingId?: string
  defaultCollapsed?: boolean
  onFinalTextChange: (sectionId: string, text: string) => void
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

function getVariationLabel(index: number, totalVariations: number, isBullet?: boolean): string {
  // Bullet sections use generic option labels (all variations are balanced/optimized)
  if (isBullet) {
    return `Option ${String.fromCharCode(65 + index)}`  // Option A, Option B, Option C
  }
  // Standard sections (title, description, etc.)
  if (totalVariations <= 5) {
    if (index === 0) return 'SEO'
    if (index === 1) return 'Benefit'
    if (index === 2) return 'Balanced'
    if (index === 3) return 'Feature-Rich'
    if (index === 4) return 'Concise'
  }
  return `V${index + 1}`
}

const STRATEGY_LABELS = ['SEO', 'Benefit', 'Balanced']
const LENGTH_LABELS = ['Concise', 'Medium', 'Longer']

export function SectionCard({
  section,
  label,
  charLimit,
  listingId,
  defaultCollapsed = false,
  onFinalTextChange,
  onVariationAdded,
}: SectionCardProps) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const variations = (section.variations || []) as string[]
  const finalText = section.final_text || ''
  const finalCharCount = finalText.length
  const isApproved = finalText.trim().length > 0

  const isBulletSection = section.section_type.startsWith('bullet_')
  const hasBulletLengthVariations = isBulletSection && variations.length === 9

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
    <div className="rounded-lg border overflow-hidden">
      {/* Collapsible Header */}
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
          <h3 className="font-medium">{label}</h3>
          {isApproved && (
            <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-3 w-3" />
              Approved
            </Badge>
          )}
        </div>
        <Badge variant={getCharBadgeVariant(finalCharCount || 0, charLimit)}>
          <span className={getCharCountColor(finalCharCount || 0, charLimit)}>
            {finalCharCount || 0}
          </span>
          <span className="text-muted-foreground">/{charLimit}</span>
        </Badge>
      </button>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* AI Variations (read-only reference) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AI Variations
            </p>

            {hasBulletLengthVariations ? (
              // 3 strategies x 3 lengths layout for bullets
              <div className="space-y-3">
                {STRATEGY_LABELS.map((strategy, stratIdx) => (
                  <div key={strategy} className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">{strategy} Strategy</p>
                    {LENGTH_LABELS.map((lengthLabel, lenIdx) => {
                      const varIdx = stratIdx * 3 + lenIdx
                      const text = variations[varIdx] || ''
                      return (
                        <div
                          key={varIdx}
                          className="group flex items-start gap-2 rounded-md bg-muted/40 p-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                {lengthLabel}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {text.length} chars
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => onFinalTextChange(section.id, text)}
                            title={`Use ${strategy} ${lengthLabel}`}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Use
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              // Standard stacked layout for title/description/search terms/subject matter
              <div className="space-y-2">
                {variations.map((text, i) => (
                  <div
                    key={i}
                    className="group flex items-start gap-2 rounded-md bg-muted/40 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {getVariationLabel(i, variations.length, isBulletSection)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {text.length} chars
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => onFinalTextChange(section.id, text)}
                      title={`Use ${getVariationLabel(i, variations.length, isBulletSection)}`}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Refine Button — only shown when listing exists in DB */}
          {listingId && (
            <>
              <div>
                <Button
                  variant={isChatOpen ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="gap-1 h-7 text-xs"
                >
                  {isChatOpen ? (
                    <>
                      <X className="h-3 w-3" />
                      Close Chat
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-3 w-3" />
                      Refine with AI
                    </>
                  )}
                </Button>
              </div>

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
            </>
          )}

          {/* Final Approved Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Final Approved Text
              </p>
              <Badge variant={getCharBadgeVariant(finalCharCount, charLimit)}>
                <span className={getCharCountColor(finalCharCount, charLimit)}>
                  {finalCharCount}
                </span>
                <span className="text-muted-foreground">/{charLimit}</span>
              </Badge>
            </div>
            <textarea
              value={finalText}
              onChange={(e) => onFinalTextChange(section.id, e.target.value)}
              placeholder={`Paste or type your final ${label.toLowerCase()} here. Use the "Use" buttons above to copy a variation.`}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              rows={section.section_type === 'description' ? 6 : 3}
            />
            {isApproved && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Section approved — text saved
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
