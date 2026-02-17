import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()

  // Fetch listing, sections, workshops, and images in parallel
  const [listingResult, sectionsResult, workshopsResult] = await Promise.all([
    supabase
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(id, name, asin, category_id, attributes), country:lb_countries(*), creator:lb_users!created_by(full_name)'
      )
      .eq('id', params.id)
      .single(),
    supabase
      .from('lb_listing_sections')
      .select('*')
      .eq('listing_id', params.id),
    supabase
      .from('lb_image_workshops')
      .select('*')
      .eq('listing_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (!listingResult.data) {
    redirect('/listings')
  }

  const listing = listingResult.data
  const sections = sectionsResult.data || []

  // Get workshops and their images
  const workshops = workshopsResult.data || []
  const workshopIds = workshops.map((w) => w.id)

  let images: unknown[] = []
  if (workshopIds.length > 0) {
    const { data: imageData } = await supabase
      .from('lb_image_generations')
      .select('*')
      .in('workshop_id', workshopIds)
      .order('created_at', { ascending: true })
    images = imageData || []
  }

  // Fetch category for research lookup
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

  return (
    <ListingDetailClient
      listing={listing}
      sections={sections}
      category={category}
      workshops={workshops}
      images={images}
    />
  )
}
