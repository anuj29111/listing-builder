'use client'

import { useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useImageStore } from '@/stores/image-store'
import { PromptEditor } from './PromptEditor'
import { GenerationControls } from './GenerationControls'
import { ImageGallery } from './ImageGallery'
import { ImagePreview } from './ImagePreview'
import { Button } from '@/components/ui/button'
import { Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbListing } from '@/types/database'

interface ImageBuilderClientProps {
  listings: Array<Pick<LbListing, 'id' | 'title' | 'generation_context'>>
}

export function ImageBuilderClient({ listings }: ImageBuilderClientProps) {
  const images = useImageStore((s) => s.images)
  const isLoading = useImageStore((s) => s.isLoading)
  const selectedImageId = useImageStore((s) => s.selectedImageId)
  const setImages = useImageStore((s) => s.setImages)
  const setIsLoading = useImageStore((s) => s.setIsLoading)
  const selectImage = useImageStore((s) => s.selectImage)
  const addImage = useImageStore((s) => s.addImage)
  const updateImage = useImageStore((s) => s.updateImage)
  const removeImage = useImageStore((s) => s.removeImage)

  const fetchImages = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/images')
      const json = await res.json()
      if (json.data) {
        setImages(json.data)
      }
    } catch {
      toast.error('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }, [setImages, setIsLoading])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  const handleGenerated = useCallback((image: typeof images[number]) => {
    addImage(image)
    toast.success('Image generated!')
  }, [addImage])

  const handleApprove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      updateImage(id, json.data.image)
      toast.success('Image approved! HD version generated.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve')
    }
  }, [updateImage])

  const handleReject = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      updateImage(id, json.data.image)
      toast.success('Image rejected')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject')
    }
  }, [updateImage])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      removeImage(id)
      toast.success('Image deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }, [removeImage])

  const selectedImage = images.find((i) => i.id === selectedImageId) || null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Image Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate product images with DALL-E 3 and Gemini AI
          </p>
        </div>
        <Link href="/images/workshop">
          <Button variant="outline">
            <Layers className="mr-2 h-4 w-4" />
            Main Image Workshop
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel: Prompt + Controls */}
        <div className="lg:col-span-1 space-y-4">
          <PromptEditor listings={listings} />
          <GenerationControls onGenerated={handleGenerated} />
        </div>

        {/* Right panel: Gallery */}
        <div className="lg:col-span-2">
          <ImageGallery
            images={images}
            isLoading={isLoading}
            onSelect={selectImage}
            onApprove={handleApprove}
            onReject={handleReject}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Preview modal */}
      {selectedImage && (
        <ImagePreview
          image={selectedImage}
          onClose={() => selectImage(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
          onRefined={(newImage) => {
            addImage(newImage)
            toast.success('Refined image generated!')
          }}
        />
      )}
    </div>
  )
}
