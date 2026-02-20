'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Store, Plus, Trash2, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface SellerIdEntry {
  country_id: string
  country_name: string
  country_code: string
  flag_emoji: string
  seller_id: string
}

interface CountryOption {
  id: string
  name: string
  code: string
  flag_emoji: string | null
}

export function SellerIdsSettings() {
  const [entries, setEntries] = useState<SellerIdEntry[]>([])
  const [originalEntries, setOriginalEntries] = useState<SellerIdEntry[]>([])
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isDirty = JSON.stringify(entries) !== JSON.stringify(originalEntries)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch countries and settings in parallel
        const [countriesRes, settingsRes] = await Promise.all([
          fetch('/api/countries'),
          fetch('/api/admin/settings'),
        ])

        const countriesJson = await countriesRes.json()
        const settingsJson = await settingsRes.json()

        const countryList: CountryOption[] = (countriesJson.data || []).map(
          (c: { id: string; name: string; code: string; flag_emoji: string | null }) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            flag_emoji: c.flag_emoji || '',
          })
        )
        setCountries(countryList)

        // Parse seller_ids from settings
        const sellerIdsSetting = (settingsJson.data || []).find(
          (s: { key: string }) => s.key === 'seller_ids'
        )

        if (sellerIdsSetting?.value) {
          try {
            const parsed = JSON.parse(sellerIdsSetting.value) as Record<string, string>
            const loadedEntries: SellerIdEntry[] = []

            for (const [countryId, sellerId] of Object.entries(parsed)) {
              const country = countryList.find((c) => c.id === countryId)
              if (country && sellerId) {
                loadedEntries.push({
                  country_id: countryId,
                  country_name: country.name,
                  country_code: country.code,
                  flag_emoji: country.flag_emoji || '',
                  seller_id: sellerId,
                })
              }
            }

            setEntries(loadedEntries)
            setOriginalEntries(loadedEntries)
          } catch {
            // Invalid JSON, start fresh
          }
        }
      } catch {
        toast.error('Failed to load seller settings')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  function handleAddCountry() {
    // Find first country not already in the list
    const usedIds = new Set(entries.map((e) => e.country_id))
    const available = countries.find((c) => !usedIds.has(c.id))
    if (!available) {
      toast.error('All countries already have seller IDs configured')
      return
    }
    setEntries((prev) => [
      ...prev,
      {
        country_id: available.id,
        country_name: available.name,
        country_code: available.code,
        flag_emoji: available.flag_emoji || '',
        seller_id: '',
      },
    ])
  }

  function handleRemove(countryId: string) {
    setEntries((prev) => prev.filter((e) => e.country_id !== countryId))
  }

  function handleCountryChange(index: number, newCountryId: string) {
    const country = countries.find((c) => c.id === newCountryId)
    if (!country) return

    setEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? {
              ...e,
              country_id: newCountryId,
              country_name: country.name,
              country_code: country.code,
              flag_emoji: country.flag_emoji || '',
            }
          : e
      )
    )
  }

  function handleSellerIdChange(index: number, sellerId: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, seller_id: sellerId } : e))
    )
  }

  async function handleSave() {
    // Build the JSON: { country_id: seller_id }
    const sellerIds: Record<string, string> = {}
    for (const entry of entries) {
      if (entry.seller_id.trim()) {
        sellerIds[entry.country_id] = entry.seller_id.trim()
      }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'seller_ids',
          value: JSON.stringify(sellerIds),
          description: 'Amazon Seller IDs per marketplace country',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')

      // Clean up entries (remove empty ones)
      const cleanEntries = entries.filter((e) => e.seller_id.trim())
      setEntries(cleanEntries)
      setOriginalEntries(cleanEntries)
      toast.success('Seller IDs saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const usedCountryIds = new Set(entries.map((e) => e.country_id))
  const hasAvailableCountries = countries.some((c) => !usedCountryIds.has(c.id))

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Amazon Seller IDs</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your Amazon Seller ID for each marketplace. Used for the Seller Pull feature to
              automatically import your product catalog.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y">
        {entries.map((entry, index) => (
          <div key={entry.country_id + '-' + index} className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Label className="text-xs text-muted-foreground mb-1 block">Marketplace</Label>
                <select
                  value={entry.country_id}
                  onChange={(e) => handleCountryChange(index, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {countries.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={usedCountryIds.has(c.id) && c.id !== entry.country_id}
                    >
                      {c.flag_emoji} {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Seller ID</Label>
                <Input
                  value={entry.seller_id}
                  onChange={(e) => handleSellerIdChange(index, e.target.value)}
                  placeholder="e.g. A3EK1XD8UBNM1I"
                  className="text-sm font-mono"
                />
              </div>
              {entry.seller_id.trim() && (
                <div className="pt-5">
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-1 rounded-full">
                    <Check className="h-3 w-3" />
                  </span>
                </div>
              )}
              <div className="pt-5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemove(entry.country_id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No seller IDs configured. Click &quot;Add Marketplace&quot; to get started.
          </div>
        )}
      </div>

      {hasAvailableCountries && (
        <div className="p-4 border-t">
          <Button size="sm" variant="outline" onClick={handleAddCountry} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add Marketplace
          </Button>
        </div>
      )}
    </div>
  )
}
