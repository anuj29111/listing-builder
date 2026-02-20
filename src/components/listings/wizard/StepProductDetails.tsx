'use client'

import { useListingStore } from '@/stores/listing-store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, MapPin, Tag, Info } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
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
  const optimizationMode = useListingStore((s) => s.optimizationMode)
  const existingListingText = useListingStore((s) => s.existingListingText)
  const setExistingListingText = useListingStore((s) => s.setExistingListingText)

  const selectedCategory = categories.find((c) => c.id === categoryId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Product Details</h2>
        <p className="text-sm text-muted-foreground">
          Enter the product information for your listing
        </p>
      </div>

      {/* Existing Listing Text (shown for optimize/based_on modes, auto-filled from scrape) */}
      {(optimizationMode === 'optimize_existing' || optimizationMode === 'based_on_existing') && existingListingText && (
        <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
          <div>
            <h3 className="text-sm font-semibold mb-1">
              {optimizationMode === 'optimize_existing'
                ? 'Current Listing to Optimize'
                : 'Reference Product Listing'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {optimizationMode === 'optimize_existing'
                ? 'This content was scraped from Amazon. Edit if needed. Claude will analyze it, score it, and generate optimized variations.'
                : 'This content was scraped from the reference product. Update the product details below to match YOUR new product — AI will adapt the listing accordingly.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="existingTitle">Existing Title</Label>
            <Textarea
              id="existingTitle"
              value={existingListingText.title}
              onChange={(e) =>
                setExistingListingText({
                  ...existingListingText,
                  title: e.target.value,
                })
              }
              placeholder="Paste your current Amazon title here..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Existing Bullet Points</Label>
            {existingListingText.bullets.map((bullet, i) => (
              <Textarea
                key={i}
                value={bullet}
                onChange={(e) => {
                  const newBullets = [...existingListingText.bullets]
                  newBullets[i] = e.target.value
                  setExistingListingText({
                    ...existingListingText,
                    bullets: newBullets,
                  })
                }}
                placeholder={`Bullet point ${i + 1}...`}
                rows={2}
              />
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="existingDescription">Existing Description</Label>
            <Textarea
              id="existingDescription"
              value={existingListingText.description}
              onChange={(e) =>
                setExistingListingText({
                  ...existingListingText,
                  description: e.target.value,
                })
              }
              placeholder="Paste your current Amazon description here..."
              rows={4}
            />
          </div>
        </div>
      )}

      {/* Info banner for based_on_existing mode */}
      {optimizationMode === 'based_on_existing' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The fields below are pre-filled from the reference product. Update the <strong>product name</strong> and <strong>attributes</strong> to match your new product.
          </span>
        </div>
      )}

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
