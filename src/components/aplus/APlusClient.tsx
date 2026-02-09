'use client'

import { useEffect, useCallback, useState } from 'react'
import { useAPlusStore } from '@/stores/aplus-store'
import { TemplateSelector } from './TemplateSelector'
import { ModuleCard } from './ModuleCard'
import { ModuleEditor } from './ModuleEditor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbListing, LbCategory, LbCountry, LbAPlusModule } from '@/types/database'

interface APlusClientProps {
  listings: Array<Pick<LbListing, 'id' | 'title' | 'generation_context'>>
  categories: Array<Pick<LbCategory, 'id' | 'name' | 'brand'>>
  countries: Array<Pick<LbCountry, 'id' | 'name' | 'code'>>
}

export function APlusClient({ listings, categories, countries }: APlusClientProps) {
  const modules = useAPlusStore((s) => s.modules)
  const listingId = useAPlusStore((s) => s.listingId)
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

  const fetchModules = useCallback(async () => {
    setIsLoading(true)
    try {
      const url = listingId ? `/api/aplus?listing_id=${listingId}` : '/api/aplus'
      const res = await fetch(url)
      const json = await res.json()
      if (json.data) setModules(json.data)
    } catch {
      toast.error('Failed to load A+ modules')
    } finally {
      setIsLoading(false)
    }
  }, [listingId, setModules, setIsLoading])

  useEffect(() => {
    fetchModules()
  }, [fetchModules])

  const handleCreateModule = async (templateType: string) => {
    try {
      const res = await fetch('/api/aplus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: templateType,
          listing_id: listingId || undefined,
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

  const editingModule = modules.find((m) => m.id === editingModuleId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A+ Content Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create Amazon A+ Content modules with AI-generated text and images
          </p>
        </div>
        <Button onClick={() => setShowTemplateSelector(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Module
        </Button>
      </div>

      {/* Listing filter */}
      <div className="flex items-center gap-4">
        <div className="w-80">
          <Label className="text-xs">Filter by Listing</Label>
          <Select value={listingId || 'all'} onValueChange={(v) => setListingId(v === 'all' ? null : v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.title || (l.generation_context as Record<string, string>)?.productName || 'Untitled'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
