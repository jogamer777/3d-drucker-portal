import { create } from 'zustand'

interface User {
  id: number
  email: string
  role: 'admin' | 'power_user' | 'normal'
  balance_cents: number
  storage_used_bytes: number
  storage_limit_bytes: number
  is_blocked: boolean
}

interface AuthState {
  accessToken: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: (token, user) => set({ accessToken: token, user }),
  setAccessToken: (token) => set({ accessToken: token }),
  logout: () => set({ accessToken: null, user: null }),
}))

// Hilfsfunktion: Guthaben in Euro formatieren
export const formatBalance = (cents: number): string => {
  return (cents / 100).toFixed(2) + ' €'
}
