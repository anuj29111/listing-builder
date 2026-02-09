import { createClient } from '@/lib/supabase/server'
import { SpeedModeClient } from '@/components/listings/speed/SpeedModeClient'

export default async function SpeedModePage() {
  const supabase = createClient()

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

  return (
    <SpeedModeClient
      categories={catResult.data || []}
      countries={countryResult.data || []}
    />
  )
}
