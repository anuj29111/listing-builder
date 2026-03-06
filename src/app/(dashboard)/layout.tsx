import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layouts/Sidebar'
import { Header } from '@/components/layouts/Header'
import { AuthProvider } from '@/components/providers/AuthProvider'
import type { LbUser } from '@/types'

// Dev auth bypass — local development only, never set in production
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'
const DEV_USER_RECORD: LbUser = {
  id: 'dev-bypass-user',
  auth_id: 'dev-bypass-user',
  email: 'reports@chalkola.com',
  full_name: 'Reports (Dev)',
  role: 'admin',
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
  let userRecord: LbUser

  if (DEV_AUTH_BYPASS) {
    user = { id: 'dev-bypass-user', email: 'reports@chalkola.com' }
    userRecord = DEV_USER_RECORD
  } else {
    const supabase = createClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      redirect('/login')
    }

    user = authUser

    // Fetch the lb_users row for role info
    const { data: lbUser } = await supabase
      .from('lb_users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single()

    // Fallback if row is missing (shouldn't happen after callback upsert)
    userRecord = (lbUser as LbUser | null) ?? {
      id: '',
      auth_id: authUser.id,
      email: authUser.email ?? '',
      full_name: (authUser.user_metadata?.full_name as string) ?? null,
      role: 'user' as const,
      avatar_url: (authUser.user_metadata?.avatar_url as string) ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  return (
    <AuthProvider lbUser={userRecord}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar userRole={userRecord.role} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={user} lbUser={userRecord} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  )
}
