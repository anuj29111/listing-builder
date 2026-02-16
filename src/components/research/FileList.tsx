'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FILE_TYPE_SHORT_LABELS } from '@/lib/constants'
import { formatDate, formatFileSize, formatNumber } from '@/lib/utils'
import { FileText, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

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

interface FileListProps {
  files: ResearchFileWithJoins[]
  onDelete: (id: string) => void
  showCategoryCountry?: boolean
}

const fileTypeBadgeColors: Record<string, string> = {
  keywords: 'bg-green-100 text-green-800',
  reviews: 'bg-blue-100 text-blue-800',
  qna: 'bg-orange-100 text-orange-800',
  rufus_qna: 'bg-purple-100 text-purple-800',
  keywords_analysis: 'bg-green-100 text-green-800 ring-1 ring-green-300',
  reviews_analysis: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  qna_analysis: 'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
}

export function FileList({
  files,
  onDelete,
  showCategoryCountry = false,
}: FileListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/research/files/${deleteId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to delete')
      }
      onDelete(deleteId)
      toast.success('File deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No research files"
        description="Upload CSV files to start building your research library for this category and marketplace."
        className="py-12"
      />
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3">File Name</th>
              <th className="text-left font-medium p-3">Type</th>
              {showCategoryCountry && (
                <>
                  <th className="text-left font-medium p-3">Category</th>
                  <th className="text-left font-medium p-3">Country</th>
                </>
              )}
              <th className="text-right font-medium p-3">Rows</th>
              <th className="text-right font-medium p-3">Size</th>
              <th className="text-left font-medium p-3">Uploaded By</th>
              <th className="text-left font-medium p-3">Date</th>
              <th className="text-right font-medium p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="border-b last:border-0">
                <td className="p-3">
                  <span className="font-medium" title={file.file_name}>
                    {file.file_name.length > 35
                      ? file.file_name.slice(0, 35) + '...'
                      : file.file_name}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      fileTypeBadgeColors[file.file_type] ||
                      'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {FILE_TYPE_SHORT_LABELS[file.file_type] || file.file_type}
                  </span>
                </td>
                {showCategoryCountry && (
                  <>
                    <td className="p-3 text-muted-foreground">
                      {file.category?.name || '-'}
                    </td>
                    <td className="p-3">
                      {file.country ? (
                        <span>
                          {file.country.flag_emoji} {file.country.code}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </>
                )}
                <td className="p-3 text-right text-muted-foreground">
                  {formatNumber(file.row_count)}
                </td>
                <td className="p-3 text-right text-muted-foreground">
                  {formatFileSize(file.file_size_bytes)}
                </td>
                <td className="p-3 text-muted-foreground">
                  {file.uploader?.full_name || 'Unknown'}
                </td>
                <td className="p-3 text-muted-foreground">
                  {formatDate(file.created_at)}
                </td>
                <td className="p-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(file.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Delete Research File"
        description="Are you sure you want to delete this research file? The file will be removed from storage. This action cannot be undone."
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
