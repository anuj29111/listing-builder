import { FolderOpen, Globe, FileText, LayoutList } from 'lucide-react'

interface StatsCardsProps {
  stats: {
    categories: number
    activeCountries: number
    researchFiles: number
    listings: number
  }
}

const cards = [
  {
    key: 'categories' as const,
    label: 'Categories',
    icon: FolderOpen,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    key: 'activeCountries' as const,
    label: 'Active Countries',
    icon: Globe,
    color: 'text-green-600 bg-green-50',
  },
  {
    key: 'researchFiles' as const,
    label: 'Research Files',
    icon: FileText,
    color: 'text-orange-600 bg-orange-50',
  },
  {
    key: 'listings' as const,
    label: 'Total Listings',
    icon: LayoutList,
    color: 'text-purple-600 bg-purple-50',
  },
]

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-3xl font-bold mt-1">{stats[card.key]}</p>
            </div>
            <div className={`rounded-lg p-3 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
