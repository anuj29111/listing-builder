'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Send, User, Bot } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import type { ChatMessage } from '@/types/api'

interface ModularChatProps {
  listingId: string
  sectionId: string
  sectionType: string
  sectionLabel: string
  onNewVariation: (sectionId: string, newText: string, newIndex: number) => void
}

export function ModularChat({
  listingId,
  sectionId,
  sectionType,
  sectionLabel,
  onNewVariation,
}: ModularChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Fetch chat history on mount
  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/listings/${listingId}/chats/${sectionType}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch {
        // Silently fail — empty chat is fine
      } finally {
        setIsLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [listingId, sectionType])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    setInput('')
    setIsLoading(true)

    // Optimistic: add user message immediately
    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch(`/api/listings/${listingId}/chats/${sectionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Refinement failed')
      }

      // Add assistant message
      setMessages((prev) => [...prev, data.assistant_message])

      // Notify parent about new variation
      onNewVariation(sectionId, data.new_variation, data.new_variation_index)

      toast.success('New variation generated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refinement failed'
      toast.error(message)
      // Remove optimistic user message on error
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading chat...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        Refine {sectionLabel} — describe what you want changed
      </p>

      {/* Message List */}
      {messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2 rounded-md border bg-background p-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className="text-[10px] opacity-60 mt-1">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <Input
          placeholder={`e.g. "Make it shorter" or "Add more keywords"...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="gap-1"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Claude is refining...
        </p>
      )}
    </div>
  )
}
