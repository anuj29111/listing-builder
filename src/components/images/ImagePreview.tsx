'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CheckCircle2, XCircle, Download, Trash2, X, Send, Loader2, MessageSquare } from 'lucide-react'
import type { LbImageGeneration } from '@/types/database'
import { IMAGE_PROVIDER_LABELS } from '@/lib/constants'
import toast from 'react-hot-toast'

interface ImagePreviewProps {
  image: LbImageGeneration
  onClose: () => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onDelete: (id: string) => void
  onRefined: (newImage: LbImageGeneration) => void
}

export function ImagePreview({ image, onClose, onApprove, onReject, onDelete, onRefined }: ImagePreviewProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isRefining, setIsRefining] = useState(false)

  const handleRefine = async () => {
    if (!chatInput.trim()) return
    setIsRefining(true)
    try {
      const res = await fetch(`/api/images/${image.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onRefined(json.data.new_image)
      setChatInput('')
      setChatOpen(false)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refinement failed')
    } finally {
      setIsRefining(false)
    }
  }

  const handleDownload = () => {
    const url = image.full_url || image.preview_url
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `image-${image.id.slice(0, 8)}.png`
    a.target = '_blank'
    a.click()
  }

  const displayUrl = image.full_url || image.preview_url

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{image.status}</Badge>
            <span className="text-xs text-muted-foreground">{IMAGE_PROVIDER_LABELS[image.provider] || image.provider}</span>
            <span className="text-xs text-muted-foreground">{image.cost_cents}c</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Image */}
        <div className="p-4">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt="Generated image"
              className="w-full rounded-lg"
            />
          ) : (
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
              No image available
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">Prompt:</p>
          <p className="text-sm">{image.prompt}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t">
          {image.status === 'preview' && (
            <>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(image.id)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve (HD)
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(image.id)}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setChatOpen(!chatOpen)}>
            <MessageSquare className="h-4 w-4 mr-1" /> Refine
          </Button>
          {displayUrl && (
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" /> Download
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-red-600 ml-auto" onClick={() => { onDelete(image.id); onClose() }}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>

        {/* Chat refinement */}
        {chatOpen && (
          <div className="px-4 pb-4">
            <div className="flex gap-2">
              <Input
                placeholder="Describe what to change (e.g., 'make background darker')"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleRefine()}
                disabled={isRefining}
              />
              <Button size="sm" onClick={handleRefine} disabled={isRefining || !chatInput.trim()}>
                {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This will generate a new image with your refinements applied to the prompt
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
