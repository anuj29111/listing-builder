'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { APLUS_TEMPLATE_LABELS } from '@/lib/constants'
import { Loader2, Sparkles, Save, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbAPlusModule, LbListing, LbCategory, LbCountry } from '@/types/database'

interface ModuleEditorProps {
  module: LbAPlusModule
  listings: Array<Pick<LbListing, 'id' | 'title' | 'generation_context'>>
  categories: Array<Pick<LbCategory, 'id' | 'name' | 'brand'>>
  countries: Array<Pick<LbCountry, 'id' | 'name' | 'code'>>
  onSave: (updates: Partial<LbAPlusModule>) => Promise<void>
  onClose: () => void
}

export function ModuleEditor({ module, listings, categories, countries, onSave, onClose }: ModuleEditorProps) {
  const [content, setContent] = useState<Record<string, unknown>>(
    (module.content as Record<string, unknown>) || {}
  )
  const [title, setTitle] = useState(module.title || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // AI generation context
  const [productName, setProductName] = useState('')
  const [brand, setBrand] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [countryId, setCountryId] = useState('')

  const selectedCategory = categories.find((c) => c.id === categoryId)

  const handleGenerate = async () => {
    if (!productName || !brand) {
      toast.error('Product name and brand are required for AI generation')
      return
    }

    setIsGenerating(true)
    try {
      const res = await fetch(`/api/aplus/${module.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_name: selectedCategory?.name || 'General',
          category_id: categoryId || undefined,
          country_id: countryId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const updatedModule = json.data.module
      setContent(updatedModule.content || {})
      if (updatedModule.title) setTitle(updatedModule.title)
      toast.success(`Content generated (${json.data.tokens_used} tokens)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({ title, content })
    } finally {
      setIsSaving(false)
    }
  }

  // Auto-fill from listing if linked
  const linkedListing = listings.find((l) => l.id === module.listing_id)
  const autoFillFromListing = () => {
    if (!linkedListing) return
    const ctx = linkedListing.generation_context as Record<string, string> | null
    if (ctx) {
      if (ctx.productName) setProductName(ctx.productName)
      if (ctx.brand) setBrand(ctx.brand)
    }
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <Label>Module Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${APLUS_TEMPLATE_LABELS[module.template_type]} module`}
          className="mt-1"
        />
      </div>

      {/* AI Generation Section */}
      <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Content Generation
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Product Name</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Chalk Markers 40-Pack"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Brand</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Chalkola"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Category (optional)</Label>
            <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.brand})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Country (optional)</Label>
            <Select value={countryId || 'none'} onValueChange={(v) => setCountryId(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No country</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {linkedListing && (
            <Button size="sm" variant="outline" onClick={autoFillFromListing}>
              Auto-fill from linked listing
            </Button>
          )}
          <Button size="sm" onClick={handleGenerate} disabled={isGenerating || !productName || !brand}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Generate with AI
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Template-specific content editor */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Content</h4>
        <TemplateFields
          templateType={module.template_type}
          content={content}
          onChange={setContent}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Save Module
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// --- Template-specific field renderers ---

interface TemplateFieldsProps {
  templateType: string
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

function TemplateFields({ templateType, content, onChange }: TemplateFieldsProps) {
  switch (templateType) {
    case 'hero_banner':
      return <HeroBannerFields content={content} onChange={onChange} />
    case 'comparison_chart':
      return <ComparisonChartFields content={content} onChange={onChange} />
    case 'feature_grid':
      return <FeatureGridFields content={content} onChange={onChange} />
    case 'technical_specs':
      return <TechnicalSpecsFields content={content} onChange={onChange} />
    case 'usage_scenarios':
      return <UsageScenariosFields content={content} onChange={onChange} />
    case 'brand_story':
      return <BrandStoryFields content={content} onChange={onChange} />
    default:
      return <p className="text-sm text-muted-foreground">Unknown template type</p>
  }
}

function HeroBannerFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, value: string) => onChange({ ...content, [key]: value })

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Headline</Label>
        <Input
          value={(content.headline as string) || ''}
          onChange={(e) => update('headline', e.target.value)}
          placeholder="Main headline text"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Subheadline</Label>
        <Input
          value={(content.subheadline as string) || ''}
          onChange={(e) => update('subheadline', e.target.value)}
          placeholder="Supporting subheadline"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={(content.description as string) || ''}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Detailed description paragraph"
          className="mt-1"
          rows={3}
        />
      </div>
      <div>
        <Label className="text-xs">Call to Action</Label>
        <Input
          value={(content.cta_text as string) || ''}
          onChange={(e) => update('cta_text', e.target.value)}
          placeholder="e.g. Shop Now"
          className="mt-1"
        />
      </div>
    </div>
  )
}

function ComparisonChartFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const columns = (content.columns as Array<{ header: string; features: string[] }>) || []

  const updateColumn = (index: number, key: string, value: unknown) => {
    const updated = [...columns]
    updated[index] = { ...updated[index], [key]: value }
    onChange({ ...content, columns: updated })
  }

  const addColumn = () => {
    onChange({ ...content, columns: [...columns, { header: '', features: [''] }] })
  }

  const removeColumn = (index: number) => {
    const updated = columns.filter((_, i) => i !== index)
    onChange({ ...content, columns: updated })
  }

  const addFeature = (colIndex: number) => {
    const updated = [...columns]
    updated[colIndex] = { ...updated[colIndex], features: [...updated[colIndex].features, ''] }
    onChange({ ...content, columns: updated })
  }

  const updateFeature = (colIndex: number, featIndex: number, value: string) => {
    const updated = [...columns]
    const features = [...updated[colIndex].features]
    features[featIndex] = value
    updated[colIndex] = { ...updated[colIndex], features }
    onChange({ ...content, columns: updated })
  }

  const removeFeature = (colIndex: number, featIndex: number) => {
    const updated = [...columns]
    updated[colIndex] = {
      ...updated[colIndex],
      features: updated[colIndex].features.filter((_, i) => i !== featIndex),
    }
    onChange({ ...content, columns: updated })
  }

  return (
    <div className="space-y-4">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="rounded border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={col.header}
              onChange={(e) => updateColumn(colIdx, 'header', e.target.value)}
              placeholder={`Column ${colIdx + 1} header`}
              className="flex-1"
            />
            <Button size="sm" variant="ghost" className="text-red-600 h-8 w-8 p-0" onClick={() => removeColumn(colIdx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {col.features.map((feat, featIdx) => (
            <div key={featIdx} className="flex items-center gap-2 ml-4">
              <Input
                value={feat}
                onChange={(e) => updateFeature(colIdx, featIdx, e.target.value)}
                placeholder={`Feature ${featIdx + 1}`}
                className="flex-1 text-sm"
              />
              <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0" onClick={() => removeFeature(colIdx, featIdx)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="ml-4 text-xs" onClick={() => addFeature(colIdx)}>
            <Plus className="h-3 w-3 mr-1" /> Add Feature
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addColumn}>
        <Plus className="h-4 w-4 mr-1" /> Add Column
      </Button>
    </div>
  )
}

function FeatureGridFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const features = (content.features as Array<{ title: string; description: string }>) || []

  const updateFeature = (index: number, key: string, value: string) => {
    const updated = [...features]
    updated[index] = { ...updated[index], [key]: value }
    onChange({ ...content, features: updated })
  }

  const addFeature = () => {
    onChange({ ...content, features: [...features, { title: '', description: '' }] })
  }

  const removeFeature = (index: number) => {
    onChange({ ...content, features: features.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {features.map((feat, idx) => (
        <div key={idx} className="rounded border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={feat.title}
              onChange={(e) => updateFeature(idx, 'title', e.target.value)}
              placeholder={`Feature ${idx + 1} title`}
              className="flex-1"
            />
            <Button size="sm" variant="ghost" className="text-red-600 h-8 w-8 p-0" onClick={() => removeFeature(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={feat.description}
            onChange={(e) => updateFeature(idx, 'description', e.target.value)}
            placeholder="Feature description"
            rows={2}
            className="text-sm"
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addFeature}>
        <Plus className="h-4 w-4 mr-1" /> Add Feature
      </Button>
    </div>
  )
}

function TechnicalSpecsFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const specs = (content.specs as Array<{ label: string; value: string }>) || []

  const updateSpec = (index: number, key: string, value: string) => {
    const updated = [...specs]
    updated[index] = { ...updated[index], [key]: value }
    onChange({ ...content, specs: updated })
  }

  const addSpec = () => {
    onChange({ ...content, specs: [...specs, { label: '', value: '' }] })
  }

  const removeSpec = (index: number) => {
    onChange({ ...content, specs: specs.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-2">
      {specs.map((spec, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={spec.label}
            onChange={(e) => updateSpec(idx, 'label', e.target.value)}
            placeholder="Spec label"
            className="w-40"
          />
          <Input
            value={spec.value}
            onChange={(e) => updateSpec(idx, 'value', e.target.value)}
            placeholder="Spec value"
            className="flex-1"
          />
          <Button size="sm" variant="ghost" className="text-red-600 h-8 w-8 p-0" onClick={() => removeSpec(idx)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addSpec}>
        <Plus className="h-4 w-4 mr-1" /> Add Specification
      </Button>
    </div>
  )
}

function UsageScenariosFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const scenarios = (content.scenarios as Array<{ title: string; description: string }>) || []

  const updateScenario = (index: number, key: string, value: string) => {
    const updated = [...scenarios]
    updated[index] = { ...updated[index], [key]: value }
    onChange({ ...content, scenarios: updated })
  }

  const addScenario = () => {
    onChange({ ...content, scenarios: [...scenarios, { title: '', description: '' }] })
  }

  const removeScenario = (index: number) => {
    onChange({ ...content, scenarios: scenarios.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {scenarios.map((scenario, idx) => (
        <div key={idx} className="rounded border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={scenario.title}
              onChange={(e) => updateScenario(idx, 'title', e.target.value)}
              placeholder={`Scenario ${idx + 1} title`}
              className="flex-1"
            />
            <Button size="sm" variant="ghost" className="text-red-600 h-8 w-8 p-0" onClick={() => removeScenario(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={scenario.description}
            onChange={(e) => updateScenario(idx, 'description', e.target.value)}
            placeholder="Describe how the product is used in this scenario"
            rows={2}
            className="text-sm"
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addScenario}>
        <Plus className="h-4 w-4 mr-1" /> Add Scenario
      </Button>
    </div>
  )
}

function BrandStoryFields({ content, onChange }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const paragraphs = (content.paragraphs as string[]) || []

  const updateParagraph = (index: number, value: string) => {
    const updated = [...paragraphs]
    updated[index] = value
    onChange({ ...content, paragraphs: updated })
  }

  const addParagraph = () => {
    onChange({ ...content, paragraphs: [...paragraphs, ''] })
  }

  const removeParagraph = (index: number) => {
    onChange({ ...content, paragraphs: paragraphs.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Headline</Label>
        <Input
          value={(content.headline as string) || ''}
          onChange={(e) => onChange({ ...content, headline: e.target.value })}
          placeholder="Brand story headline"
          className="mt-1"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Paragraphs</Label>
        {paragraphs.map((para, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Textarea
              value={para}
              onChange={(e) => updateParagraph(idx, e.target.value)}
              placeholder={`Paragraph ${idx + 1}`}
              rows={3}
              className="flex-1 text-sm"
            />
            <Button size="sm" variant="ghost" className="text-red-600 h-8 w-8 p-0 mt-1" onClick={() => removeParagraph(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addParagraph}>
          <Plus className="h-4 w-4 mr-1" /> Add Paragraph
        </Button>
      </div>
      <div>
        <Label className="text-xs">Call to Action</Label>
        <Input
          value={(content.cta_text as string) || ''}
          onChange={(e) => onChange({ ...content, cta_text: e.target.value })}
          placeholder="e.g. Discover Our Story"
          className="mt-1"
        />
      </div>
    </div>
  )
}
