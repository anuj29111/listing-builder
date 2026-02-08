'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { User } from '@supabase/supabase-js'
import type { LbUser } from '@/types'

interface HeaderProps {
  user: User
  lbUser: LbUser
}

export function Header({ user, lbUser }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = lbUser.full_name || user.email || 'User'

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b bg-card">
      <h2 className="text-sm font-medium text-muted-foreground">
        Listing Builder
      </h2>

      <div className="flex items-center gap-3">
        {lbUser.role === 'admin' && (
          <Badge variant="secondary" className="text-xs">
            Admin
          </Badge>
        )}
        <div className="flex items-center gap-2 text-sm">
          {lbUser.avatar_url ? (
            <img
              src={lbUser.avatar_url}
              alt=""
              className="h-6 w-6 rounded-full"
            />
          ) : (
            <UserIcon className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">{displayName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
