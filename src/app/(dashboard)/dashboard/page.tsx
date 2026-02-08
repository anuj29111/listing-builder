import { createClient } from '@/lib/supabase/server'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { RecentListings } from '@/components/dashboard/RecentListings'
import { QuickActions } from '@/components/dashboard/QuickActions'

export default async function DashboardPage() {
  const supabase = createClient()

  // Fetch all counts in parallel
  const [categoriesResult, countriesResult, researchFilesResult, listingsResult] =
    await Promise.all([
      supabase.from('lb_categories').select('*', { count: 'exact', head: true }),
      supabase
        .from('lb_countries')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('lb_research_files')
        .select('*', { count: 'exact', head: true }),
      supabase.from('lb_listings').select('*', { count: 'exact', head: true }),
    ])

  const stats = {
    categories: categoriesResult.count ?? 0,
    activeCountries: countriesResult.count ?? 0,
    researchFiles: researchFilesResult.count ?? 0,
    listings: listingsResult.count ?? 0,
  }

  // Fetch recent listings (up to 5)
  const { data: recentListings } = await supabase
    .from('lb_listings')
    .select('id, title, status, created_at, country_id')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your listing builder activity.
        </p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentListings listings={recentListings ?? []} />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
