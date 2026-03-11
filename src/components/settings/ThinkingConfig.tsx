'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Save, Brain } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  DEFAULT_THINKING_ENABLED,
  DEFAULT_THINKING_BUDGET,
  MIN_THINKING_BUDGET,
  MAX_THINKING_BUDGET,
} from '@/lib/constants'

interface ThinkingConfigProps {
  currentEnabled: boolean | null
  currentBudget: number | null
}

export function ThinkingConfig({ currentEnabled, currentBudget }: ThinkingConfigProps) {
  const resolvedEnabled = currentEnabled ?? DEFAULT_THINKING_ENABLED
  const resolvedBudget = currentBudget ?? DEFAULT_THINKING_BUDGET

  const [enabled, setEnabled] = useState(resolvedEnabled)
  const [budget, setBudget] = useState(resolvedBudget)
  const [saving, setSaving] = useState(false)

  const isDirty = enabled !== resolvedEnabled || budget !== resolvedBudget

  async function handleSave() {
    setSaving(true)
    try {
      // Save both settings
      const promises = [
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'thinking_enabled',
            value: String(enabled),
            description: 'Whether extended thinking is enabled for Claude API calls',
          }),
        }),
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'thinking_budget',
            value: String(budget),
            description: 'Token budget for Claude extended thinking',
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
      toast.success(`Extended thinking ${enabled ? 'enabled' : 'disabled'}${enabled ? ` (${budget.toLocaleString()} tokens)` : ''}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // Estimate cost impact: thinking tokens are billed as output tokens
  const sonnetOutputPer1M = 15.0 // Sonnet 4.6
  const costPer10kThinking = (budget / 1_000_000) * sonnetOutputPer1M
  const costPerCall = costPer10kThinking.toFixed(4)

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Extended Thinking</h3>
          <Badge variant={enabled ? 'success' : 'secondary'}>
            {enabled ? 'On' : 'Off'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          When enabled, Claude reasons through complex problems before responding.
          Improves quality for listings, research analysis, and content generation.
        </p>
      </div>

      <div className="p-4 space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Enable Extended Thinking</label>
            <p className="text-xs text-muted-foreground">
              Applies to all Claude API calls across the platform
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Budget slider */}
        {enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Thinking Budget</label>
              <span className="text-sm font-mono text-muted-foreground">
                {budget.toLocaleString()} tokens
              </span>
            </div>
            <Slider
              value={[budget]}
              onValueChange={([v]) => setBudget(v)}
              min={MIN_THINKING_BUDGET}
              max={MAX_THINKING_BUDGET}
              step={1000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{MIN_THINKING_BUDGET.toLocaleString()} (minimal)</span>
              <span>{(MAX_THINKING_BUDGET / 2).toLocaleString()} (balanced)</span>
              <span>{MAX_THINKING_BUDGET.toLocaleString()} (deep)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              ~${costPerCall} additional cost per API call (Sonnet 4.6 output rate).
              Thinking tokens are billed as output tokens.
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
