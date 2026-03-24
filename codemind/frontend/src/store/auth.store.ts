import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserPublic } from '@codemind/shared'

interface AuthState {
  user: UserPublic | null
  token: string | null
  setAuth: (user: UserPublic, token: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),
    }),
    { name: 'codemind-auth' },
  ),
)
