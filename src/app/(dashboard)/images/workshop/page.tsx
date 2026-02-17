import { createClient } from '@/lib/supabase/server'
import { WorkshopClient } from '@/components/images/workshop/WorkshopClient'

export default async function WorkshopPage() {
  const supabase = createClient()

  const [listingsRes, categoriesRes, countriesRes] = await Promise.all([
    supabase
      .from('lb_listings')
      .select('id, title, generation_context')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('lb_categories')
      .select('id, name, brand')
      .order('name'),
    supabase
      .from('lb_countries')
      .select('id, name, code, flag_emoji')
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <WorkshopClient
      listings={listingsRes.data || []}
      categories={categoriesRes.data || []}
      countries={countriesRes.data || []}
    />
  )
}
