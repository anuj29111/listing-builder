'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ClipboardCopy, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface ExportOptionsProps {
  listingId: string
}

export function ExportOptions({ listingId }: ExportOptionsProps) {
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (exportType: 'clipboard' | 'csv' | 'flat_file') => {
    setExporting(exportType)
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          export_type: exportType,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Export failed')
      }

      const { formatted } = json.data

      if (exportType === 'clipboard') {
        await navigator.clipboard.writeText(formatted as string)
        toast.success('Copied to clipboard!')
      } else {
        // CSV or flat file — build and download
        const data = formatted as { headers: string[]; rows: string[][] }
        const csvContent = [
          data.headers.join(','),
          ...data.rows.map((row) =>
            row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
          ),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = exportType === 'csv'
          ? `listing-${listingId.slice(0, 8)}.csv`
          : `listing-${listingId.slice(0, 8)}-flat-file.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        toast.success(`${exportType === 'csv' ? 'CSV' : 'Flat file'} downloaded!`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      toast.error(message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium mb-3">Export Listing</h3>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => handleExport('clipboard')}
          disabled={exporting !== null}
          className="gap-2"
        >
          {exporting === 'clipboard' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardCopy className="h-4 w-4" />
          )}
          Copy to Clipboard
        </Button>

        <Button
          variant="outline"
          onClick={() => handleExport('csv')}
          disabled={exporting !== null}
          className="gap-2"
        >
          {exporting === 'csv' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download CSV
        </Button>

        <Button
          variant="outline"
          onClick={() => handleExport('flat_file')}
          disabled={exporting !== null}
          className="gap-2"
        >
          {exporting === 'flat_file' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          Amazon Flat File
        </Button>
      </div>
    </div>
  )
}
