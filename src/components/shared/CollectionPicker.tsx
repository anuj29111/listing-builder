'use client'

import { useState, useEffect, useRef } from 'react'
import { FolderPlus, Plus, Check, ChevronDown } from 'lucide-react'
import { useCollectionStore } from '@/stores/collection-store'
import type { ResearchEntityType } from '@/types'

interface CollectionPickerProps {
  entityType: ResearchEntityType
  entityId: string
  compact?: boolean
}

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
]

export function CollectionPicker({ entityType, entityId, compact }: CollectionPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [entityCollections, setEntityCollections] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const collections = useCollectionStore((s) => s.collections)
  const fetchCollections = useCollectionStore((s) => s.fetchCollections)
  const addToCollection = useCollectionStore((s) => s.addToCollection)
  const removeFromCollection = useCollectionStore((s) => s.removeFromCollection)
  const createCollection = useCollectionStore((s) => s.createCollection)

  // Load collections if needed
  useEffect(() => {
    if (collections.length === 0) fetchCollections()
  }, [collections.length, fetchCollections])

  // Fetch which collections this entity belongs to when opened
  useEffect(() => {
    if (!open) return

    async function loadEntityCollections() {
      setLoading(true)
      try {
        // Fetch all collection items for this entity
        const promises = collections.map(async (c) => {
          const res = await fetch(`/api/collections/${c.id}`)
          const json = await res.json()
          const items = json.data?.items || []
          const isInCollection = items.some(
            (item: { entity_type: string; entity_id: string }) =>
              item.entity_type === entityType && item.entity_id === entityId
          )
          return isInCollection ? c.id : null
        })
        const results = await Promise.all(promises)
        setEntityCollections(results.filter(Boolean) as string[])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    loadEntityCollections()
  }, [open, collections, entityType, entityId])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleToggle = async (collectionId: string) => {
    if (entityCollections.includes(collectionId)) {
      setEntityCollections((prev) => prev.filter((id) => id !== collectionId))
      await removeFromCollection(collectionId, entityType, entityId)
    } else {
      setEntityCollections((prev) => [...prev, collectionId])
      await addToCollection(collectionId, entityType, entityId)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const c = await createCollection(newName.trim(), undefined, newColor)
    if (c) {
      await addToCollection(c.id, entityType, entityId)
      setEntityCollections((prev) => [...prev, c.id])
    }
    setNewName('')
    setCreating(false)
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        <FolderPlus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {entityCollections.length > 0 && (
          <span className="text-foreground">{entityCollections.length}</span>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg right-0">
          <div className="p-2 border-b">
            <p className="text-xs font-medium text-muted-foreground">Add to collection</p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-center text-xs text-muted-foreground">Loading...</div>
            ) : collections.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">No collections yet</div>
            ) : (
              collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleToggle(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                  {entityCollections.includes(c.id) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
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
                    if (e.key === 'Enter') handleCreate()
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
                    onClick={handleCreate}
                    className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Create
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
  )
}

// Small colored dots showing collection memberships
export function CollectionDots({ collectionIds }: { collectionIds: string[] }) {
  const collections = useCollectionStore((s) => s.collections)

  if (collectionIds.length === 0) return null

  const matched = collections.filter((c) => collectionIds.includes(c.id))

  return (
    <span className="inline-flex items-center gap-0.5">
      {matched.slice(0, 3).map((c) => (
        <span
          key={c.id}
          className="h-2 w-2 rounded-full inline-block"
          style={{ backgroundColor: c.color }}
          title={c.name}
        />
      ))}
      {matched.length > 3 && (
        <span className="text-[10px] text-muted-foreground">+{matched.length - 3}</span>
      )}
    </span>
  )
}
