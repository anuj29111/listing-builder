'use client'

import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, StickyNote, ChevronDown, ChevronUp } from 'lucide-react'
import { VIDEO_PROJECT_STATUS_LABELS } from '@/lib/constants'
import toast from 'react-hot-toast'

interface VideoProjectHeaderProps {
  listingId: string
  status: string
  notes: string | null
  onUpdate: (updates: { status?: string; notes?: string }) => void
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  in_production: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

export function VideoProjectHeader({ listingId, status, notes, onUpdate }: VideoProjectHeaderProps) {
  const [showNotes, setShowNotes] = useState(!!notes)
  const [notesText, setNotesText] = useState(notes || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/video-projects/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      onUpdate({ status: newStatus })
      toast.success(`Status updated to ${VIDEO_PROJECT_STATUS_LABELS[newStatus]}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveNotes = useCallback(async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/video-projects/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText || null }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error)
      }
      onUpdate({ notes: notesText || undefined })
      toast.success('Notes saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save notes')
    } finally {
      setIsSaving(false)
    }
  }, [listingId, notesText, onUpdate])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={isSaving}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(VIDEO_PROJECT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Badge className={STATUS_COLORS[status] || ''}>
            {VIDEO_PROJECT_STATUS_LABELS[status] || status}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNotes(!showNotes)}
          className="gap-1"
        >
          <StickyNote className="h-3 w-3" />
          Notes
          {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {showNotes && (
        <div className="space-y-2">
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Add production notes, feedback, or instructions..."
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={isSaving} className="gap-1">
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Notes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
