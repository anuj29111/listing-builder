import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { LbUser } from '@/types'

export interface AuthenticatedUser {
  authUser: { id: string; email: string }
  lbUser: LbUser
}

/**
 * Get the authenticated user from the current request context.
 * Returns both the Supabase auth user and the lb_users row.
 * Throws if not authenticated or lb_users row not found.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Not authenticated')
  }

  const { data: lbUser, error: lbError } = await supabase
    .from('lb_users')
    .select('*')
    .eq('auth_id', user.id)
    .single()

  if (lbError || !lbUser) {
    throw new Error('User record not found')
  }

  return {
    authUser: { id: user.id, email: user.email ?? '' },
    lbUser: lbUser as LbUser,
  }
}

/**
 * Same as getAuthenticatedUser but also verifies admin role.
 * Throws if user is not an admin.
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const result = await getAuthenticatedUser()

  if (result.lbUser.role !== 'admin') {
    throw new Error('Admin access required')
  }

  return result
}

/**
 * Upsert a user into lb_users after OAuth login.
 * Uses admin client to bypass RLS.
 * First user automatically gets admin role.
 */
export async function upsertLoginUser(authUser: {
  id: string
  email?: string
  user_metadata?: { full_name?: string; avatar_url?: string }
}): Promise<LbUser> {
  const adminClient = createAdminClient()

  // Check if user already exists
  const { data: existingUser } = await adminClient
    .from('lb_users')
    .select('*')
    .eq('auth_id', authUser.id)
    .single()

  if (existingUser) {
    // Update name/avatar (may change via Google profile)
    const { data: updated } = await adminClient
      .from('lb_users')
      .update({
        full_name: authUser.user_metadata?.full_name || existingUser.full_name,
        avatar_url: authUser.user_metadata?.avatar_url || existingUser.avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_id', authUser.id)
      .select()
      .single()
    return (updated ?? existingUser) as LbUser
  }

  // New user — check if this is the first user ever
  const { count } = await adminClient
    .from('lb_users')
    .select('*', { count: 'exact', head: true })

  const role = count === 0 ? 'admin' : 'user'

  const { data: newUser, error } = await adminClient
    .from('lb_users')
    .insert({
      auth_id: authUser.id,
      email: authUser.email ?? '',
      full_name: authUser.user_metadata?.full_name ?? null,
      avatar_url: authUser.user_metadata?.avatar_url ?? null,
      role,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`)
  }

  return newUser as LbUser
}
