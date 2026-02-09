import { createClient } from '@/lib/supabase/server'
import { ListingWizard } from '@/components/listings/wizard/ListingWizard'

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: { edit?: string }
}) {
  const supabase = createClient()

  // Fetch categories and countries in parallel
  const [catResult, countryResult] = await Promise.all([
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

  const categories = catResult.data || []
  const countries = countryResult.data || []

  // If editing an existing listing, fetch it with sections
  let editData = null
  if (searchParams.edit) {
    const { data: listing } = await supabase
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(id, name, asin, category_id, attributes), country:lb_countries(*), creator:lb_users!created_by(full_name)'
      )
      .eq('id', searchParams.edit)
      .single()

    if (listing) {
      const { data: sections } = await supabase
        .from('lb_listing_sections')
        .select('*')
        .eq('listing_id', listing.id)

      // Get the category for edit mode
      const categoryId = listing.product_type?.category_id ||
        (listing.generation_context as Record<string, string>)?.categoryId
      let category = null
      if (categoryId) {
        const { data: cat } = await supabase
          .from('lb_categories')
          .select('*')
          .eq('id', categoryId)
          .single()
        category = cat
      }

      editData = {
        listing,
        sections: sections || [],
        category,
        country: listing.country,
        productType: listing.product_type || null,
      }
    }
  }

  return (
    <ListingWizard
      categories={categories}
      countries={countries}
      editData={editData}
    />
  )
}
