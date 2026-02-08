'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/shared/EmptyState'
import { Settings, Plus, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbAdminSetting } from '@/types'

interface AdminSettingsTabProps {
  initialSettings: LbAdminSetting[]
}

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

  function handleValueChange(key: string, value: string) {
    const original = settings.find((s) => s.key === key)
    setEditState((prev) => ({
      ...prev,
      [key]: { value, dirty: value !== (original?.value ?? '') },
    }))
  }

  function getCurrentValue(setting: LbAdminSetting): string {
    return editState[setting.key]?.value ?? setting.value
  }

  function isDirty(key: string): boolean {
    return editState[key]?.dirty ?? false
  }

  async function handleSave(key: string) {
    const current = editState[key]
    if (!current || !current.dirty) return

    setSavingKey(key)
    try {
      const setting = settings.find((s) => s.key === key)
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value: current.value,
          description: setting?.description,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? json.data : s))
      )
      setEditState((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      toast.success(`Setting "${key}" saved`)
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
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-semibold">Admin Settings</h3>
          <p className="text-sm text-muted-foreground">
            Application-level configuration values.
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
                placeholder="e.g. anthropic_api_key"
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

      {settings.length === 0 && !showAddForm ? (
        <EmptyState
          icon={Settings}
          title="No settings"
          description="Add application-level configuration values like API keys."
          action={{ label: 'Add Setting', onClick: () => setShowAddForm(true) }}
          className="py-12"
        />
      ) : settings.length > 0 ? (
        <div className="divide-y">
          {settings.map((setting) => (
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
                  value={getCurrentValue(setting)}
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
  )
}
