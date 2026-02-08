import Papa from 'papaparse'
import type { FileType } from '@/types'

export interface CSVParseResult {
  headers: string[]
  rowCount: number
  preview: string[][] // first 5 data rows
  detectedType: FileType | null
  errors: string[]
}

function stripBOM(str: string): string {
  return str.replace(/^\uFEFF/, '')
}

function normalizeHeaders(raw: string[]): string[] {
  return raw.map((h) => stripBOM(h).trim())
}

export function detectFileType(headers: string[]): FileType | null {
  const normalized = headers
    .map((h) => h.toLowerCase())
    .filter((h) => h.length > 0)

  // Keywords CSV (DataDive): has "search terms" and "sv"
  if (
    normalized.some((h) => h.includes('search terms')) &&
    normalized.some((h) => h === 'sv' || h.includes('search volume'))
  ) {
    return 'keywords'
  }

  // Reviews CSV (Apify): has "rating", "body", "author"
  if (
    normalized.some((h) => h === 'rating') &&
    normalized.some((h) => h === 'body') &&
    normalized.some((h) => h === 'author')
  ) {
    return 'reviews'
  }

  // Q&A CSV: first header starts with "q1:" or has "question"/"answer" columns
  if (
    normalized.some((h) => h.startsWith('q1:') || h.startsWith('q1 :')) ||
    (normalized.some((h) => h === 'question') &&
      normalized.some((h) => h === 'answer'))
  ) {
    return 'qna'
  }

  return null
}

export function parseCSV(file: File): Promise<CSVParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const allRows = results.data as string[][]
        if (allRows.length === 0) {
          resolve({
            headers: [],
            rowCount: 0,
            preview: [],
            detectedType: null,
            errors: ['File is empty'],
          })
          return
        }

        const headers = normalizeHeaders(allRows[0] || [])
        const dataRows = allRows.slice(1)
        const preview = dataRows.slice(0, 5)

        // For Q&A files, check if the data itself starts with Q1: pattern
        // (since these files may not have a traditional header row)
        let detectedType = detectFileType(headers)
        if (!detectedType && allRows.length > 0) {
          const firstCell = stripBOM((allRows[0][0] || '').trim()).toLowerCase()
          if (firstCell.startsWith('q1:') || firstCell.startsWith('q1 :')) {
            detectedType = 'qna'
          }
        }

        const errors = results.errors
          .filter((e) => e.type === 'Quotes' || e.type === 'Delimiter')
          .map((e) => `Row ${e.row}: ${e.message}`)

        resolve({
          headers,
          rowCount: dataRows.length,
          preview,
          detectedType,
          errors: errors.slice(0, 5), // limit to 5 errors
        })
      },
      error: (err) => {
        resolve({
          headers: [],
          rowCount: 0,
          preview: [],
          detectedType: null,
          errors: [err.message],
        })
      },
    })
  })
}
