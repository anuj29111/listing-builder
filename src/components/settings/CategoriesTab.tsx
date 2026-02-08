'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { BRANDS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbCategory } from '@/types'

interface CategoriesTabProps {
  initialCategories: LbCategory[]
}

interface CategoryForm {
  name: string
  slug: string
  brand: string
  description: string
}

const emptyForm: CategoryForm = {
  name: '',
  slug: '',
  brand: '',
  description: '',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

export function CategoriesTab({ initialCategories }: CategoriesTabProps) {
  const [categories, setCategories] = useState<LbCategory[]>(initialCategories)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(cat: LbCategory) {
    setEditingId(cat.id)
    setForm({
      name: cat.name,
      slug: cat.slug,
      brand: cat.brand,
      description: cat.description ?? '',
    })
    setDialogOpen(true)
  }

  function handleNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: editingId ? prev.slug : slugify(value),
    }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.brand) {
      toast.error('Name and brand are required')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/categories/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim(),
            brand: form.brand,
            description: form.description.trim() || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to update')
        setCategories((prev) =>
          prev.map((c) => (c.id === editingId ? json.data : c))
        )
        toast.success('Category updated')
      } else {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim() || slugify(form.name.trim()),
            brand: form.brand,
            description: form.description.trim() || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to create')
        setCategories((prev) => [...prev, json.data])
        toast.success('Category created')
      }
      setDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/categories/${deleteId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to delete')
      }
      setCategories((prev) => prev.filter((c) => c.id !== deleteId))
      toast.success('Category deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const brandColors: Record<string, string> = {
    Chalkola: 'bg-blue-100 text-blue-800',
    Spedalon: 'bg-green-100 text-green-800',
    Funcils: 'bg-purple-100 text-purple-800',
    Other: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-semibold">Categories</h3>
          <p className="text-sm text-muted-foreground">
            Product categories used for research and listing generation.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No categories"
          description="Add your first product category to get started."
          action={{ label: 'Add Category', onClick: openAdd }}
          className="py-12"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">Name</th>
                <th className="text-left font-medium p-3">Slug</th>
                <th className="text-left font-medium p-3">Brand</th>
                <th className="text-left font-medium p-3">Created</th>
                <th className="text-right font-medium p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{cat.name}</td>
                  <td className="p-3 text-muted-foreground">{cat.slug}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        brandColors[cat.brand] || brandColors.Other
                      }`}
                    >
                      {cat.brand}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(cat.created_at)}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(cat)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(cat.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the category details.'
                : 'Create a new product category.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Chalk Markers"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder="e.g. chalk-markers"
              />
              <p className="text-xs text-muted-foreground">
                Auto-generated from name. Used as a URL-friendly identifier.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Select
                value={form.brand}
                onValueChange={(val) =>
                  setForm((prev) => ({ ...prev, brand: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Brief description of this category"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete Category"
        description="Are you sure you want to delete this category? This will also remove all associated research files and analysis. This action cannot be undone."
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
