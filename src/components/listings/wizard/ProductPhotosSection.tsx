'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2, Camera, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'
import { useListingStore } from '@/stores/listing-store'
import toast from 'react-hot-toast'

export function ProductPhotosSection() {
  const productPhotos = useListingStore((s) => s.productPhotos)
  const productPhotoDescriptions = useListingStore((s) => s.productPhotoDescriptions)
  const isUploadingPhotos = useListingStore((s) => s.isUploadingPhotos)
  const isAnalyzingPhotos = useListingStore((s) => s.isAnalyzingPhotos)
  const productName = useListingStore((s) => s.productName)
  const brand = useListingStore((s) => s.brand)
  const scrapedData = useListingStore((s) => s.scrapedData)
  const addProductPhotos = useListingStore((s) => s.addProductPhotos)
  const removeProductPhoto = useListingStore((s) => s.removeProductPhoto)
  const setIsUploadingPhotos = useListingStore((s) => s.setIsUploadingPhotos)
  const setIsAnalyzingPhotos = useListingStore((s) => s.setIsAnalyzingPhotos)
  const setProductPhotoDescriptions = useListingStore((s) => s.setProductPhotoDescriptions)

  const [isOpen, setIsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoAnalyzedRef = useRef(false)

  // Auto-expand when photos exist (e.g. from scraped data)
  useEffect(() => {
    if (productPhotos.length > 0) setIsOpen(true)
  }, [productPhotos.length])

  // Auto-analyze scraped images once
  useEffect(() => {
    if (
      scrapedData &&
      productPhotos.length > 0 &&
      !productPhotoDescriptions &&
      !isAnalyzingPhotos &&
      !autoAnalyzedRef.current &&
      productName
    ) {
      autoAnalyzedRef.current = true
      analyzePhotos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrapedData, productPhotos.length, productPhotoDescriptions, productName])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      )
      if (files.length === 0) return
      await uploadFiles(files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    await uploadFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadFiles = async (files: File[]) => {
    setIsUploadingPhotos(true)
    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('photos', file)
      }

      const res = await fetch('/api/listings/upload-photos', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { data } = await res.json()
      addProductPhotos(data.photo_urls)
      toast.success(`${data.photo_urls.length} photo(s) uploaded`)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploadingPhotos(false)
    }
  }

  const analyzePhotos = async () => {
    if (productPhotos.length === 0 || !productName) return
    setIsAnalyzingPhotos(true)

    try {
      const res = await fetch('/api/listings/analyze-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_urls: productPhotos,
          product_name: productName,
          brand: brand || '',
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }

      const { data } = await res.json()
      setProductPhotoDescriptions(data.descriptions)
      toast.success('Photos analyzed successfully')
    } catch (err) {
      console.error('Analysis error:', err)
      toast.error(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzingPhotos(false)
    }
  }

  const hasDescriptions = productPhotoDescriptions && Object.keys(productPhotoDescriptions).length > 0

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Product Photos</span>
          <span className="text-xs text-muted-foreground">(Optional)</span>
          {productPhotos.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {productPhotos.length} photo{productPhotos.length !== 1 ? 's' : ''}
              {hasDescriptions ? ' - Analyzed' : ''}
            </span>
          )}
          {isAnalyzingPhotos && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload product photos so AI can reference actual product appearance, colors, and features in the listing.
            {scrapedData ? ' Scraped Amazon images are shown below.' : ''}
          </p>

          {/* Analyze button */}
          {productPhotos.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={analyzePhotos}
                disabled={isAnalyzingPhotos || !productName}
              >
                {isAnalyzingPhotos ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                {hasDescriptions ? 'Re-analyze' : 'Analyze Photos'}
              </Button>
            </div>
          )}

          {/* Drop Zone */}
          {productPhotos.length < 10 && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              {isUploadingPhotos ? (
                <div className="flex flex-col items-center gap-1">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Drag & drop photos here, or click to browse
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Photo Grid */}
          {productPhotos.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {productPhotos.map((url, i) => {
                const desc = productPhotoDescriptions?.[url]
                return (
                  <div key={i} className="relative group rounded-lg overflow-hidden border bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Product photo ${i + 1}`}
                      className="w-full aspect-square object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeProductPhoto(url)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {desc && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                        <p className="text-[9px] text-white line-clamp-2">{desc.photo_type}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Analysis Results Summary */}
          {hasDescriptions && (
            <div className="border rounded-lg p-3 bg-muted/20">
              <p className="text-xs font-medium text-foreground/80 mb-2">
                Photo Analysis Complete ({Object.keys(productPhotoDescriptions).length} photos)
              </p>
              <div className="space-y-1.5">
                {Object.entries(productPhotoDescriptions).slice(0, 3).map(([, desc], i) => (
                  <p key={i} className="text-[11px] text-muted-foreground line-clamp-1">
                    <span className="font-medium">{desc.photo_type}:</span> {desc.description}
                  </p>
                ))}
                {Object.keys(productPhotoDescriptions).length > 3 && (
                  <p className="text-[11px] text-muted-foreground">
                    +{Object.keys(productPhotoDescriptions).length - 3} more...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
