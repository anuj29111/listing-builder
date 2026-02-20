'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useCollectionStore } from '@/stores/collection-store'

interface TagInputProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  compact?: boolean
}

const TAG_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
]

function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export function TagBadge({
  tag,
  onRemove,
  compact,
}: {
  tag: string
  onRemove?: () => void
  compact?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full font-medium ${getTagColor(tag)} ${
        compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </button>
      )}
    </span>
  )
}

export function TagInput({ tags, onTagsChange, placeholder = 'Add tag...', compact }: TagInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const allTags = useCollectionStore((s) => s.allTags)
  const fetchAllTags = useCollectionStore((s) => s.fetchAllTags)

  useEffect(() => {
    if (allTags.length === 0) fetchAllTags()
  }, [allTags.length, fetchAllTags])

  const suggestions = input.trim()
    ? allTags
        .filter((t) => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t))
        .slice(0, 8)
    : []

  const addTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toLowerCase()
      if (normalized && !tags.includes(normalized)) {
        onTagsChange([...tags, normalized])
      }
      setInput('')
      setShowSuggestions(false)
      setSelectedIdx(0)
    },
    [tags, onTagsChange]
  )

  const removeTag = useCallback(
    (tag: string) => {
      onTagsChange(tags.filter((t) => t !== tag))
    },
    [tags, onTagsChange]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (suggestions.length > 0 && showSuggestions) {
        addTag(suggestions[selectedIdx])
      } else if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1 rounded-md border border-input bg-background ${
          compact ? 'px-1.5 py-1 min-h-[28px]' : 'px-2 py-1.5 min-h-[36px]'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <TagBadge key={tag} tag={tag} onRemove={() => removeTag(tag)} compact={compact} />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowSuggestions(true)
            setSelectedIdx(0)
          }}
          onFocus={() => {
            if (input.trim()) setShowSuggestions(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className={`flex-1 min-w-[60px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${
                idx === selectedIdx ? 'bg-accent' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(suggestion)
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
