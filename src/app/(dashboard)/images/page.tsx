import { createClient } from '@/lib/supabase/server'
import { ImageBuilderClient } from '@/components/images/ImageBuilderClient'

export default async function ImagesPage() {
  const supabase = createClient()

  // Fetch listings, categories, and countries in parallel
  const [listingsResult, categoriesResult, countriesResult] = await Promise.all([
    supabase
      .from('lb_listings')
      .select('id, title, generation_context, country_id, product_type:lb_product_types(name, asin, category_id)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('lb_categories')
      .select('*')
      .order('name'),
    supabase
      .from('lb_countries')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  // Supabase returns product_type as array from join — normalize to single object
  const listings = (listingsResult.data || []).map((l) => ({
    ...l,
    product_type: Array.isArray(l.product_type) ? l.product_type[0] || null : l.product_type,
  }))

  return (
    <ImageBuilderClient
      listings={listings}
      categories={categoriesResult.data || []}
      countries={countriesResult.data || []}
    />
  )
}
