'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, FolderOpen, ScanSearch, Search, MessageSquare, BarChart3, ChevronDown, ChevronUp, Star, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
                              <div className="space-y-1 divide-y rounded border bg-card overflow-hidden">
                                {items.map((item) => (
                                  <div key={item.id as string}>
                                    {type === 'asin_lookup' && (
                                      <AsinLookupRow item={item} />
                                    )}
                                    {type === 'keyword_search' && (
                                      <KeywordSearchRow item={item} />
                                    )}
                                    {type === 'asin_review' && (
                                      <ReviewRow item={item} />
                                    )}
                                    {type === 'market_intelligence' && (
                                      <MarketIntelRow item={item} />
                                    )}
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

// Rich row for ASIN Lookup items (same layout as ASIN Lookup history)
function AsinLookupRow({ item }: { item: Record<string, unknown> }) {
  const firstImage = (item.images as string[] | undefined)?.[0]
  const bsr = (item.sales_rank as Array<{ rank: number }> | undefined)?.[0]
  const brand = item.brand ? String(item.brand) : null
  const amazonChoice = Boolean(item.amazon_choice)
  const salesVolume = item.sales_volume ? String(item.sales_volume) : null

  return (
    <div className="p-3 flex items-center gap-3">
      {firstImage && (
        <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
          <img src={firstImage} alt="" className="w-full h-full object-contain" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {String(item.title || item.asin || '')}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-mono">{String(item.asin || '')}</span>
          <span>{String(item.marketplace_domain || '')}</span>
          {brand && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {brand}
            </Badge>
          )}
          {amazonChoice && (
            <Badge className="text-[10px] px-1 py-0 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
              Choice
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-sm">
        {salesVolume && (
          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium hidden sm:inline">
            {salesVolume}
          </span>
        )}
        {item.price != null && (
          <span className="font-medium">
            {String(item.currency || '$')}
            {Number(item.price).toFixed(2)}
          </span>
        )}
        {item.rating != null && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {String(item.rating)}
            {item.reviews_count != null && (
              <span className="text-[10px]">({Number(item.reviews_count).toLocaleString()})</span>
            )}
          </span>
        )}
        {bsr && (
          <span className="flex items-center gap-0.5 text-muted-foreground hidden sm:flex">
            <TrendingUp className="h-3 w-3" />#{bsr.rank?.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

// Row for keyword search items
function KeywordSearchRow({ item }: { item: Record<string, unknown> }) {
  return (
    <div className="p-3 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">&ldquo;{String(item.keyword || '')}&rdquo;</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{String(item.marketplace_domain || '')}</span>
          {item.total_results_count != null && (
            <span>{Number(item.total_results_count).toLocaleString()} results</span>
          )}
          {item.pages_fetched != null && (
            <span>{String(item.pages_fetched)} pages fetched</span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatTimeAgo(String(item.updated_at || ''))}
      </span>
    </div>
  )
}

// Row for review items
function ReviewRow({ item }: { item: Record<string, unknown> }) {
  const sortBy = item.sort_by ? String(item.sort_by) : null

  return (
    <div className="p-3 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span className="font-mono">{String(item.asin || '')}</span>
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{String(item.marketplace_domain || '')}</span>
          {item.total_reviews != null && (
            <span>{Number(item.total_reviews).toLocaleString()} reviews</span>
          )}
          {item.overall_rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {String(item.overall_rating)}
            </span>
          )}
          {sortBy && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {sortBy}
            </Badge>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatTimeAgo(String(item.updated_at || ''))}
      </span>
    </div>
  )
}

// Row for market intelligence items
function MarketIntelRow({ item }: { item: Record<string, unknown> }) {
  const status = item.status ? String(item.status) : ''
  const topAsins = item.top_asins as string[] | null
  const statusColor = status === 'completed'
    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    : status === 'failed'
    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'

  return (
    <div className="p-3 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{String(item.keyword || '')}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{String(item.marketplace_domain || '')}</span>
          {topAsins && topAsins.length > 0 && (
            <span>{topAsins.length} ASINs</span>
          )}
          {status && (
            <Badge className={`text-[10px] px-1 py-0 ${statusColor}`}>
              {status}
            </Badge>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatTimeAgo(String(item.created_at || ''))}
      </span>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
