'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Save, Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  DEFAULT_WEB_SEARCH_ENABLED,
  DEFAULT_WEB_SEARCH_MAX_USES,
} from '@/lib/constants'

interface WebSearchConfigProps {
  currentEnabled: boolean | null
  currentMaxUses: number | null
}

export function WebSearchConfig({ currentEnabled, currentMaxUses }: WebSearchConfigProps) {
  const resolvedEnabled = currentEnabled ?? DEFAULT_WEB_SEARCH_ENABLED
  const resolvedMaxUses = currentMaxUses ?? DEFAULT_WEB_SEARCH_MAX_USES

  const [enabled, setEnabled] = useState(resolvedEnabled)
  const [maxUses, setMaxUses] = useState(resolvedMaxUses)
  const [saving, setSaving] = useState(false)

  const isDirty = enabled !== resolvedEnabled || maxUses !== resolvedMaxUses

  async function handleSave() {
    setSaving(true)
    try {
      const promises = [
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'web_search_enabled',
            value: String(enabled),
            description: 'Whether web search (Research mode) is enabled for listing generation',
          }),
        }),
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'web_search_max_uses',
            value: String(maxUses),
            description: 'Max web searches per API call for listing generation',
          }),
        }),
      ]
      const results = await Promise.all(promises)
      for (const res of results) {
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json.error || 'Failed to save')
        }
      }
      toast.success(`Web search ${enabled ? 'enabled' : 'disabled'}${enabled ? ` (max ${maxUses} searches/call)` : ''}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // Cost: $10 per 1,000 searches = $0.01 per search
  const costPerCall = (maxUses * 0.01).toFixed(2)

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Web Search (Research Mode)</h3>
          <Badge variant={enabled ? 'success' : 'secondary'}>
            {enabled ? 'On' : 'Off'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          When enabled, Claude searches the web for real-time product info, competitor data,
          and market trends during Title, Bullets, and Description generation.
        </p>
      </div>

      <div className="p-4 space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Enable Web Search</label>
            <p className="text-xs text-muted-foreground">
              Applies to listing generation only (Title, Bullets, Description)
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Max uses */}
        {enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Max Searches per Call</label>
              <select
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value, 10))}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                <option value={3}>3 searches</option>
                <option value={5}>5 searches (recommended)</option>
                <option value={8}>8 searches</option>
                <option value={10}>10 searches</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to ${costPerCall} additional cost per API call ($10 per 1,000 searches).
              Claude decides when to search — it may use fewer than the max.
            </p>
          </div>
        )}

        {/* Save button */}
        {isDirty && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
