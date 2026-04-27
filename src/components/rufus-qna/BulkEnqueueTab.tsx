'use client'

/**
 * BulkEnqueueTab
 *
 * Paste ASINs (one per line / comma / space separated). Enqueue ALL through the
 * full Amy loop in one POST. Shows per-ASIN result row. Optional dedup by
 * "skip if synthesized within last N days".
 */
import { useState } from 'react'
import {
  Loader2,
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
} from 'lucide-react'

interface Country {
  id: string
  name: string
  amazon_domain: string
  flag_emoji: string | null
}

interface AsinResult {
  asin: string
  status:
    | 'created'
    | 'skipped_recent_synthesis'
    | 'skipped_active_loop'
    | 'invalid_asin'
    | 'error'
  loop_run_id?: string
  job_id?: string
  reason?: string
}

interface BulkResponse {
  success: boolean
  summary: {
    total_input: number
    total_unique: number
    created: number
    skipped_recent: number
    skipped_active: number
    invalid: number
    errors: number
  }
  results: AsinResult[]
}

interface BulkEnqueueTabProps {
  countries: Country[]
}

export function BulkEnqueueTab({ countries }: BulkEnqueueTabProps) {
  const [countryId, setCountryId] = useState(countries[0]?.id || '')
  const [asinText, setAsinText] = useState('')
  const [skipDays, setSkipDays] = useState<number | ''>(30)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BulkResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedAsins = parseAsins(asinText)

  const handleSubmit = async () => {
    if (parsedAsins.length === 0 || !countryId) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/rufus-qna/bulk-enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asins: parsedAsins,
          country_id: countryId,
          skip_if_synthesized_within_days:
            typeof skipDays === 'number' ? skipDays : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Bulk enqueue failed')
        return
      }
      setResult(data as BulkResponse)
      // Clear input for next batch
      setAsinText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Upload className="h-5 w-5 text-emerald-700 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">
              Bulk Run — Full Amy Loop on many ASINs
            </h3>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              Paste up to 1000 ASINs. Each ASIN runs Pass 1 (5 framing Qs) → Pass 2 (15 follow-ups) → Synthesis automatically. Sequential execution, gated by Chrome runner availability.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-emerald-900/80">Country</label>
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="w-full mt-1 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name} ({c.amazon_domain})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="text-xs font-medium text-emerald-900/80">
              Skip if synthesized within last N days
            </label>
            <input
              type="number"
              value={skipDays}
              onChange={(e) =>
                setSkipDays(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="30 (or empty to allow all)"
              className="w-full mt-1 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              min={0}
            />
          </div>

          <div className="md:col-span-1">
            <label className="text-xs font-medium text-emerald-900/80">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Q2 2026 batch"
              className="w-full mt-1 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-emerald-900/80">
            ASINs ({parsedAsins.length} valid)
          </label>
          <textarea
            value={asinText}
            onChange={(e) => setAsinText(e.target.value)}
            placeholder={`B0XXXXXXXXX\nB0YYYYYYYYY\nB0ZZZZZZZZZ\n\n...or comma / space separated`}
            rows={10}
            className="w-full mt-1 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={parsedAsins.length === 0 || !countryId || submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-2.5 text-sm transition"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enqueueing {parsedAsins.length} ASINs...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Enqueue {parsedAsins.length} Amy Loops
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="text-sm font-semibold">Batch result</h4>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            <ResultStat label="Input" value={result.summary.total_input} />
            <ResultStat label="Unique" value={result.summary.total_unique} />
            <ResultStat
              label="Created"
              value={result.summary.created}
              color="green"
            />
            <ResultStat
              label="Skipped (recent)"
              value={result.summary.skipped_recent}
              color="amber"
            />
            <ResultStat
              label="Skipped (active)"
              value={result.summary.skipped_active}
              color="amber"
            />
            <ResultStat
              label="Errors"
              value={result.summary.errors + result.summary.invalid}
              color={
                result.summary.errors + result.summary.invalid > 0
                  ? 'red'
                  : undefined
              }
            />
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-blue-700 hover:text-blue-900 font-medium">
              View per-ASIN result ({result.results.length})
            </summary>
            <div className="mt-2 max-h-72 overflow-y-auto border rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left p-1.5 font-medium">ASIN</th>
                    <th className="text-left p-1.5 font-medium">Status</th>
                    <th className="text-left p-1.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.asin} className="border-t">
                      <td className="p-1.5 font-mono">{r.asin}</td>
                      <td className="p-1.5">
                        <ResultBadge status={r.status} />
                      </td>
                      <td className="p-1.5 text-gray-600">{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function parseAsins(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9]{10}$/.test(s))
    )
  )
}

function ResultStat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: 'green' | 'amber' | 'red'
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-700 bg-green-50'
      : color === 'amber'
        ? 'text-amber-700 bg-amber-50'
        : color === 'red'
          ? 'text-red-700 bg-red-50'
          : 'text-gray-700 bg-gray-50'
  return (
    <div className={`rounded p-2 ${colorClass}`}>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px]">{label}</div>
    </div>
  )
}

function ResultBadge({ status }: { status: AsinResult['status'] }) {
  const config = {
    created: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: 'bg-green-50 text-green-700 border-green-200',
      label: 'Created',
    },
    skipped_recent_synthesis: {
      icon: <SkipForward className="h-3 w-3" />,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Skipped (recent)',
    },
    skipped_active_loop: {
      icon: <Clock className="h-3 w-3" />,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      label: 'Skipped (active)',
    },
    invalid_asin: {
      icon: <XCircle className="h-3 w-3" />,
      color: 'bg-red-50 text-red-600 border-red-200',
      label: 'Invalid',
    },
    error: {
      icon: <AlertCircle className="h-3 w-3" />,
      color: 'bg-red-50 text-red-700 border-red-200',
      label: 'Error',
    },
  }
  const c = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${c.color}`}
    >
      {c.icon} {c.label}
    </span>
  )
}
