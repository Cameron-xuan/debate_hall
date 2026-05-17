const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export function apiUrl(path: string) {
  return `${base}${path}`
}

export function wsUrl(roomId: string, slot: string, name: string) {
  const params = new URLSearchParams({ slot, name }).toString()
  if (base) {
    const host = base.replace(/^https?:\/\//, '')
    const proto = base.startsWith('https') ? 'wss' : 'ws'
    return `${proto}://${host}/ws/${roomId}?${params}`
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/${roomId}?${params}`
}
