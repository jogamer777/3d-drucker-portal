import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Access-Token automatisch im Header senden
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Bei 401 → Refresh-Token versuchen
let isRefreshing = false
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true
      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        const { access_token } = res.data
        useAuthStore.getState().setAccessToken(access_token)
        original.headers.Authorization = `Bearer ${access_token}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
