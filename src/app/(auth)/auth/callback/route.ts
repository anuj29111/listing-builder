import { createClient } from '@/lib/supabase/server'
import { upsertLoginUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Use production URL, not origin (which can be wrong after Supabase changes)
  const appUrl = 'https://listing-builder-production.up.railway.app'

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback error:', error.message, error.status)
    }
    if (!error) {
      // Get the authenticated user from the new session
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        try {
          // Upsert lb_users row (first user becomes admin)
          await upsertLoginUser({
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata as {
              full_name?: string
              avatar_url?: string
            },
          })
        } catch (e) {
          // Log but don't block login
          console.error('Failed to upsert user:', e)
        }
      }

      return NextResponse.redirect(`${appUrl}${next}`)
    }
  }

  return NextResponse.redirect(`${appUrl}/login?error=auth`)
}
