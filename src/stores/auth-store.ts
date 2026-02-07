import { create } from 'zustand'
import type { LbUser } from '@/types'

interface AuthState {
  user: LbUser | null
  isLoading: boolean
  setUser: (user: LbUser | null) => void
  clearUser: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  clearUser: () => set({ user: null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}))
