import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { HIGGSFIELD_MODELS } from '@/lib/constants'

export interface ProviderModel {
  id: string
  label: string
  enabled: boolean
}

export interface ProviderInfo {
  id: string
  label: string
  enabled: boolean
  models: ProviderModel[]
}

interface VisibilityConfig {
  dalle3?: boolean
  gemini?: boolean
  higgsfield?: boolean
  higgsfield_models?: Record<string, boolean>
}

const DEFAULT_PROVIDERS: ProviderInfo[] = [
  {
    id: 'dalle3',
    label: 'DALL-E 3 (OpenAI)',
    enabled: true,
    models: [{ id: 'dall-e-3', label: 'DALL-E 3', enabled: true }],
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    enabled: true,
    models: [{ id: 'gemini-2.0-flash-exp', label: 'Gemini Flash', enabled: true }],
  },
  {
    id: 'higgsfield',
    label: 'Higgsfield AI',
    enabled: false,
    models: HIGGSFIELD_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      enabled: m.id === 'higgsfield-ai/soul/standard',
    })),
  },
]

export async function GET() {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const { data: setting } = await adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'image_provider_visibility')
      .single()

    // If no setting exists, return defaults (backward-compatible)
    if (!setting?.value) {
      return NextResponse.json({ data: { providers: DEFAULT_PROVIDERS } })
    }

    let config: VisibilityConfig
    try {
      config = JSON.parse(setting.value) as VisibilityConfig
    } catch {
      // Invalid JSON — fall back to defaults
      return NextResponse.json({ data: { providers: DEFAULT_PROVIDERS } })
    }

    const providers: ProviderInfo[] = [
      {
        id: 'dalle3',
        label: 'DALL-E 3 (OpenAI)',
        enabled: config.dalle3 !== false, // default true
        models: [{ id: 'dall-e-3', label: 'DALL-E 3', enabled: true }],
      },
      {
        id: 'gemini',
        label: 'Gemini (Google)',
        enabled: config.gemini !== false, // default true
        models: [{ id: 'gemini-2.0-flash-exp', label: 'Gemini Flash', enabled: true }],
      },
      {
        id: 'higgsfield',
        label: 'Higgsfield AI',
        enabled: config.higgsfield === true, // default false
        models: HIGGSFIELD_MODELS.map((m) => ({
          id: m.id,
          label: m.label,
          enabled: config.higgsfield_models?.[m.id] !== false
            && (config.higgsfield_models?.[m.id] === true || m.id === 'higgsfield-ai/soul/standard'),
        })),
      },
    ]

    return NextResponse.json({ data: { providers } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
