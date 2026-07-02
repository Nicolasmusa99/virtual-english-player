import type { Phrase } from '@/lib/srt'

export interface SessionData {
  phrases: Phrase[]
  delay: number
  speedIdx: number
  ccOn: boolean
  filter: 'all' | 'sel'
}

export function sessionKey(fileName: string, fileSize: number): string {
  return `ve-session:${fileName}:${fileSize}`
}

export function saveSession(key: string, data: SessionData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* swallow QuotaExceededError and similar */ }
}

export function loadSession(key: string): SessionData | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}
