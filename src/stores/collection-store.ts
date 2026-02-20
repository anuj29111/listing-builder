import { create } from 'zustand'
import type { LbCollection, ResearchEntityType } from '@/types'

interface CollectionWithCounts extends LbCollection {
  item_counts: Record<string, number>
  total_items: number
}

interface CollectionState {
  collections: CollectionWithCounts[]
  memberships: Record<string, string[]> // entityId → collectionIds
  allTags: string[]
  loading: boolean

  // Filter state
  filterTags: string[]
  filterCollectionId: string | null

  // Actions
  fetchCollections: () => Promise<void>
  fetchMemberships: (entityIds: string[]) => Promise<void>
  fetchAllTags: () => Promise<void>
  addToCollection: (collectionId: string, entityType: ResearchEntityType, entityId: string) => Promise<void>
  removeFromCollection: (collectionId: string, entityType: ResearchEntityType, entityId: string) => Promise<void>
  createCollection: (name: string, description?: string, color?: string) => Promise<LbCollection | null>
  deleteCollection: (id: string) => Promise<void>
  updateCollection: (id: string, updates: { name?: string; description?: string; color?: string }) => Promise<void>
  setFilterTags: (tags: string[]) => void
  setFilterCollectionId: (id: string | null) => void
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collections: [],
  memberships: {},
  allTags: [],
  loading: false,
  filterTags: [],
  filterCollectionId: null,

  fetchCollections: async () => {
    try {
      const res = await fetch('/api/collections')
      const json = await res.json()
      if (json.data) {
        set({ collections: json.data })
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err)
    }
  },

  fetchMemberships: async (entityIds: string[]) => {
    if (!entityIds.length) return
    try {
      // Fetch collection items for given entity IDs
      const res = await fetch(`/api/collections?entity_ids=${entityIds.join(',')}`)
      const json = await res.json()
      // Build memberships map from collections data
      const memberships: Record<string, string[]> = { ...get().memberships }
      // Reset for given IDs
      for (const id of entityIds) {
        memberships[id] = []
      }
      // We need to fetch from a different endpoint — use the collections data we already have
      // and fetch items per collection. For efficiency, we query collection_items directly.
      // This will be handled by the CollectionPicker component which fetches per-entity.
      set({ memberships })
    } catch (err) {
      console.error('Failed to fetch memberships:', err)
    }
  },

  fetchAllTags: async () => {
    try {
      const res = await fetch('/api/tags')
      const json = await res.json()
      if (json.data) {
        set({ allTags: json.data })
      }
    } catch (err) {
      console.error('Failed to fetch tags:', err)
    }
  },

  addToCollection: async (collectionId, entityType, entityId) => {
    try {
      await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ entity_type: entityType, entity_id: entityId }] }),
      })
      // Update memberships optimistically
      const memberships = { ...get().memberships }
      if (!memberships[entityId]) memberships[entityId] = []
      if (!memberships[entityId].includes(collectionId)) {
        memberships[entityId] = [...memberships[entityId], collectionId]
      }
      set({ memberships })
      // Refresh collection counts
      get().fetchCollections()
    } catch (err) {
      console.error('Failed to add to collection:', err)
    }
  },

  removeFromCollection: async (collectionId, entityType, entityId) => {
    try {
      await fetch(`/api/collections/${collectionId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ entity_type: entityType, entity_id: entityId }] }),
      })
      // Update memberships optimistically
      const memberships = { ...get().memberships }
      if (memberships[entityId]) {
        memberships[entityId] = memberships[entityId].filter((id) => id !== collectionId)
      }
      set({ memberships })
      get().fetchCollections()
    } catch (err) {
      console.error('Failed to remove from collection:', err)
    }
  },

  createCollection: async (name, description, color) => {
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, color }),
      })
      const json = await res.json()
      if (json.data) {
        set({ collections: [{ ...json.data, item_counts: {}, total_items: 0 }, ...get().collections] })
        return json.data
      }
      return null
    } catch (err) {
      console.error('Failed to create collection:', err)
      return null
    }
  },

  deleteCollection: async (id) => {
    try {
      await fetch(`/api/collections/${id}`, { method: 'DELETE' })
      set({ collections: get().collections.filter((c) => c.id !== id) })
      // Clean up memberships
      const memberships = { ...get().memberships }
      for (const entityId of Object.keys(memberships)) {
        memberships[entityId] = memberships[entityId].filter((cId) => cId !== id)
      }
      set({ memberships })
    } catch (err) {
      console.error('Failed to delete collection:', err)
    }
  },

  updateCollection: async (id, updates) => {
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (json.data) {
        set({
          collections: get().collections.map((c) =>
            c.id === id ? { ...c, ...json.data } : c
          ),
        })
      }
    } catch (err) {
      console.error('Failed to update collection:', err)
    }
  },

  setFilterTags: (tags) => set({ filterTags: tags }),
  setFilterCollectionId: (id) => set({ filterCollectionId: id }),
}))
