import { createClient } from '@/lib/supabase/server'
import { ListingsHistoryClient } from '@/components/listings/ListingsHistoryClient'

export default async function ListingsPage() {
  const supabase = createClient()

  const [listingsResult, countriesResult] = await Promise.all([
    supabase
      .from('lb_listings')
      .select(`
        *,
        product_type:lb_product_types(name, asin, category_id),
        country:lb_countries(name, code, flag_emoji, language),
        creator:lb_users!created_by(full_name)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('lb_countries')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  return (
    <ListingsHistoryClient
      listings={listingsResult.data || []}
      countries={countriesResult.data || []}
    />
  )
}
