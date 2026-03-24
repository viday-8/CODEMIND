import { useMutation } from '@tanstack/react-query'
import { api } from './client'
import { useAuthStore } from '../store/auth.store'
import type { UserPublic } from '@codemind/shared'

interface AuthResponse {
  user: UserPublic
  token: string
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const { data } = await api.post<{ data: AuthResponse }>('/auth/login', body)
      return data.data
    },
    onSuccess: ({ user, token }) => setAuth(user, token),
  })
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)
  return useMutation({
    mutationFn: async (body: { email: string; name: string; password: string }) => {
      const { data } = await api.post<{ data: AuthResponse }>('/auth/register', body)
      return data.data
    },
    onSuccess: ({ user, token }) => setAuth(user, token),
  })
}
