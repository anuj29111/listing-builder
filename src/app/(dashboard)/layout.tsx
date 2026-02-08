import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layouts/Sidebar'
import { Header } from '@/components/layouts/Header'
import { AuthProvider } from '@/components/providers/AuthProvider'
import type { LbUser } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch the lb_users row for role info
  const { data: lbUser } = await supabase
    .from('lb_users')
    .select('*')
    .eq('auth_id', user.id)
    .single()

  // Fallback if row is missing (shouldn't happen after callback upsert)
  const userRecord = (lbUser as LbUser | null) ?? {
    id: '',
    auth_id: user.id,
    email: user.email ?? '',
    full_name: (user.user_metadata?.full_name as string) ?? null,
    role: 'user' as const,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
