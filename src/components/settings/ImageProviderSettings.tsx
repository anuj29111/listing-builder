'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Save, ImageIcon } from 'lucide-react'
import { GEMINI_MODELS, HIGGSFIELD_MODELS } from '@/lib/constants'
import toast from 'react-hot-toast'

interface VisibilityConfig {
  openai: boolean
  gemini: boolean
  gemini_models: Record<string, boolean>
  higgsfield: boolean
  higgsfield_models: Record<string, boolean>
}

const DEFAULT_CONFIG: VisibilityConfig = {
  openai: true,
  gemini: true,
  gemini_models: Object.fromEntries(
    GEMINI_MODELS.map((m) => [m.id, true])
  ),
  higgsfield: false,
  higgsfield_models: Object.fromEntries(
    HIGGSFIELD_MODELS.map((m) => [m.id, m.id === 'higgsfield-ai/soul/standard'])
  ),
}

export function ImageProviderSettings() {
  const [config, setConfig] = useState<VisibilityConfig>(DEFAULT_CONFIG)
  const [originalConfig, setOriginalConfig] = useState<VisibilityConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/admin/settings')
        const json = await res.json()
        if (!res.ok) return

        const settings = json.data as Array<{ key: string; value: string }>
        const visibilitySetting = settings.find((s) => s.key === 'image_provider_visibility')

        if (visibilitySetting?.value) {
          try {
            const parsed = JSON.parse(visibilitySetting.value) as Partial<VisibilityConfig>
            const merged: VisibilityConfig = {
              openai: parsed.openai !== false,
              gemini: parsed.gemini !== false,
              gemini_models: {
                ...DEFAULT_CONFIG.gemini_models,
                ...(parsed.gemini_models || {}),
              },
              higgsfield: parsed.higgsfield === true,
              higgsfield_models: {
                ...DEFAULT_CONFIG.higgsfield_models,
                ...(parsed.higgsfield_models || {}),
              },
            }
            setConfig(merged)
            setOriginalConfig(merged)
          } catch {
            // Invalid JSON — use defaults
          }
        }
      } catch {
        // Failed to fetch — use defaults
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'image_provider_visibility',
          value: JSON.stringify(config),
          description: 'Controls which image generation providers are visible to users',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')

      setOriginalConfig(config)
      toast.success('Image provider settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function toggleProvider(key: 'openai' | 'gemini' | 'higgsfield', value: boolean) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  function toggleGeminiModel(modelId: string, value: boolean) {
    setConfig((prev) => ({
      ...prev,
      gemini_models: { ...prev.gemini_models, [modelId]: value },
    }))
  }

  function toggleHiggsModel(modelId: string, value: boolean) {
    setConfig((prev) => ({
      ...prev,
      higgsfield_models: { ...prev.higgsfield_models, [modelId]: value },
    }))
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading provider settings...</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Image Providers</h3>
            <p className="text-sm text-muted-foreground">
              Control which AI image providers are visible in the Image Builder.
            </p>
          </div>
        </div>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>

      <div className="divide-y">
        {/* GPT Image 1.5 (OpenAI) */}
        <div className="flex items-center justify-between p-4">
          <div>
            <Label className="text-sm font-medium">GPT Image 1.5 (OpenAI)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              ~3c per image · 1024×1024, 1536×1024, 1024×1536
            </p>
          </div>
          <Switch
            checked={config.openai}
            onCheckedChange={(v) => toggleProvider('openai', v)}
          />
        </div>

        {/* Gemini */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Gemini (Google)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Flash ~2c · Pro ~4c · 1:1, 16:9, 9:16
              </p>
            </div>
            <Switch
              checked={config.gemini}
              onCheckedChange={(v) => toggleProvider('gemini', v)}
            />
          </div>

          {/* Gemini sub-models */}
          {config.gemini && (
            <div className="ml-4 pl-4 border-l space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Models</p>
              {GEMINI_MODELS.map((model) => (
                <div key={model.id} className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">{model.label}</Label>
                    <span className="text-xs text-muted-foreground ml-2">~{model.cost}c</span>
                  </div>
                  <Switch
                    checked={config.gemini_models[model.id] ?? true}
                    onCheckedChange={(v) => toggleGeminiModel(model.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Higgsfield */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Higgsfield AI</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multiple models · Cost TBD · REST API
              </p>
            </div>
            <Switch
              checked={config.higgsfield}
              onCheckedChange={(v) => toggleProvider('higgsfield', v)}
            />
          </div>

          {/* Higgsfield sub-models */}
          {config.higgsfield && (
            <div className="ml-4 pl-4 border-l space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Models</p>
              {HIGGSFIELD_MODELS.map((model) => (
                <div key={model.id} className="flex items-center justify-between">
                  <Label className="text-xs">{model.label}</Label>
                  <Switch
                    checked={config.higgsfield_models[model.id] ?? false}
                    onCheckedChange={(v) => toggleHiggsModel(model.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Warning if no providers enabled */}
      {!config.openai && !config.gemini && !config.higgsfield && (
        <div className="p-4 border-t bg-yellow-50 dark:bg-yellow-900/20">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            No providers are enabled. Users will not be able to generate images.
          </p>
        </div>
      )}
    </div>
  )
}
