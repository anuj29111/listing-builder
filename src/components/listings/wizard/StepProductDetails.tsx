'use client'

import { useListingStore } from '@/stores/listing-store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, MapPin, Tag } from 'lucide-react'
import type { LbCategory } from '@/types/database'

interface StepProductDetailsProps {
  categories: LbCategory[]
}

export function StepProductDetails({ categories }: StepProductDetailsProps) {
  const productName = useListingStore((s) => s.productName)
  const asin = useListingStore((s) => s.asin)
  const brand = useListingStore((s) => s.brand)
  const attributes = useListingStore((s) => s.attributes)
  const productTypeName = useListingStore((s) => s.productTypeName)
  const categoryId = useListingStore((s) => s.categoryId)
  const categoryName = useListingStore((s) => s.categoryName)
  const countryName = useListingStore((s) => s.countryName)
  const setProductDetails = useListingStore((s) => s.setProductDetails)
  const addAttribute = useListingStore((s) => s.addAttribute)
  const removeAttribute = useListingStore((s) => s.removeAttribute)
  const updateAttribute = useListingStore((s) => s.updateAttribute)

  const selectedCategory = categories.find((c) => c.id === categoryId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Product Details</h2>
        <p className="text-sm text-muted-foreground">
          Enter the product information for your listing
        </p>
      </div>

      {/* Context Badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1">
          <Tag className="h-3 w-3" />
          {categoryName || 'No category'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <MapPin className="h-3 w-3" />
          {countryName || 'No country'}
        </Badge>
        {selectedCategory && (
          <Badge variant="secondary">{selectedCategory.brand}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Product Name */}
        <div className="space-y-2">
          <Label htmlFor="productName">
            Product Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="productName"
            value={productName}
            onChange={(e) => setProductDetails({ productName: e.target.value })}
            placeholder="e.g., Chalk Markers Fine Tip 40-Pack"
          />
          {productName.length > 0 && productName.trim().length < 3 && (
            <p className="text-xs text-red-500">Must be at least 3 characters</p>
          )}
        </div>

        {/* ASIN */}
        <div className="space-y-2">
          <Label htmlFor="asin">ASIN (Optional)</Label>
          <Input
            id="asin"
            value={asin}
            onChange={(e) => setProductDetails({ asin: e.target.value })}
            placeholder="B0XXXXXXXXX"
          />
        </div>

        {/* Brand (auto-filled) */}
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            value={brand}
            onChange={(e) => setProductDetails({ brand: e.target.value })}
            placeholder="Brand name"
          />
        </div>

        {/* Product Type Name */}
        <div className="space-y-2">
          <Label htmlFor="productType">Product Type Name (Optional)</Label>
          <Input
            id="productType"
            value={productTypeName}
            onChange={(e) =>
              setProductDetails({ productTypeName: e.target.value })
            }
            placeholder="e.g., Fine Tip 40-Pack Neon Colors"
          />
          <p className="text-xs text-muted-foreground">
            Creates a reusable product type for future listings
          </p>
        </div>
      </div>

      {/* Attributes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Key Attributes</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add product attributes (e.g., Color Count: 40, Tip Type: Fine + Chisel)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addAttribute}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="space-y-2">
          {attributes.map((attr, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={attr.key}
                onChange={(e) =>
                  updateAttribute(index, e.target.value, attr.value)
                }
                placeholder="Attribute name"
                className="flex-1"
              />
              <Input
                value={attr.value}
                onChange={(e) =>
                  updateAttribute(index, attr.key, e.target.value)
                }
                placeholder="Value"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeAttribute(index)}
                disabled={attributes.length <= 1}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
