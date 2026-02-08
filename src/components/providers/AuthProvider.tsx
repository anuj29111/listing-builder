'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import type { LbUser } from '@/types'

interface AuthProviderProps {
  lbUser: LbUser
  children: React.ReactNode
}

export function AuthProvider({ lbUser, children }: AuthProviderProps) {
  const setUser = useAuthStore((state) => state.setUser)

  useEffect(() => {
    setUser(lbUser)
  }, [lbUser, setUser])

  return <>{children}</>
}
