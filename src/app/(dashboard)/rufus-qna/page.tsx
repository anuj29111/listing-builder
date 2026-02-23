import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RufusQnAPageClient } from '@/components/rufus-qna/RufusQnAPageClient'

export default async function RufusQnAPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [countriesResult, miResult] = await Promise.all([
    supabase
      .from('lb_countries')
      .select('id, name, code, amazon_domain, flag_emoji, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('lb_market_intelligence')
      .select('id, keyword, keywords, country_id, marketplace_domain, selected_asins, status, created_at')
      .eq('status', 'completed')
      .not('selected_asins', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return (
    <RufusQnAPageClient
      countries={countriesResult.data || []}
      miRecords={miResult.data || []}
    />
  )
}
