'use client'

import { useEffect, useCallback, useState } from 'react'
import { useAPlusStore } from '@/stores/aplus-store'
import { TemplateSelector } from '@/components/aplus/TemplateSelector'
import { ModuleCard } from '@/components/aplus/ModuleCard'
import { ModuleEditor } from '@/components/aplus/ModuleEditor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbAPlusModule, LbListing, LbCategory, LbCountry } from '@/types/database'

interface ListingAPlusSectionProps {
  listingId: string
  listing: Pick<LbListing, 'id' | 'title' | 'generation_context'>
  category: Pick<LbCategory, 'id' | 'name' | 'brand'> | null
  country: Pick<LbCountry, 'id' | 'name' | 'code'> | null
  initialModules: LbAPlusModule[]
}

export function ListingAPlusSection({
  listingId,
  listing,
  category,
  country,
  initialModules,
}: ListingAPlusSectionProps) {
  const modules = useAPlusStore((s) => s.modules)
  const isLoading = useAPlusStore((s) => s.isLoading)
  const isEditing = useAPlusStore((s) => s.isEditing)
  const editingModuleId = useAPlusStore((s) => s.editingModuleId)
  const setModules = useAPlusStore((s) => s.setModules)
  const setListingId = useAPlusStore((s) => s.setListingId)
  const addModule = useAPlusStore((s) => s.addModule)
  const updateModule = useAPlusStore((s) => s.updateModule)
  const removeModule = useAPlusStore((s) => s.removeModule)
  const startEditing = useAPlusStore((s) => s.startEditing)
  const stopEditing = useAPlusStore((s) => s.stopEditing)
  const setIsLoading = useAPlusStore((s) => s.setIsLoading)

  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false)

  // Initialize store with listing context
  useEffect(() => {
    setListingId(listingId)
    setModules(initialModules)

    return () => {
      useAPlusStore.getState().reset()
    }
  }, [listingId, initialModules, setListingId, setModules])

  const fetchModules = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/aplus?listing_id=${listingId}`)
      const json = await res.json()
      if (json.data) setModules(json.data)
    } catch {
      toast.error('Failed to load A+ modules')
    } finally {
      setIsLoading(false)
    }
  }, [listingId, setModules, setIsLoading])

  const handleCreateModule = async (templateType: string) => {
    try {
      const res = await fetch('/api/aplus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: templateType,
          listing_id: listingId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addModule(json.data.module)
      setShowTemplateSelector(false)
      startEditing(json.data.module.id)
      toast.success('Module created')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create module')
    }
  }

  const handleSaveModule = async (id: string, updates: Partial<LbAPlusModule>) => {
    try {
      const res = await fetch(`/api/aplus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      updateModule(id, json.data.module)
      toast.success('Module saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save module')
    }
  }

  const handleDeleteModule = async (id: string) => {
    try {
      const res = await fetch(`/api/aplus/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      removeModule(id)
      toast.success('Module deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete module')
    }
  }

  const handleGenerateStrategy = async () => {
    if (!category) {
      toast.error('Category is required for strategy generation')
      return
    }
    setIsGeneratingStrategy(true)
    try {
      const productName = (listing.generation_context as Record<string, string>)?.productName || ''
      const brand = (listing.generation_context as Record<string, string>)?.brand || category.brand || ''
      const res = await fetch('/api/images/workshop/aplus-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          brand,
          category_id: category.id,
          country_id: country?.id || '',
          listing_id: listingId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate strategy')
      toast.success('A+ strategy generated! Use it to guide your module creation.')
      // Refresh modules in case new ones were created
      fetchModules()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate strategy')
    } finally {
      setIsGeneratingStrategy(false)
    }
  }

  const editingModule = modules.find((m) => m.id === editingModuleId)

  // Build props for ModuleEditor
  const listings = [listing]
  const categories = category ? [category] : []
  const countries = country ? [country] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">A+ Content Modules</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create Amazon A+ Content modules for this listing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleGenerateStrategy}
            disabled={isGeneratingStrategy || !category}
            className="gap-1"
          >
            {isGeneratingStrategy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Strategy
          </Button>
          <Button onClick={() => setShowTemplateSelector(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Module
          </Button>
        </div>
      </div>

      {/* Module list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading modules...</span>
        </div>
      ) : modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg">
          <Sparkles className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm font-medium">No A+ modules yet</p>
          <p className="text-xs mt-1">Click &quot;Add Module&quot; to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              onEdit={() => startEditing(module.id)}
              onDelete={() => handleDeleteModule(module.id)}
              onStatusChange={(status) => handleSaveModule(module.id, { status: status as LbAPlusModule['status'] })}
            />
          ))}
        </div>
      )}

      {/* Template selector dialog */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select A+ Module Template</DialogTitle>
          </DialogHeader>
          <TemplateSelector onSelect={handleCreateModule} />
        </DialogContent>
      </Dialog>

      {/* Module editor dialog */}
      {isEditing && editingModule && (
        <Dialog open={isEditing} onOpenChange={(open) => !open && stopEditing()}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Edit Module</DialogTitle>
            </DialogHeader>
            <ModuleEditor
              module={editingModule}
              listings={listings}
              categories={categories}
              countries={countries}
              onSave={(updates) => handleSaveModule(editingModule.id, updates)}
              onClose={stopEditing}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
