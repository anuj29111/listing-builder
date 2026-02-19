import { ScanSearch } from 'lucide-react'

export default function AsinLookupLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          Amazon Product Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fetch product data by ASIN or search Amazon by keyword via Oxylabs
        </p>
      </div>

      {/* Tab skeleton */}
      <div className="flex gap-1 border-b">
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        <div className="h-10 w-36 bg-muted animate-pulse rounded" />
      </div>

      {/* Form skeleton */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-3">
          <div className="h-16 bg-muted animate-pulse rounded" />
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-10 w-28 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* History skeleton */}
      <div className="rounded-lg border bg-card divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-muted animate-pulse rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
            </div>
            <div className="h-4 bg-muted animate-pulse rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
