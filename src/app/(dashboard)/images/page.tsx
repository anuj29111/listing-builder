import { createClient } from '@/lib/supabase/server'
import { ImageBuilderClient } from '@/components/images/ImageBuilderClient'

export default async function ImagesPage() {
  const supabase = createClient()

  // Fetch listings for the dropdown (only id, title, generation_context)
  const { data: listings } = await supabase
    .from('lb_listings')
    .select('id, title, generation_context')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <ImageBuilderClient
      listings={listings || []}
    />
  )
}
