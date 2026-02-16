'use client'

import { useState, useCallback, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parseCSV, type CSVParseResult } from '@/lib/csv-parser'
import { FILE_TYPE_LABELS, MAX_FILE_SIZE_BYTES } from '@/lib/constants'
import { FILE_TYPES } from '@/lib/constants'
import { formatFileSize, formatNumber } from '@/lib/utils'
import { Upload, FileText, X, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbCategory, LbCountry } from '@/types'

// Analysis file types that don't need CSV parsing
const ANALYSIS_FILE_TYPES = new Set(['keywords_analysis', 'reviews_analysis', 'qna_analysis'])

interface FileUploaderProps {
  categories: LbCategory[]
  countries: LbCountry[]
  selectedCategoryId: string | null
  selectedCountryId: string | null
  onUploadComplete: (file: unknown) => void
}

export function FileUploader({
  selectedCategoryId,
  selectedCountryId,
  onUploadComplete,
}: FileUploaderProps) {
  const [fileType, setFileType] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null)
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)

  const isAnalysisType = ANALYSIS_FILE_TYPES.has(fileType)

  // Dynamic accept types based on selected file type
  const acceptTypes = useMemo((): Record<string, string[]> => {
    if (isAnalysisType) {
      return {
        'text/markdown': ['.md'],
        'application/json': ['.json'],
        'text/plain': ['.txt'],
      }
    }
    return { 'text/csv': ['.csv'], 'text/plain': ['.txt'] }
  }, [isAnalysisType])

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error('File exceeds 50MB limit')
        return
      }

      setSelectedFile(file)
      setParseResult(null)
      setTextPreview(null)

      // For analysis files, show text preview instead of CSV parsing
      if (isAnalysisType) {
        try {
          const text = await file.text()
          // Show first 500 chars as preview
          setTextPreview(text.length > 500 ? text.slice(0, 500) + '...' : text)
        } catch {
          toast.error('Failed to read file')
        }
        return
      }

      // For CSV files, parse normally
      setParsing(true)
      try {
        const result = await parseCSV(file)
        setParseResult(result)

        // Auto-set file type if detected and not already selected
        if (result.detectedType && !fileType) {
          setFileType(result.detectedType)
        }

        if (result.errors.length > 0) {
          toast.error(`CSV has ${result.errors.length} warning(s)`)
        }
      } catch {
        toast.error('Failed to parse CSV file')
      } finally {
        setParsing(false)
      }
    },
    [fileType, isAnalysisType]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptTypes,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE_BYTES,
    disabled: uploading,
  })

  function clearFile() {
    setSelectedFile(null)
    setParseResult(null)
    setTextPreview(null)
  }

  // Clear file when switching between CSV and analysis file types
  function handleFileTypeChange(newType: string) {
    const wasAnalysis = ANALYSIS_FILE_TYPES.has(fileType)
    const isNowAnalysis = ANALYSIS_FILE_TYPES.has(newType)
    if (wasAnalysis !== isNowAnalysis && selectedFile) {
      clearFile()
    }
    setFileType(newType)
  }

  async function handleUpload() {
    if (!selectedFile || !selectedCategoryId || !selectedCountryId || !fileType) {
      toast.error('Please select a category, country, file type, and file')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('category_id', selectedCategoryId)
      formData.append('country_id', selectedCountryId)
      formData.append('file_type', fileType)
      if (parseResult?.rowCount) {
        formData.append('row_count', String(parseResult.rowCount))
      }

      const res = await fetch('/api/research/files', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Upload failed')
      }

      toast.success('File uploaded successfully')
      onUploadComplete(json.data)
      clearFile()
      setFileType('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const canUpload =
    selectedFile &&
    selectedCategoryId &&
    selectedCountryId &&
    fileType &&
    !uploading &&
    !parsing

  const dropzoneLabel = isAnalysisType
    ? 'Drag & drop an MD, JSON, or TXT file'
    : 'Drag & drop a CSV file, or click to browse'

  const dropzoneHint = isAnalysisType
    ? 'MD, JSON, or TXT files up to 50MB'
    : 'CSV or TXT files up to 50MB'

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Upload Research File</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upload raw data (CSV) or pre-analyzed files (MD/JSON).
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* File Type Select */}
        <div className="space-y-2">
          <Label>File Type</Label>
          <Select value={fileType} onValueChange={handleFileTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select file type" />
            </SelectTrigger>
            <SelectContent>
              {FILE_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {FILE_TYPE_LABELS[ft]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAnalysisType && (
            <p className="text-xs text-blue-600">
              Analysis files skip AI processing — upload your own analysis to save API costs.
            </p>
          )}
        </div>

        {/* Dropzone */}
        {!selectedFile ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            {isDragActive ? (
              <p className="text-sm text-primary font-medium">
                Drop the file here
              </p>
            ) : (
              <div>
                <p className="text-sm font-medium">{dropzoneLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">{dropzoneHint}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* File Info */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                    {parseResult &&
                      ` \u00b7 ${formatNumber(parseResult.rowCount)} rows`}
                    {parseResult?.detectedType &&
                      ` \u00b7 Detected: ${FILE_TYPE_LABELS[parseResult.detectedType]}`}
                    {isAnalysisType && ' \u00b7 Analysis file'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFile}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Parse Errors (CSV only) */}
            {parseResult && parseResult.errors.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">
                    CSV Warnings
                  </span>
                </div>
                <ul className="text-xs text-yellow-700 space-y-0.5">
                  {parseResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Text Preview (Analysis files) */}
            {textPreview && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 border-b">
                  <span className="text-xs font-medium">File Preview</span>
                </div>
                <pre className="p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {textPreview}
                </pre>
              </div>
            )}

            {/* Preview Table (CSV only) */}
            {parseResult && parseResult.preview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 border-b">
                  <span className="text-xs font-medium">
                    Preview (first {parseResult.preview.length} rows)
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[200px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {parseResult.headers
                          .filter((h) => h.length > 0)
                          .slice(0, 6)
                          .map((header, i) => (
                            <th
                              key={i}
                              className="text-left p-2 font-medium whitespace-nowrap"
                            >
                              {header.length > 20
                                ? header.slice(0, 20) + '...'
                                : header}
                            </th>
                          ))}
                        {parseResult.headers.filter((h) => h.length > 0)
                          .length > 6 && (
                          <th className="text-left p-2 font-medium text-muted-foreground">
                            +
                            {parseResult.headers.filter((h) => h.length > 0)
                              .length - 6}{' '}
                            more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.preview.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {row
                            .slice(
                              parseResult.headers[0] === '' ? 1 : 0,
                              (parseResult.headers[0] === '' ? 1 : 0) + 6
                            )
                            .map((cell, j) => (
                              <td
                                key={j}
                                className="p-2 whitespace-nowrap max-w-[150px] truncate"
                              >
                                {cell || '-'}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Button */}
        {selectedFile && (
          <Button
            onClick={handleUpload}
            disabled={!canUpload}
            className="w-full"
          >
            {uploading
              ? 'Uploading...'
              : parsing
                ? 'Parsing...'
                : 'Upload File'}
          </Button>
        )}

        {/* Missing selection hints */}
        {selectedFile && (!selectedCategoryId || !selectedCountryId) && (
          <p className="text-xs text-muted-foreground text-center">
            Select a category and country above to upload.
          </p>
        )}
      </div>
    </div>
  )
}
