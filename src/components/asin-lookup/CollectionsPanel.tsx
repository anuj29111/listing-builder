'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, FolderOpen, ScanSearch, Search, MessageSquare, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCollectionStore } from '@/stores/collection-store'
import type { LbCollection } from '@/types'

const ENTITY_LABELS: Record<string, { label: string; icon: typeof ScanSearch }> = {
  asin_lookup: { label: 'ASIN Lookups', icon: ScanSearch },
  keyword_search: { label: 'Keyword Searches', icon: Search },
  asin_review: { label: 'Reviews', icon: MessageSquare },
  market_intelligence: { label: 'Market Intelligence', icon: BarChart3 },
}

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
]

interface CollectionDetail {
  items: Array<{ entity_type: string; entity_id: string; created_at: string }>
  entities: Record<string, Array<Record<string, unknown>>>
}

export function CollectionsPanel() {
  const collections = useCollectionStore((s) => s.collections)
  const fetchCollections = useCollectionStore((s) => s.fetchCollections)
  const createCollection = useCollectionStore((s) => s.createCollection)
  const deleteCollection = useCollectionStore((s) => s.deleteCollection)
  const updateCollection = useCollectionStore((s) => s.updateCollection)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editColor, setEditColor] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<CollectionDetail | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createCollection(newName.trim(), newDesc.trim() || undefined, newColor)
    setNewName('')
    setNewDesc('')
    setNewColor('#6366f1')
    setCreating(false)
  }

  const handleUpdate = async (id: string) => {
    await updateCollection(id, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      color: editColor,
    })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await deleteCollection(id)
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
      return
    }

    setExpandedId(id)
    setExpandedData(null)
    setLoadingExpand(true)

    try {
      const res = await fetch(`/api/collections/${id}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setExpandedData({
          items: json.data.items || [],
          entities: json.data.entities || {},
        })
      }
    } catch {
      // silent
    } finally {
      setLoadingExpand(false)
    }
  }

  const startEdit = (c: LbCollection & { item_counts: Record<string, number>; total_items: number }) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditDesc(c.description || '')
    setEditColor(c.color)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Collections
        </h2>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            New Collection
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name..."
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Color:</span>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={`h-6 w-6 rounded-full border-2 ${
                  newColor === color ? 'border-foreground' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Collections list */}
      {collections.length === 0 && !creating ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No collections yet. Create one to organize your research.
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((c) => {
            const isExpanded = expandedId === c.id
            const isEditing = editingId === c.id

            return (
              <div key={c.id} className="rounded-lg border bg-card overflow-hidden">
                {/* Header */}
                <div className="p-3 flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => toggleExpand(c.id)}
                  >
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdate(c.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <div className="flex gap-0.5">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditColor(color)}
                              className={`h-4 w-4 rounded-full border ${
                                editColor === color ? 'border-foreground' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleUpdate(c.id)}>
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.description && (
                          <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Item counts */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {Object.entries(c.item_counts || {}).map(([type, count]) => {
                        const config = ENTITY_LABELS[type]
                        if (!config) return null
                        const Icon = config.icon
                        return (
                          <span key={type} className="flex items-center gap-0.5" title={config.label}>
                            <Icon className="h-3 w-3" />
                            {count}
                          </span>
                        )
                      })}
                      {c.total_items === 0 && <span>Empty</span>}
                    </div>

                    {!isEditing && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); startEdit(c) }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}

                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-3">
                    {loadingExpand ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
                    ) : !expandedData || expandedData.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No items in this collection yet. Use the collection picker on any item to add it.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(expandedData.entities).map(([type, items]) => {
                          const config = ENTITY_LABELS[type]
                          if (!config || items.length === 0) return null
                          const Icon = config.icon

                          return (
                            <div key={type}>
                              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                                <Icon className="h-3.5 w-3.5" />
                                {config.label} ({items.length})
                              </h4>
                              <div className="space-y-1">
                                {items.map((item) => (
                                  <div
                                    key={item.id as string}
                                    className="rounded border bg-card px-3 py-2 text-sm flex items-center justify-between"
                                  >
                                    <div className="min-w-0">
                                      {type === 'asin_lookup' && (
                                        <span>
                                          <span className="font-mono text-xs">{String(item.asin || '')}</span>
                                          {item.title ? (
                                            <span className="text-muted-foreground ml-2 text-xs truncate">
                                              {String(item.title)}
                                            </span>
                                          ) : null}
                                        </span>
                                      )}
                                      {type === 'keyword_search' && (
                                        <span className="text-xs">&ldquo;{String(item.keyword || '')}&rdquo;</span>
                                      )}
                                      {type === 'asin_review' && (
                                        <span>
                                          <span className="font-mono text-xs">{String(item.asin || '')}</span>
                                          <span className="text-muted-foreground ml-2 text-xs">
                                            {String(item.total_reviews ?? 0)} reviews
                                          </span>
                                        </span>
                                      )}
                                      {type === 'market_intelligence' && (
                                        <span className="text-xs">{String(item.keyword || '')}</span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                                      {String(item.marketplace_domain || '')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
