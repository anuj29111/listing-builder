'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/shared/EmptyState'
import { Settings, Plus, Save, Eye, EyeOff, Check, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbAdminSetting } from '@/types'
import { AIModelConfig } from '@/components/settings/AIModelConfig'
import { ImageProviderSettings } from '@/components/settings/ImageProviderSettings'

interface AdminSettingsTabProps {
  initialSettings: LbAdminSetting[]
}

// Pre-defined API key slots — users just paste the value
const API_KEY_SLOTS = [
  {
    key: 'anthropic_api_key',
    label: 'Anthropic (Claude)',
    description: 'Used for listing generation, research analysis, and image concepts',
    placeholder: 'sk-ant-api...',
  },
  {
    key: 'openai_api_key',
    label: 'OpenAI (GPT Image)',
    description: 'Used for GPT Image generation',
    placeholder: 'sk-...',
  },
  {
    key: 'google_ai_api_key',
    label: 'Google AI (Gemini)',
    description: 'Used for Gemini image generation',
    placeholder: 'AIza...',
  },
  {
    key: 'higgsfield_api_key',
    label: 'Higgsfield API Key',
    description: 'Used for Higgsfield AI image generation',
    placeholder: 'hf-...',
  },
  {
    key: 'higgsfield_api_secret',
    label: 'Higgsfield API Secret',
    description: 'Paired with Higgsfield API Key above',
    placeholder: 'Secret key',
  },
]

// Keys managed by dedicated UI components (not shown in generic grid)
const MANAGED_KEYS = new Set([
  'claude_model',
  'image_provider_visibility',
  ...API_KEY_SLOTS.map((s) => s.key),
])

interface EditState {
  [key: string]: { value: string; dirty: boolean }
}

export function AdminSettingsTab({ initialSettings }: AdminSettingsTabProps) {
  const [settings, setSettings] = useState<LbAdminSetting[]>(initialSettings)
  const [editState, setEditState] = useState<EditState>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  // Separate managed settings from generic ones
  const modelSetting = settings.find((s) => s.key === 'claude_model')
  const genericSettings = settings.filter((s) => !MANAGED_KEYS.has(s.key))

  function getSettingValue(key: string): string {
    return editState[key]?.value ?? settings.find((s) => s.key === key)?.value ?? ''
  }

  function handleValueChange(key: string, value: string) {
    const original = settings.find((s) => s.key === key)?.value ?? ''
    setEditState((prev) => ({
      ...prev,
      [key]: { value, dirty: value !== original },
    }))
  }

  function isDirty(key: string): boolean {
    return editState[key]?.dirty ?? false
  }

  function isConfigured(key: string): boolean {
    const setting = settings.find((s) => s.key === key)
    return !!setting?.value
  }

  function toggleVisibility(key: string) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave(key: string, description?: string) {
    const value = editState[key]?.value
    if (!value && !getSettingValue(key)) return

    const saveValue = value ?? getSettingValue(key)
    if (!isDirty(key)) return

    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value: saveValue,
          description: description || settings.find((s) => s.key === key)?.description || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')

      const exists = settings.some((s) => s.key === key)
      if (exists) {
        setSettings((prev) => prev.map((s) => (s.key === key ? json.data : s)))
      } else {
        setSettings((prev) => [...prev, json.data])
      }
      setEditState((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      toast.success(`Saved!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSavingKey(null)
    }
  }

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) {
      toast.error('Key and value are required')
      return
    }

    setAdding(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue.trim(),
          description: newDescription.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add')

      const exists = settings.some((s) => s.key === json.data.key)
      if (exists) {
        setSettings((prev) =>
          prev.map((s) => (s.key === json.data.key ? json.data : s))
        )
      } else {
        setSettings((prev) => [...prev, json.data])
      }

      setNewKey('')
      setNewValue('')
      setNewDescription('')
      setShowAddForm(false)
      toast.success('Setting added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-6">
      <AIModelConfig currentModel={modelSetting?.value || ''} />

      <ImageProviderSettings />

      {/* API Keys — Pre-filled slots */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">API Keys</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Paste your API keys below. Keys are stored securely and used server-side only.
          </p>
        </div>
        <div className="divide-y">
          {API_KEY_SLOTS.map((slot) => {
            const currentValue = getSettingValue(slot.key)
            const configured = isConfigured(slot.key)
            const dirty = isDirty(slot.key)
            const visible = visibleKeys.has(slot.key)

            return (
              <div key={slot.key} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{slot.label}</span>
                      {configured && !dirty && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
                          <Check className="h-3 w-3" />
                          Configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {slot.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="relative flex-1">
                    <Input
                      type={visible ? 'text' : 'password'}
                      value={currentValue}
                      onChange={(e) => handleValueChange(slot.key, e.target.value)}
                      placeholder={slot.placeholder}
                      className="text-sm font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(slot.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {dirty && (
                    <Button
                      size="sm"
                      onClick={() => handleSave(slot.key, slot.description)}
                      disabled={savingKey === slot.key}
                      className="gap-1"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingKey === slot.key ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Other Settings (generic key-value, for anything not covered above) */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">Other Settings</h3>
            <p className="text-sm text-muted-foreground">
              Custom application-level configuration values.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Setting
          </Button>
        </div>

        {showAddForm && (
          <div className="p-4 border-b bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-key" className="text-xs">
                  Key
                </Label>
                <Input
                  id="new-key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="setting_name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-value" className="text-xs">
                  Value
                </Label>
                <Input
                  id="new-value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Setting value"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-desc" className="text-xs">
                  Description
                </Label>
                <Input
                  id="new-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  setNewKey('')
                  setNewValue('')
                  setNewDescription('')
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={adding}>
                {adding ? 'Adding...' : 'Add Setting'}
              </Button>
            </div>
          </div>
        )}

        {genericSettings.length === 0 && !showAddForm ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No custom settings. Use &quot;Add Setting&quot; for any additional configuration.
          </div>
        ) : genericSettings.length > 0 ? (
          <div className="divide-y">
            {genericSettings.map((setting) => (
              <div
                key={setting.key}
                className="flex items-center gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium font-mono">
                    {setting.key}
                  </div>
                  {setting.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {setting.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 w-72 flex-shrink-0">
                  <Input
                    value={editState[setting.key]?.value ?? setting.value}
                    onChange={(e) =>
                      handleValueChange(setting.key, e.target.value)
                    }
                    className="text-sm"
                  />
                  {isDirty(setting.key) && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleSave(setting.key)}
                      disabled={savingKey === setting.key}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
