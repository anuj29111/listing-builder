import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/SettingsClient'
import type { LbUser, LbCategory, LbAdminSetting } from '@/types'

export default async function SettingsPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get current user's lb_users row
  const { data: lbUser } = await supabase
    .from('lb_users')
    .select('*')
    .eq('auth_id', user.id)
    .single()

  if (!lbUser) redirect('/dashboard')

  const isAdmin = lbUser.role === 'admin'

  // Fetch data in parallel
  const [categoriesResult, usersResult, settingsResult] = await Promise.all([
    supabase.from('lb_categories').select('*').order('brand').order('name'),
    isAdmin
      ? supabase.from('lb_users').select('*').order('created_at')
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from('lb_admin_settings').select('*').order('key')
      : Promise.resolve({ data: null }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage categories, users, and application settings.
        </p>
      </div>

      <SettingsClient
        currentUser={lbUser as LbUser}
        categories={(categoriesResult.data ?? []) as LbCategory[]}
        users={isAdmin ? ((usersResult.data ?? []) as LbUser[]) : []}
        settings={isAdmin ? ((settingsResult.data ?? []) as LbAdminSetting[]) : []}
      />
    </div>
  )
}
