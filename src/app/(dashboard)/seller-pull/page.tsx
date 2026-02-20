import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SellerPullClient } from '@/components/seller-pull/SellerPullClient'

export default async function SellerPullPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: countries } = await supabase
    .from('lb_countries')
    .select('id, name, code, language, amazon_domain, flag_emoji, is_active')
    .eq('is_active', true)
    .order('name')

  return <SellerPullClient countries={countries || []} />
}
