import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AsinLookupPageClient } from '@/components/asin-lookup/AsinLookupPageClient'

export default async function AsinLookupPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [countriesResult, lookupsResult, searchesResult, reviewsResult, intelligenceResult] = await Promise.all([
    supabase
      .from('lb_countries')
      .select('id, name, code, language, amazon_domain, flag_emoji, currency, title_limit, bullet_limit, bullet_count, description_limit, search_terms_limit, is_active, created_at')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('lb_asin_lookups')
      .select(
        'id, asin, country_id, marketplace_domain, title, brand, price, price_initial, currency, rating, reviews_count, images, sales_rank, is_prime_eligible, amazon_choice, sales_volume, deal_type, coupon, parent_asin, tags, notes, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('lb_keyword_searches')
      .select(
        'id, keyword, country_id, marketplace_domain, total_results_count, pages_fetched, tags, notes, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('lb_asin_reviews')
      .select(
        'id, asin, country_id, marketplace_domain, total_reviews, overall_rating, total_pages_fetched, sort_by, status, error_message, tags, notes, created_at, updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('lb_market_intelligence')
      .select(
        'id, keyword, keywords, country_id, marketplace_domain, max_competitors, top_asins, selected_asins, status, progress, error_message, tokens_used, oxylabs_calls_used, tags, notes, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <AsinLookupPageClient
      countries={countriesResult.data || []}
      initialLookups={lookupsResult.data || []}
      initialSearches={searchesResult.data || []}
      initialReviews={reviewsResult.data || []}
      initialIntelligence={intelligenceResult.data || []}
    />
  )
}
