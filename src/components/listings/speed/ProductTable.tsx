'use client'

import { useState } from 'react'
import { useBatchStore, type BatchProductEntry } from '@/stores/batch-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Plus, Copy, Trash2, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'

export function ProductTable() {
  const products = useBatchStore((s) => s.products)
  const brand = useBatchStore((s) => s.brand)
  const addProduct = useBatchStore((s) => s.addProduct)
  const removeProduct = useBatchStore((s) => s.removeProduct)
  const updateProduct = useBatchStore((s) => s.updateProduct)
  const duplicateProduct = useBatchStore((s) => s.duplicateProduct)

  const [attrDialogProduct, setAttrDialogProduct] = useState<BatchProductEntry | null>(null)
  const [attrKey, setAttrKey] = useState('')
  const [attrValue, setAttrValue] = useState('')

  const handleAddProduct = () => {
    if (products.length >= 20) {
      toast.error('Maximum 20 products per batch')
      return
    }
    addProduct()
  }

  const handleDuplicate = (id: string) => {
    if (products.length >= 20) {
      toast.error('Maximum 20 products per batch')
      return
    }
    duplicateProduct(id)
  }

  const attrCount = (p: BatchProductEntry) =>
    Object.keys(p.attributes).filter((k) => k && p.attributes[k]).length

  const handleAddAttribute = () => {
    if (!attrDialogProduct || !attrKey.trim()) return
    const newAttrs = { ...attrDialogProduct.attributes, [attrKey.trim()]: attrValue.trim() }
    updateProduct(attrDialogProduct.id, { attributes: newAttrs })
    setAttrDialogProduct({ ...attrDialogProduct, attributes: newAttrs })
    setAttrKey('')
    setAttrValue('')
  }

  const handleRemoveAttribute = (key: string) => {
    if (!attrDialogProduct) return
    const newAttrs = { ...attrDialogProduct.attributes }
    delete newAttrs[key]
    updateProduct(attrDialogProduct.id, { attributes: newAttrs })
    setAttrDialogProduct({ ...attrDialogProduct, attributes: newAttrs })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Add Products</h2>
          <p className="text-sm text-muted-foreground">
            Add products to generate listings for. All products will use the same category research.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{products.length}/20 products</Badge>
          <Badge variant="outline">Brand: {brand}</Badge>
          <Button onClick={handleAddProduct} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground mb-3">No products added yet</p>
          <Button onClick={handleAddProduct} variant="outline" className="gap-1">
            <Plus className="h-4 w-4" />
            Add First Product
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium w-8">#</th>
                <th className="text-left p-3 font-medium">Product Name *</th>
                <th className="text-left p-3 font-medium w-32">ASIN</th>
                <th className="text-left p-3 font-medium w-40">Product Type</th>
                <th className="text-left p-3 font-medium w-24">Attributes</th>
                <th className="text-left p-3 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={product.id} className="border-t">
                  <td className="p-3 text-muted-foreground">{index + 1}</td>
                  <td className="p-3">
                    <Input
                      value={product.product_name}
                      onChange={(e) =>
                        updateProduct(product.id, { product_name: e.target.value })
                      }
                      placeholder="e.g., Chalk Markers 40 Pack"
                      className="h-8"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      value={product.asin || ''}
                      onChange={(e) =>
                        updateProduct(product.id, { asin: e.target.value })
                      }
                      placeholder="B0XXXXXX"
                      className="h-8"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      value={product.product_type_name || ''}
                      onChange={(e) =>
                        updateProduct(product.id, { product_type_name: e.target.value })
                      }
                      placeholder="Type name"
                      className="h-8"
                    />
                  </td>
                  <td className="p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-8"
                      onClick={() => {
                        setAttrDialogProduct(product)
                        setAttrKey('')
                        setAttrValue('')
                      }}
                    >
                      <Settings2 className="h-3 w-3" />
                      {attrCount(product) > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {attrCount(product)}
                        </Badge>
                      ) : (
                        'Edit'
                      )}
                    </Button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDuplicate(product.id)}
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeProduct(product.id)}
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Attributes Dialog */}
      <Dialog
        open={!!attrDialogProduct}
        onOpenChange={(open) => !open && setAttrDialogProduct(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Attributes: {attrDialogProduct?.product_name || 'Product'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing attributes */}
            {attrDialogProduct &&
              Object.entries(attrDialogProduct.attributes)
                .filter(([k, v]) => k && v)
                .map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {key}
                    </Badge>
                    <span className="text-sm flex-1">{value}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRemoveAttribute(key)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

            {/* Add new attribute */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Key</Label>
                <Input
                  value={attrKey}
                  onChange={(e) => setAttrKey(e.target.value)}
                  placeholder="e.g., Color Count"
                  className="h-8"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  value={attrValue}
                  onChange={(e) => setAttrValue(e.target.value)}
                  placeholder="e.g., 40"
                  className="h-8"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddAttribute()}
                />
              </div>
              <Button
                size="sm"
                className="h-8"
                onClick={handleAddAttribute}
                disabled={!attrKey.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Done
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
