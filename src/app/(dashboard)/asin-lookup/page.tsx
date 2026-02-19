import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AsinLookupClient } from '@/components/asin-lookup/AsinLookupClient'

export default async function AsinLookupPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [countriesResult, lookupsResult] = await Promise.all([
    supabase
      .from('lb_countries')
      .select('id, name, code, language, amazon_domain, flag_emoji, currency, title_limit, bullet_limit, bullet_count, description_limit, search_terms_limit, is_active, created_at')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('lb_asin_lookups')
      .select(
        'id, asin, country_id, marketplace_domain, title, brand, price, currency, rating, reviews_count, images, sales_rank, is_prime_eligible, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  return (
    <AsinLookupClient
      countries={countriesResult.data || []}
      initialLookups={lookupsResult.data || []}
    />
  )
}
