'use client'

/**
 * RufusDashboardWidget
 *
 * Compact status banner — sits at top of /rufus-qna and refreshes every 10s.
 * Shows queue depth, in-progress, completed-today, ETA, Chrome runner heartbeat.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Wifi,
  WifiOff,
  DollarSign,
  RefreshCw,
} from 'lucide-react'

interface DashboardData {
  status_counts: Record<string, number>
  queue_depth: number
  throughput: {
    completed_today: number
    completed_week: number
    completed_all_time: number
  }
  cost: {
    today_usd: number
    week_usd: number
    all_time_usd: number
    avg_per_loop_usd: number
  }
  median_durations_ms: {
    pass1: number
    pass2: number
    synthesis: number
    total: number
  }
  eta_ms: number
  eta_human: string
  recent_failures: Array<{
    id: string
    asin: string
    status: string
    error_phase: string | null
    error_message: string | null
    created_at: string
  }>
  chrome_runner: {
    status: 'green' | 'yellow' | 'red'
    last_poll_at: string | null
    last_poll_ago_ms: number | null
    last_poll_asin: string | null
  }
}

const POLL_MS = 10_000

export function RufusDashboardWidget() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFailures, setShowFailures] = useState(false)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/rufus-qna/dashboard')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const id = setInterval(fetchDashboard, POLL_MS)
    return () => clearInterval(id)
  }, [fetchDashboard])

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-3 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data) return null

  const inProgress =
    data.queue_depth -
    (data.status_counts.queued || 0)

  const runnerLabel =
    data.chrome_runner.status === 'green'
      ? 'Live'
      : data.chrome_runner.status === 'yellow'
        ? 'Idle'
        : 'Offline'
  const runnerColor =
    data.chrome_runner.status === 'green'
      ? 'text-green-700 bg-green-50 border-green-300'
      : data.chrome_runner.status === 'yellow'
        ? 'text-yellow-800 bg-yellow-50 border-yellow-300'
        : 'text-red-700 bg-red-50 border-red-300'
  const runnerIcon =
    data.chrome_runner.status === 'red' ? (
      <WifiOff className="h-3 w-3" />
    ) : (
      <Wifi className="h-3 w-3" />
    )
  const lastPollRelative = data.chrome_runner.last_poll_ago_ms
    ? formatAgo(data.chrome_runner.last_poll_ago_ms)
    : 'never'

  return (
    <div className="rounded-lg border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-700" />
          <span className="text-sm font-semibold text-blue-900">Rufus Pipeline</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium ${runnerColor}`}
            title={`Last poll: ${lastPollRelative}${data.chrome_runner.last_poll_asin ? ` on ${data.chrome_runner.last_poll_asin}` : ''}`}
          >
            {runnerIcon} Runner: {runnerLabel}
            <span className="opacity-70">· {lastPollRelative}</span>
          </span>
          <button
            onClick={fetchDashboard}
            className="text-[11px] text-blue-700 hover:text-blue-900"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat
          label="Queue"
          value={data.status_counts.queued || 0}
          icon={<Clock className="h-3 w-3" />}
          color="text-blue-900"
        />
        <Stat
          label="In progress"
          value={inProgress}
          icon={<Loader2 className="h-3 w-3" />}
          color="text-yellow-800"
        />
        <Stat
          label="Done today"
          value={data.throughput.completed_today}
          icon={<CheckCircle2 className="h-3 w-3" />}
          color="text-green-800"
        />
        <Stat
          label="Failed"
          value={data.status_counts.failed || 0}
          icon={<AlertTriangle className="h-3 w-3" />}
          color="text-red-700"
          onClick={() =>
            data.recent_failures.length > 0 && setShowFailures((v) => !v)
          }
        />
        <Stat
          label="ETA"
          value={data.eta_human}
          icon={<Clock className="h-3 w-3" />}
          color="text-indigo-800"
        />
        <Stat
          label="Cost today"
          value={`$${data.cost.today_usd.toFixed(2)}`}
          icon={<DollarSign className="h-3 w-3" />}
          color="text-purple-800"
          title={`All-time: $${data.cost.all_time_usd.toFixed(2)} · avg $${data.cost.avg_per_loop_usd.toFixed(3)}/loop`}
        />
      </div>

      {showFailures && data.recent_failures.length > 0 && (
        <div className="rounded bg-white border border-red-200 p-2 text-[11px] space-y-1 max-h-40 overflow-y-auto">
          <div className="font-semibold text-red-800">Recent failures</div>
          {data.recent_failures.map((f) => (
            <div key={f.id} className="flex gap-2 items-start">
              <span className="font-mono text-red-700">{f.asin}</span>
              <span className="text-red-600 italic">{f.error_phase}</span>
              <span className="text-gray-700 truncate">{f.error_message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  color,
  onClick,
  title,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={!onClick}
      className={`flex items-center gap-2 px-2 py-1.5 bg-white rounded border ${onClick ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'} text-left`}
    >
      <div className={color}>{icon}</div>
      <div>
        <div className={`text-sm font-semibold ${color}`}>{value}</div>
        <div className="text-[10px] text-gray-600">{label}</div>
      </div>
    </button>
  )
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}
