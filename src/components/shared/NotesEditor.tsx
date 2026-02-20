'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Check } from 'lucide-react'

interface NotesEditorProps {
  notes: string | null
  onSave: (notes: string) => void
  compact?: boolean
}

export function NotesEditor({ notes, onSave, compact }: NotesEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(notes || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setValue(notes || '')
  }, [notes])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [editing])

  const handleSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    onSave(value.trim())
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        <MessageSquare className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {notes ? (
          <span className="text-foreground line-clamp-1 text-left max-w-[200px]">{notes}</span>
        ) : (
          <span>Add notes...</span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-1.5">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(notes || '')
            setEditing(false)
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSave()
          }
        }}
        placeholder="Add notes about this item..."
        className={`w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none ${
          compact ? 'text-xs min-h-[60px]' : 'text-sm min-h-[80px]'
        }`}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Cmd+Enter to save, Esc to cancel</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setValue(notes || '')
              setEditing(false)
            }}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// Small indicator for history rows — shows a notes icon with tooltip
export function NotesIndicator({ notes }: { notes: string | null }) {
  if (!notes) return null

  return (
    <span
      className="inline-flex items-center text-muted-foreground"
      title={notes}
    >
      <MessageSquare className="h-3 w-3" />
    </span>
  )
}
