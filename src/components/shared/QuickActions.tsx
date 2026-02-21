'use client'

import { useState, useRef, useEffect } from 'react'
import { Tag, MessageSquare, FolderPlus } from 'lucide-react'
import { TagInput } from './TagInput'
import { NotesEditor } from './NotesEditor'
import { CollectionPicker } from './CollectionPicker'
import type { ResearchEntityType } from '@/types'

interface QuickActionsProps {
  entityId: string
  entityType: ResearchEntityType
  tags: string[]
  notes: string | null
  onTagsChange: (tags: string[]) => void
  onNotesChange: (notes: string) => void
}

type ActivePopover = 'tags' | 'notes' | 'collections' | null

export function QuickActions({
  entityId,
  entityType,
  tags,
  notes,
  onTagsChange,
  onNotesChange,
}: QuickActionsProps) {
  const [active, setActive] = useState<ActivePopover>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!active) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [active])

  const toggle = (popover: ActivePopover, e: React.MouseEvent) => {
    e.stopPropagation()
    setActive((prev) => (prev === popover ? null : popover))
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-0.5">
      {/* Tag button */}
      <button
        type="button"
        onClick={(e) => toggle('tags', e)}
        className={`p-1 rounded hover:bg-muted transition-colors ${
          active === 'tags' ? 'bg-muted text-foreground' : 'text-muted-foreground'
        } ${tags.length > 0 ? 'text-blue-500 dark:text-blue-400' : ''}`}
        title="Edit tags"
      >
        <Tag className="h-3.5 w-3.5" />
      </button>

      {/* Notes button */}
      <button
        type="button"
        onClick={(e) => toggle('notes', e)}
        className={`p-1 rounded hover:bg-muted transition-colors ${
          active === 'notes' ? 'bg-muted text-foreground' : 'text-muted-foreground'
        } ${notes ? 'text-amber-500 dark:text-amber-400' : ''}`}
        title={notes || 'Add note'}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>

      {/* Collection button */}
      <button
        type="button"
        onClick={(e) => toggle('collections', e)}
        className={`p-1 rounded hover:bg-muted transition-colors ${
          active === 'collections' ? 'bg-muted text-foreground' : 'text-muted-foreground'
        }`}
        title="Add to collection"
      >
        <FolderPlus className="h-3.5 w-3.5" />
      </button>

      {/* Popovers */}
      {active === 'tags' && (
        <div
          className="absolute z-50 right-0 top-full mt-1 w-72 rounded-md border bg-popover shadow-lg p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Tags</p>
          <TagInput tags={tags} onTagsChange={onTagsChange} compact />
        </div>
      )}

      {active === 'notes' && (
        <div
          className="absolute z-50 right-0 top-full mt-1 w-72 rounded-md border bg-popover shadow-lg p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes</p>
          <NotesEditor
            notes={notes}
            onSave={(n) => {
              onNotesChange(n)
              setActive(null)
            }}
            compact
          />
        </div>
      )}

      {active === 'collections' && (
        <div
          className="absolute z-50 right-0 top-full mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CollectionPicker entityType={entityType} entityId={entityId} compact defaultOpen />
        </div>
      )}
    </div>
  )
}
