import { createClient } from '@/lib/supabase/server'
import { APlusClient } from '@/components/aplus/APlusClient'

export default async function APlusPage() {
  const supabase = createClient()

  const [listingsResult, categoriesResult, countriesResult] = await Promise.all([
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
      .select('id, name, code')
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <APlusClient
      listings={listingsResult.data || []}
      categories={categoriesResult.data || []}
      countries={countriesResult.data || []}
    />
  )
}
