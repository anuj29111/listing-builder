'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  SkipForward,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  FastForward,
} from 'lucide-react'
import { HF_MODELS, type HfModel, type HfPromptQueue } from '@/types/database'
import toast from 'react-hot-toast'

interface HfQueuePanelProps {
  listingId?: string | null
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  submitted: { label: 'Submitted', icon: CheckCircle2, color: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', icon: XCircle, color: 'bg-red-100 text-red-800' },
  skipped: { label: 'Skipped', icon: FastForward, color: 'bg-gray-100 text-gray-600' },
}

export function HfQueuePanel({ listingId }: HfQueuePanelProps) {
  const [items, setItems] = useState<HfPromptQueue[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterModel, setFilterModel] = useState<string>('all')

  // New prompt form
  const [showForm, setShowForm] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [newModel, setNewModel] = useState<HfModel>('nano-banana-pro')
  const [newAspectRatio, setNewAspectRatio] = useState('1:1')
  const [newResolution, setNewResolution] = useState('2k')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterModel !== 'all') params.set('model', filterModel)
      if (listingId) params.set('listing_id', listingId)
      params.set('limit', '50')

      const res = await fetch(`/api/images/queue?${params.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setItems(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [filterStatus, filterModel, listingId])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(fetchQueue, 15000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // Update aspect ratio and resolution when model changes
  useEffect(() => {
    const config = HF_MODELS[newModel]
    if (config) {
      setNewResolution(config.defaultResolution)
      if (!config.aspectRatios.includes(newAspectRatio)) {
        setNewAspectRatio(config.aspectRatios[0])
      }
    }
  }, [newModel, newAspectRatio])

  const handleAddPrompt = async () => {
    if (!newPrompt.trim() || newPrompt.trim().length < 5) {
      toast.error('Prompt must be at least 5 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/images/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt.trim(),
          model: newModel,
          settings: {
            aspect_ratio: newAspectRatio,
            resolution: newResolution,
          },
          listing_id: listingId || null,
        }),
      })

      if (res.ok) {
        toast.success('Prompt queued for Higgsfield')
        setNewPrompt('')
        setShowForm(false)
        fetchQueue()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Failed to queue prompt')
      }
    } catch {
      toast.error('Failed to queue prompt')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAction = async (id: string, action: 'retry' | 'skip' | 'delete') => {
    try {
      if (action === 'delete') {
        const res = await fetch(`/api/images/queue/${id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success('Removed from queue')
          fetchQueue()
        }
      } else {
        const res = await fetch(`/api/images/queue/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        if (res.ok) {
          toast.success(action === 'retry' ? 'Retrying...' : 'Skipped')
          fetchQueue()
        }
      }
    } catch {
      toast.error('Action failed')
    }
  }

  const modelConfig = HF_MODELS[newModel]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Higgsfield Queue</h2>
          <p className="text-sm text-muted-foreground">
            {total} item{total !== 1 ? 's' : ''} in queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchQueue}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Prompt
          </Button>
        </div>
      </div>

      {/* New Prompt Form */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <Textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Enter your image generation prompt..."
            className="min-h-[80px]"
          />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Model</Label>
              <Select value={newModel} onValueChange={(v) => setNewModel(v as HfModel)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HF_MODELS).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aspect Ratio</Label>
              <Select value={newAspectRatio} onValueChange={setNewAspectRatio}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelConfig?.aspectRatios.map((ar) => (
                    <SelectItem key={ar} value={ar}>{ar}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Resolution</Label>
              <Select value={newResolution} onValueChange={setNewResolution}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelConfig?.resolutions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddPrompt}
              disabled={isSubmitting || newPrompt.trim().length < 5}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Queue Prompt'}
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterModel} onValueChange={setFilterModel}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {Object.entries(HF_MODELS).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Queue Items */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No items in queue</p>
          <p className="text-xs mt-1">Add a prompt above or generate images with Higgsfield provider</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status]
            const StatusIcon = statusCfg.icon
            const modelLabel = HF_MODELS[item.model]?.label || item.model
            const settings = item.settings || {}

            return (
              <div
                key={item.id}
                className="border rounded-lg p-3 flex items-start gap-3 hover:bg-muted/20 transition-colors"
              >
                {/* Status icon */}
                <div className="mt-0.5">
                  <StatusIcon className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug line-clamp-2">{item.prompt}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{modelLabel}</Badge>
                    <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                    {settings.aspect_ratio && (
                      <span className="text-xs text-muted-foreground">{settings.aspect_ratio}</span>
                    )}
                    {settings.resolution && (
                      <span className="text-xs text-muted-foreground">{settings.resolution}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {item.error && (
                    <p className="text-xs text-red-600 mt-1 line-clamp-1">{item.error}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAction(item.id, 'retry')}
                      title="Retry"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {item.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleAction(item.id, 'skip')}
                      title="Skip"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-600"
                    onClick={() => handleAction(item.id, 'delete')}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
