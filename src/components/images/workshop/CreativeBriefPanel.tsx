'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, ChevronDown, ChevronUp, Target, Users, MessageSquare, Palette, Eye } from 'lucide-react'
import { useWorkshopStore } from '@/stores/workshop-store'
import type { CreativeBrief } from '@/types/api'

interface CreativeBriefPanelProps {
  categoryId: string
  countryId: string
  listingId?: string
  marketIntelligenceId?: string
}

export function CreativeBriefPanel({
  categoryId,
  countryId,
  listingId,
  marketIntelligenceId,
}: CreativeBriefPanelProps) {
  const {
    workshopId,
    workshop,
    creativeBrief,
    isGeneratingBrief,
    setCreativeBrief,
    setIsGeneratingBrief,
  } = useWorkshopStore()

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pain_points: true,
    usps: true,
    personas: false,
    voice: false,
    visual: false,
    gaps: false,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleGenerate = async () => {
    if (!workshopId || !workshop) return
    setIsGeneratingBrief(true)

    try {
      const res = await fetch('/api/images/workshop/creative-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: workshop.product_name,
          brand: workshop.brand,
          category_id: categoryId,
          country_id: countryId,
          listing_id: listingId,
          workshop_id: workshopId,
          market_intelligence_id: marketIntelligenceId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate brief')
      }

      const { data } = await res.json()
      setCreativeBrief(data.brief)
    } catch (err) {
      console.error('Creative brief error:', err)
    } finally {
      setIsGeneratingBrief(false)
    }
  }

  if (!creativeBrief) {
    return (
      <div className="border rounded-lg p-6 text-center space-y-3">
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">Creative Brief</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            AI analyzes all your research data to create a strategic creative brief — mapping specific pain points, USPs, and personas to specific image positions.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isGeneratingBrief || !workshopId}
          className="mt-2"
        >
          {isGeneratingBrief ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isGeneratingBrief ? 'Generating Brief...' : 'Generate Creative Brief'}
        </Button>
        {marketIntelligenceId && (
          <p className="text-[10px] text-primary/60 mt-1">
            Market Intelligence data will be included
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Creative Brief</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGenerate}
          disabled={isGeneratingBrief}
          className="h-7 text-xs"
        >
          {isGeneratingBrief ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          Regenerate
        </Button>
      </div>

      <div className="divide-y">
        {/* Pain Points */}
        <BriefSection
          icon={<Target className="h-3.5 w-3.5" />}
          title="Pain Points to Address"
          count={creativeBrief.top_pain_points?.length || 0}
          expanded={expandedSections.pain_points}
          onToggle={() => toggleSection('pain_points')}
        >
          <div className="space-y-2">
            {creativeBrief.top_pain_points?.map((pp, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                  Pos {pp.suggested_image_position}
                </Badge>
                <div className="min-w-0">
                  <p className="font-medium text-foreground/90">
                    {pp.pain_point}
                    {pp.mention_count > 0 && (
                      <span className="text-muted-foreground font-normal"> ({pp.mention_count} mentions)</span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5">{pp.visual_proof_direction}</p>
                </div>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* USPs */}
        <BriefSection
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="USPs to Demonstrate"
          count={creativeBrief.top_usps?.length || 0}
          expanded={expandedSections.usps}
          onToggle={() => toggleSection('usps')}
        >
          <div className="space-y-2">
            {creativeBrief.top_usps?.map((u, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                  Pos {u.suggested_image_position}
                </Badge>
                <div className="min-w-0">
                  <p className="font-medium text-foreground/90">{u.usp}</p>
                  <p className="text-muted-foreground mt-0.5">{u.visual_demo_direction}</p>
                  {u.competitor_weakness && (
                    <p className="text-destructive/60 mt-0.5 text-[10px]">Gap: {u.competitor_weakness}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* Personas */}
        <BriefSection
          icon={<Users className="h-3.5 w-3.5" />}
          title="Target Personas"
          count={creativeBrief.personas?.length || 0}
          expanded={expandedSections.personas}
          onToggle={() => toggleSection('personas')}
        >
          <div className="space-y-2">
            {creativeBrief.personas?.map((p, i) => (
              <div key={i} className="text-xs">
                <p className="font-medium text-foreground/90">{p.name}</p>
                <p className="text-muted-foreground text-[10px]">{p.demographics}</p>
                <p className="text-muted-foreground mt-0.5">{p.lifestyle_scene_direction}</p>
                <p className="text-primary/60 text-[10px] mt-0.5">Trigger: {p.emotional_trigger}</p>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* Customer Voice */}
        <BriefSection
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Customer Voice Phrases"
          count={creativeBrief.customer_voice_phrases?.length || 0}
          expanded={expandedSections.voice}
          onToggle={() => toggleSection('voice')}
        >
          <div className="flex flex-wrap gap-1.5">
            {creativeBrief.customer_voice_phrases?.map((phrase, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal">
                &ldquo;{phrase}&rdquo;
              </Badge>
            ))}
          </div>
        </BriefSection>

        {/* Visual Direction */}
        <BriefSection
          icon={<Palette className="h-3.5 w-3.5" />}
          title="Brand Visual Direction"
          expanded={expandedSections.visual}
          onToggle={() => toggleSection('visual')}
        >
          {creativeBrief.visual_direction && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Colors:</span>
                <div className="flex items-center gap-1">
                  {creativeBrief.visual_direction.primary_colors?.map((c, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full border border-border/50"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  {creativeBrief.visual_direction.secondary_colors?.map((c, i) => (
                    <div
                      key={`s-${i}`}
                      className="w-4 h-4 rounded-full border border-border/30 opacity-70"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Mood:</span>
                <div className="flex flex-wrap gap-1">
                  {creativeBrief.visual_direction.mood?.map((m, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground">
                <span className="font-medium">Style:</span> {creativeBrief.visual_direction.style}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium">Photography:</span> {creativeBrief.visual_direction.photography_style}
              </p>
            </div>
          )}
        </BriefSection>

        {/* Competitor Gaps */}
        <BriefSection
          icon={<Eye className="h-3.5 w-3.5" />}
          title="Competitor Visual Gaps"
          count={creativeBrief.competitor_visual_gaps?.length || 0}
          expanded={expandedSections.gaps}
          onToggle={() => toggleSection('gaps')}
        >
          <div className="space-y-2">
            {creativeBrief.competitor_visual_gaps?.map((g, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={g.priority === 'HIGH' ? 'destructive' : 'secondary'}
                    className="text-[10px] h-4"
                  >
                    {g.priority}
                  </Badge>
                  <span className="font-medium text-foreground/90">{g.gap}</span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  They show: {g.what_competitors_show}
                </p>
                <p className="text-primary/70 mt-0.5">
                  We should: {g.what_we_should_show}
                </p>
              </div>
            ))}
          </div>
        </BriefSection>

        {/* Product Description from Photos */}
        {creativeBrief.product_description_from_photos && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Product Appearance (from photos)
            </p>
            <p className="text-xs text-foreground/80">
              {creativeBrief.product_description_from_photos}
            </p>
          </div>
        )}

        {/* Image Position Strategy */}
        {creativeBrief.image_position_strategy && (
          <div className="px-4 py-3 bg-muted/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Image Position Strategy
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {creativeBrief.image_position_strategy}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function BriefSection({
  icon,
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 ml-1">
              {count}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
