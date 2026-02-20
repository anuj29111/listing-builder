'use client'

import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2, Camera, Sparkles } from 'lucide-react'
import { useWorkshopStore } from '@/stores/workshop-store'

export function WorkshopProductPhotos() {
  const {
    workshopId,
    productPhotos,
    productPhotoDescriptions,
    isUploadingPhotos,
    isAnalyzingPhotos,
    addProductPhotos,
    removeProductPhoto,
    setIsUploadingPhotos,
    setIsAnalyzingPhotos,
    setProductPhotoDescriptions,
  } = useWorkshopStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

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
    [workshopId]
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    await uploadFiles(files)
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadFiles = async (files: File[]) => {
    if (!workshopId) return
    setIsUploadingPhotos(true)

    try {
      const formData = new FormData()
      formData.append('workshop_id', workshopId)
      for (const file of files) {
        formData.append('photos', file)
      }

      const res = await fetch('/api/images/workshop/upload-photos', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { data } = await res.json()
      addProductPhotos(data.photo_urls)
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setIsUploadingPhotos(false)
    }
  }

  const handleAnalyze = async () => {
    if (!workshopId || productPhotos.length === 0) return
    setIsAnalyzingPhotos(true)

    try {
      const res = await fetch('/api/images/workshop/analyze-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: workshopId,
          photo_urls: productPhotos,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Analysis failed')
      }

      const { data } = await res.json()
      setProductPhotoDescriptions(data.descriptions)
    } catch (err) {
      console.error('Analysis error:', err)
    } finally {
      setIsAnalyzingPhotos(false)
    }
  }

  const handleRemovePhoto = async (url: string) => {
    removeProductPhoto(url)
    // Update DB
    if (workshopId) {
      const updatedPhotos = productPhotos.filter((p) => p !== url)
      await fetch(`/api/images/workshop/${workshopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_photos: updatedPhotos }),
      })
    }
  }

  const hasDescriptions = productPhotoDescriptions && Object.keys(productPhotoDescriptions).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Product Photos
            <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload actual product photos from your supplier, packaging, or labels so AI knows what your product looks like.
          </p>
        </div>
        {productPhotos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={isAnalyzingPhotos}
          >
            {isAnalyzingPhotos ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            {hasDescriptions ? 'Re-analyze' : 'Analyze Photos'}
          </Button>
        )}
      </div>

      {/* Drop Zone */}
      {productPhotos.length < 10 && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
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
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Drag & drop product photos here, or click to browse
              </span>
              <span className="text-xs text-muted-foreground">
                3-10 photos recommended (supplier shots, packaging, labels)
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
                  onClick={() => handleRemovePhoto(url)}
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
            Photo Analysis Complete ({Object.keys(productPhotoDescriptions).length} photos analyzed)
          </p>
          <div className="space-y-1.5">
            {Object.entries(productPhotoDescriptions).slice(0, 3).map(([url, desc], i) => (
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
  )
}
