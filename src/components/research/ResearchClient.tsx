'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileUploader } from '@/components/research/FileUploader'
import { FileList } from '@/components/research/FileList'
import type { LbCategory, LbCountry } from '@/types'

interface ResearchFileWithJoins {
  id: string
  file_name: string
  file_type: string
  file_size_bytes: number | null
  row_count: number | null
  created_at: string
  category?: { name: string; slug: string; brand: string } | null
  country?: { name: string; code: string; flag_emoji: string | null } | null
  uploader?: { full_name: string | null } | null
}

interface ResearchClientProps {
  categories: LbCategory[]
  countries: LbCountry[]
  initialFiles: ResearchFileWithJoins[]
  defaultCategoryId: string | null
  defaultCountryId: string | null
}

export function ResearchClient({
  categories,
  countries,
  initialFiles,
  defaultCategoryId,
  defaultCountryId,
}: ResearchClientProps) {
  const [categoryId, setCategoryId] = useState<string | null>(
    defaultCategoryId
  )
  const [countryId, setCountryId] = useState<string | null>(defaultCountryId)
  const [files, setFiles] = useState<ResearchFileWithJoins[]>(initialFiles)
  const [loading, setLoading] = useState(false)

  const fetchFiles = useCallback(async () => {
    if (!categoryId || !countryId) {
      setFiles([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('category_id', categoryId)
      params.set('country_id', countryId)

      const res = await fetch(`/api/research/files?${params.toString()}`)
      const json = await res.json()

      if (res.ok) {
        setFiles(json.data || [])
      }
    } catch {
      // Silent fail — files just won't update
    } finally {
      setLoading(false)
    }
  }, [categoryId, countryId])

  // Fetch files when category or country changes (skip on initial load since server provided them)
  useEffect(() => {
    const isInitial =
      categoryId === defaultCategoryId && countryId === defaultCountryId
    if (!isInitial) {
      fetchFiles()
    }
  }, [categoryId, countryId, fetchFiles, defaultCategoryId, defaultCountryId])

  function handleUploadComplete(newFile: unknown) {
    setFiles((prev) => [newFile as ResearchFileWithJoins, ...prev])
  }

  function handleDelete(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const selectedCategory = categories.find((c) => c.id === categoryId)
  const selectedCountry = countries.find((c) => c.id === countryId)

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={categoryId || ''}
              onValueChange={(val) => setCategoryId(val || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name} ({cat.brand})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Country / Marketplace</Label>
            <Select
              value={countryId || ''}
              onValueChange={(val) => setCountryId(val || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select marketplace" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.flag_emoji} {country.name} ({country.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedCategory && selectedCountry && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-muted-foreground">
              Showing research files for{' '}
              <span className="font-medium">{selectedCategory.name}</span> in{' '}
              <span className="font-medium">
                {selectedCountry.flag_emoji} {selectedCountry.name}
              </span>
            </p>
            {files.length > 0 && (
              <Link
                href={`/research/${categoryId}/${countryId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                View Analysis
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Upload + File List */}
      {categoryId && countryId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <FileUploader
              categories={categories}
              countries={countries}
              selectedCategoryId={categoryId}
              selectedCountryId={countryId}
              onUploadComplete={handleUploadComplete}
            />
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-lg border bg-card">
              <div className="p-4 border-b">
                <h3 className="font-semibold">
                  Uploaded Files
                  {files.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-2">
                      ({files.length})
                    </span>
                  )}
                </h3>
              </div>
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Loading files...
                </div>
              ) : (
                <FileList files={files} onDelete={handleDelete} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Select a category and marketplace above to view and upload research
          files.
        </div>
      )}
    </div>
  )
}
