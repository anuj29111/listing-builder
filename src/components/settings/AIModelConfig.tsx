'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Save, Cpu } from 'lucide-react'
import toast from 'react-hot-toast'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '@/lib/constants'
import type { ClaudeModelConfig } from '@/lib/constants'

interface AIModelConfigProps {
  currentModel: string
}

export function AIModelConfig({ currentModel }: AIModelConfigProps) {
  const resolvedCurrent = currentModel || DEFAULT_CLAUDE_MODEL
  const [selectedModel, setSelectedModel] = useState(resolvedCurrent)
  const [saving, setSaving] = useState(false)

  const isDirty = selectedModel !== resolvedCurrent

  const selectedConfig = CLAUDE_MODELS.find((m) => m.id === selectedModel)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'claude_model',
          value: selectedModel,
          description: 'Claude AI model used for listing generation and analysis',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      toast.success(`Model changed to ${selectedConfig?.name || selectedModel}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function getTierBadge(tier: ClaudeModelConfig['tier']) {
    switch (tier) {
      case 'budget':
        return <Badge variant="secondary">Budget</Badge>
      case 'recommended':
        return <Badge variant="success">Recommended</Badge>
      case 'premium':
        return <Badge variant="warning">Premium</Badge>
    }
  }

  // Calculate relative cost vs Sonnet (the recommended baseline)
  const sonnet = CLAUDE_MODELS.find((m) => m.tier === 'recommended')!
  const sonnetAvg = sonnet.inputPer1M + sonnet.outputPer1M

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">AI Model Configuration</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Select which Claude model to use for listing generation, research
          analysis, and chat refinement.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Model selector */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium">Active Model</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.name}
                      {m.tier === 'recommended' && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          ★
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isDirty && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>

        {/* Selected model description */}
        {selectedConfig && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {getTierBadge(selectedConfig.tier)}
            <span>{selectedConfig.description}</span>
          </div>
        )}

        {/* Cost comparison table */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2.5 font-medium">Model</th>
                <th className="text-left p-2.5 font-medium">Tier</th>
                <th className="text-right p-2.5 font-medium">
                  Input / 1M tokens
                </th>
                <th className="text-right p-2.5 font-medium">
                  Output / 1M tokens
                </th>
                <th className="text-right p-2.5 font-medium">Relative Cost</th>
              </tr>
            </thead>
            <tbody>
              {CLAUDE_MODELS.map((m) => {
                const isSelected = m.id === selectedModel
                const relativeCost = (
                  (m.inputPer1M + m.outputPer1M) /
                  sonnetAvg
                ).toFixed(1)
                return (
                  <tr
                    key={m.id}
                    className={
                      isSelected
                        ? 'bg-primary/5 border-l-2 border-l-primary'
                        : 'border-b last:border-b-0'
                    }
                  >
                    <td className="p-2.5 font-medium">{m.name}</td>
                    <td className="p-2.5">{getTierBadge(m.tier)}</td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">
                      ${m.inputPer1M.toFixed(2)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">
                      ${m.outputPer1M.toFixed(2)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {relativeCost}x
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          A typical listing generation uses ~2K input + ~3K output tokens.
          Research analysis uses ~5-20K input tokens depending on CSV size.
          Relative cost is compared to Sonnet 4 (1.0x baseline).
        </p>
      </div>
    </div>
  )
}
