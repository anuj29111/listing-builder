'use client'

import { useState, useRef, useEffect } from 'react'
import { Tag, MessageSquare, FolderPlus, X, Check, Plus, ChevronDown, Loader2 } from 'lucide-react'
import { useCollectionStore } from '@/stores/collection-store'
import type { ResearchEntityType } from '@/types'

interface BulkActionBarProps {
  selectedIds: string[]
  entityType: ResearchEntityType
  onClear: () => void
  onUpdate: () => void // refresh data after bulk action
}

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
]

type ActiveAction = 'tags' | 'notes' | 'collections' | null

export function BulkActionBar({ selectedIds, entityType, onClear, onUpdate }: BulkActionBarProps) {
  const [active, setActive] = useState<ActiveAction>(null)
  const [tagInput, setTagInput] = useState('')
  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [bulkNote, setBulkNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const containerRef = useRef<HTMLDivElement>(null)

  const collections = useCollectionStore((s) => s.collections)
  const fetchCollections = useCollectionStore((s) => s.fetchCollections)
  const allTags = useCollectionStore((s) => s.allTags)
  const fetchAllTags = useCollectionStore((s) => s.fetchAllTags)

  useEffect(() => {
    if (collections.length === 0) fetchCollections()
    if (allTags.length === 0) fetchAllTags()
  }, [collections.length, allTags.length, fetchCollections, fetchAllTags])

  // Close popover on outside click
  useEffect(() => {
    if (!active) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [active])

  const suggestions = tagInput.trim()
    ? allTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !bulkTags.includes(t)).slice(0, 6)
    : []

  const addBulkTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (normalized && !bulkTags.includes(normalized)) {
      setBulkTags((prev) => [...prev, normalized])
    }
    setTagInput('')
  }

  const handleBulkTagApply = async () => {
    if (bulkTags.length === 0) return
    setSaving(true)
    try {
      await fetch('/api/bulk-tags-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, entityType, tags: bulkTags, mode: 'merge' }),
      })
      setBulkTags([])
      setActive(null)
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  const handleBulkNoteApply = async () => {
    if (!bulkNote.trim()) return
    setSaving(true)
    try {
      await fetch('/api/bulk-tags-notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, entityType, notes: bulkNote }),
      })
      setBulkNote('')
      setActive(null)
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  const handleBulkAddToCollection = async (collectionId: string) => {
    setSaving(true)
    try {
      const items = selectedIds.map((id) => ({ entity_type: entityType, entity_id: id }))
      await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      fetchCollections()
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCollection = async () => {
    if (!newName.trim()) return
    const createCollection = useCollectionStore.getState().createCollection
    const c = await createCollection(newName.trim(), undefined, newColor)
    if (c) {
      await handleBulkAddToCollection(c.id)
    }
    setNewName('')
    setCreating(false)
  }

  if (selectedIds.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="sticky top-0 z-40 flex items-center gap-2 rounded-lg border bg-primary/5 border-primary/20 px-3 py-2 mb-2"
    >
      <span className="text-sm font-medium text-primary">
        {selectedIds.length} selected
      </span>

      <div className="flex items-center gap-1 ml-2">
        {/* Bulk Tag */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActive(active === 'tags' ? null : 'tags')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              active === 'tags'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-border'
            }`}
          >
            <Tag className="h-3 w-3" />
            Add Tags
          </button>

          {active === 'tags' && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded-md border bg-popover shadow-lg p-3 z-50">
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 min-h-[28px] mb-2">
                {bulkTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {tag}
                    <button type="button" onClick={() => setBulkTags((prev) => prev.filter((t) => t !== tag))}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      if (suggestions.length > 0) addBulkTag(suggestions[0])
                      else if (tagInput.trim()) addBulkTag(tagInput)
                    }
                  }}
                  placeholder={bulkTags.length === 0 ? 'Type tags...' : ''}
                  className="flex-1 min-w-[60px] bg-transparent outline-none text-xs text-foreground"
                />
              </div>
              {suggestions.length > 0 && (
                <div className="rounded-md border bg-popover mb-2 max-h-32 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addBulkTag(s)}
                      className="w-full px-3 py-1 text-left text-xs hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleBulkTagApply}
                disabled={bulkTags.length === 0 || saving}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Apply to {selectedIds.length} items
              </button>
            </div>
          )}
        </div>

        {/* Bulk Note */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActive(active === 'notes' ? null : 'notes')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              active === 'notes'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-border'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Set Note
          </button>

          {active === 'notes' && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded-md border bg-popover shadow-lg p-3 z-50">
              <textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Note for all selected items..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring mb-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleBulkNoteApply()
                }}
              />
              <button
                type="button"
                onClick={handleBulkNoteApply}
                disabled={!bulkNote.trim() || saving}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Apply to {selectedIds.length} items
              </button>
            </div>
          )}
        </div>

        {/* Bulk Collection */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setActive(active === 'collections' ? null : 'collections')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              active === 'collections'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-border'
            }`}
          >
            <FolderPlus className="h-3 w-3" />
            Add to Collection
          </button>

          {active === 'collections' && (
            <div className="absolute left-0 top-full mt-1 w-64 rounded-md border bg-popover shadow-lg z-50">
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-muted-foreground">
                  Add {selectedIds.length} items to collection
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {collections.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">No collections yet</div>
                ) : (
                  collections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleBulkAddToCollection(c.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      disabled={saving}
                    >
                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                      {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                    </button>
                  ))
                )}
              </div>
              <div className="border-t p-2">
                {creating ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateCollection()
                        if (e.key === 'Escape') setCreating(false)
                      }}
                      placeholder="Collection name..."
                      className="w-full px-2 py-1.5 text-sm border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewColor(color)}
                          className={`h-5 w-5 rounded-full border-2 ${
                            newColor === color ? 'border-foreground' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCreating(false)}
                        className="flex-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground border rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateCollection}
                        className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                      >
                        Create & Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    New Collection
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear selection */}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
        Clear
      </button>
    </div>
  )
}
