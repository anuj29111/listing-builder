'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Upload, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { LbProduct } from '@/types'

interface ProductMapperProps {
  initialProducts: LbProduct[]
  categories: string[]
}

interface ProductFormData {
  asin: string
  product_name: string
  parent_name: string
  parent_asin: string
  category: string
  brand: string
}

const emptyForm: ProductFormData = {
  asin: '',
  product_name: '',
  parent_name: '',
  parent_asin: '',
  category: '',
  brand: '',
}

export function ProductMapper({ initialProducts, categories: initialCategories }: ProductMapperProps) {
  const [products, setProducts] = useState<LbProduct[]>(initialProducts)
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Edit/Add dialog
  const [editProduct, setEditProduct] = useState<LbProduct | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Import dialog
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchProducts = useCallback(async (searchVal: string, categoryVal: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchVal) params.set('search', searchVal)
      if (categoryVal) params.set('category', categoryVal)
      const res = await fetch(`/api/products?${params.toString()}`)
      const json = await res.json()
      if (json.data) {
        setProducts(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchProducts(search, selectedCategory)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, selectedCategory, fetchProducts])

  // --- Edit/Add ---
  function openAdd() {
    setFormData(emptyForm)
    setAddMode(true)
    setEditProduct(null)
  }

  function openEdit(p: LbProduct) {
    setFormData({
      asin: p.asin,
      product_name: p.product_name,
      parent_name: p.parent_name || '',
      parent_asin: p.parent_asin || '',
      category: p.category,
      brand: p.brand || '',
    })
    setEditProduct(p)
    setAddMode(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (addMode) {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || 'Failed to add product')
          return
        }
      } else if (editProduct) {
        const res = await fetch(`/api/products/${editProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || 'Failed to update product')
          return
        }
      }
      setEditProduct(null)
      setAddMode(false)
      fetchProducts(search, selectedCategory)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id))
    }
  }

  // --- Import ---
  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) {
        setImportResult({ imported: 0, skipped: 0, errors: [json.error || 'Import failed'] })
        return
      }
      setImportResult({ imported: json.imported, skipped: json.skipped, errors: json.errors || [] })
      // Refresh list and categories
      fetchProducts(search, selectedCategory)
      // Refresh categories
      const catRes = await fetch('/api/products?')
      const catJson = await catRes.json()
      if (catJson.data) {
        const cats = Array.from(new Set((catJson.data as LbProduct[]).map((r) => r.category)))
        setCategories(cats as string[])
      }
    } finally {
      setImporting(false)
    }
  }

  const dialogOpen = addMode || editProduct !== null

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Product Mapper</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reference database of all products across brands and categories
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportOpen(true); setImportFile(null); setImportResult(null) }}>
            <Upload className="h-4 w-4 mr-2" />
            Import XLSX
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search ASIN or product name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="ml-auto">
          {products.length} products
        </Badge>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">ASIN</th>
              <th className="text-left p-3 font-medium">Product Name</th>
              <th className="text-left p-3 font-medium">Parent Name</th>
              <th className="text-left p-3 font-medium">Parent ASIN</th>
              <th className="text-left p-3 font-medium">Category</th>
              <th className="text-left p-3 font-medium">Brand</th>
              <th className="text-right p-3 font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  {loading ? 'Loading...' : 'No products found. Import an XLSX file to get started.'}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{p.asin}</td>
                  <td className="p-3">{p.product_name}</td>
                  <td className="p-3 text-muted-foreground">{p.parent_name || '—'}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{p.parent_asin || '—'}</td>
                  <td className="p-3">
                    <Badge variant="outline">{p.category}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{p.brand || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditProduct(null); setAddMode(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{addMode ? 'Add Product' : 'Edit Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ASIN *</Label>
                <Input
                  value={formData.asin}
                  onChange={(e) => setFormData({ ...formData, asin: e.target.value })}
                  placeholder="B07QZW54NP"
                />
              </div>
              <div>
                <Label>Category *</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Chalk Markers"
                />
              </div>
            </div>
            <div>
              <Label>Product Name *</Label>
              <Input
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="40 Chalk 6mm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Parent Name</Label>
                <Input
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                  placeholder="40 Chalk"
                />
              </div>
              <div>
                <Label>Parent ASIN</Label>
                <Input
                  value={formData.parent_asin}
                  onChange={(e) => setFormData({ ...formData, parent_asin: e.target.value })}
                  placeholder="B07QZW54NP"
                />
              </div>
            </div>
            <div>
              <Label>Brand</Label>
              <Input
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="Chalkola"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditProduct(null); setAddMode(false) }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.asin || !formData.product_name || !formData.category}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {addMode ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload an XLSX or CSV file with columns: <strong>ASIN</strong>, <strong>Product Name</strong>, <strong>Category</strong> (required), and optionally Parent Name, Parent ASIN, Brand.
            </p>
            <p className="text-sm text-muted-foreground">
              Existing products (by ASIN) will be updated. New ASINs will be added.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
            {importResult && (
              <div className={`rounded-lg p-3 text-sm ${importResult.errors.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                <p className="font-medium">
                  Imported: {importResult.imported} | Skipped: {importResult.skipped}
                </p>
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-red-600 mt-1">{err}</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {!importResult && (
              <Button onClick={handleImport} disabled={!importFile || importing}>
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
