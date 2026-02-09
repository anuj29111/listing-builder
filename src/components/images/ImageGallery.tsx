'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useImageStore } from '@/stores/image-store'
import { CheckCircle2, XCircle, Trash2, Eye, Loader2, ImageIcon } from 'lucide-react'
import type { LbImageGeneration } from '@/types/database'

interface ImageGalleryProps {
  images: LbImageGeneration[]
  isLoading: boolean
  onSelect: (id: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onDelete: (id: string) => void
}

const statusColors: Record<string, string> = {
  preview: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export function ImageGallery({ images, isLoading, onSelect, onApprove, onReject, onDelete }: ImageGalleryProps) {
  const filter = useImageStore((s) => s.filter)
  const setFilter = useImageStore((s) => s.setFilter)

  const filteredImages = filter === 'all' ? images : images.filter((i) => i.status === filter)

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading images...</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Gallery ({filteredImages.length})</h3>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="preview">Preview</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No images yet</p>
          <p className="text-xs">Generate your first image using the prompt editor</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filteredImages.map((image) => (
            <div
              key={image.id}
              className="group relative rounded-lg border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => onSelect(image.id)}
            >
              {/* Image */}
              <div className="aspect-square bg-muted relative">
                {image.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.preview_url}
                    alt={image.prompt.slice(0, 50)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSelect(image.id) }}>
                    <Eye className="h-3 w-3 mr-1" /> View
                  </Button>
                </div>
              </div>

              {/* Info bar */}
              <div className="p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-[10px] ${statusColors[image.status]}`}>
                    {image.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground uppercase">{image.provider}</span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{image.prompt.slice(0, 60)}</p>

                {/* Actions */}
                {image.status === 'preview' && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] flex-1 text-green-600" onClick={(e) => { e.stopPropagation(); onApprove(image.id) }}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] flex-1 text-red-600" onClick={(e) => { e.stopPropagation(); onReject(image.id) }}>
                      <XCircle className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {image.status !== 'preview' && (
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground" onClick={(e) => { e.stopPropagation(); onDelete(image.id) }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
