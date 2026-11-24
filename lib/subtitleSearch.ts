// Buscar subtítulos hechos por personas (2026-11-24): canciones en LRCLIB y películas o
// series en OpenSubtitles. Para películas y canciones conocidas, un subtítulo humano es
// mucho mejor que cualquier transcripción automática. Lo usan /api/subtitles/search y
// /api/subtitles/download; la IA queda para lo que no se encuentre.
//
// LRCLIB: gratis y sin clave (https://lrclib.net/docs). Letras con la hora de cada línea
// (formato LRC), que se pasan a SRT acá.
// OpenSubtitles: clave del "consumer" (OPENSUBTITLES_API_KEY) y login con la cuenta
// (OPENSUBTITLES_USERNAME / _PASSWORD), que sube el cupo diario de descargas. Buscar no
// gasta cupo; descargar sí (una vez por video: después queda guardado con el video).
// Tests: tests/lib/subtitle-search.test.ts (con un fetch falso).
import { srtTime } from '@/lib/srt'

export const USER_AGENT = 'VirtualEnglishPlayer v1.0'
export const LRCLIB_BASE = 'https://lrclib.net'
export const OS_BASE = 'https://api.opensubtitles.com/api/v1'
const MAX_RESULTS = 5

export type SubSource = 'lrclib' | 'opensubtitles'
export type SubResult = {
  source: SubSource
  id: string
  title: string
  detail: string            // artista / año / idioma, para mostrar
  durationSec?: number
  kind: 'song' | 'movie'
}

// ─── Qué buscar a partir del nombre del archivo ──────────────────────────────
// "PLATOS_ALLEGORY_-_The_Cave(video-converter.com) (3).mp4" → "PLATOS ALLEGORY The Cave"
export function queryFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\(?video-converter\.com\)?/gi, ' ')
    .replace(/\((\d+)\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(1080p|720p|480p|2160p|4k|hd|x264|x265|h264|hevc|web-?dl|bluray|brrip|webrip|official (music )?video|lyrics?|audio|subtitulado|sub español)\b/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

// ─── LRCLIB (canciones) ──────────────────────────────────────────────────────
type LrcRecord = { id: number; trackName?: string; artistName?: string; albumName?: string; duration?: number; instrumental?: boolean; syncedLyrics?: string | null }

export async function searchLrclib(q: string, durationSec?: number, fetchImpl: typeof fetch = fetch): Promise<SubResult[]> {
  if (!q.trim()) return []
  const res = await fetchImpl(`${LRCLIB_BASE}/api/search?${new URLSearchParams({ q })}`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  const list = (await res.json()) as LrcRecord[]
  const withSync = (Array.isArray(list) ? list : []).filter(r => r && !r.instrumental && r.syncedLyrics)
  // Más arriba los que duran casi lo mismo que el video (la misma versión del tema).
  if (durationSec) withSync.sort((a, b) => Math.abs((a.duration ?? 1e9) - durationSec) - Math.abs((b.duration ?? 1e9) - durationSec))
  return withSync.slice(0, MAX_RESULTS).map(r => ({
    source: 'lrclib', id: String(r.id), kind: 'song',
    title: r.trackName ?? 'Sin título',
    detail: [r.artistName, r.albumName].filter(Boolean).join(' · '),
    durationSec: r.duration,
  }))
}

export async function downloadLrclib(id: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${LRCLIB_BASE}/api/get/${encodeURIComponent(id)}`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`)
  const rec = (await res.json()) as LrcRecord
  const srt = lrcToSrt(rec.syncedLyrics ?? '')
  if (!srt) throw new Error('Esa letra no tiene tiempos')
  return srt
}

// LRC: "[01:23.45] texto" (puede haber varias marcas en una línea). Cada línea dura hasta
// la siguiente, con un tope (en un solo instrumental largo no queda la línea colgada).
const LRC_MAX_LINE_SEC = 7
export function lrcToSrt(lrc: string): string {
  const lines: { t: number; text: string }[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      lines.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  lines.sort((a, b) => a.t - b.t)
  const cues: { start: number; end: number; text: string }[] = []
  lines.forEach((l, i) => {
    if (!l.text) return               // línea vacía = pausa: solo sirve para cortar la anterior
    const next = lines[i + 1]?.t ?? l.t + 4
    cues.push({ start: l.t, end: Math.min(next, l.t + LRC_MAX_LINE_SEC), text: l.text })
  })
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join('\n\n') + (cues.length ? '\n' : '')
}

// ─── OpenSubtitles (películas y series) ──────────────────────────────────────
export type OsCreds = { apiKey: string; username?: string; password?: string }
let tokenCache: { token: string; base: string; at: number } | null = null
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
export function resetOsTokenCache() { tokenCache = null }

function osHeaders(apiKey: string, token?: string): Record<string, string> {
  return {
    'Api-Key': apiKey, 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// El login es "caro" para OpenSubtitles: se hace una vez y el token se reusa 12 h.
async function osLogin(c: OsCreds, fetchImpl: typeof fetch): Promise<{ token: string; base: string } | null> {
  if (!c.username || !c.password) return null
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache
  const res = await fetchImpl(`${OS_BASE}/login`, {
    method: 'POST', headers: osHeaders(c.apiKey), body: JSON.stringify({ username: c.username, password: c.password }),
  })
  if (!res.ok) throw new Error(`OpenSubtitles login ${res.status}`)
  const data = await res.json()
  const base = typeof data?.base_url === 'string' && data.base_url ? `https://${data.base_url.replace(/^https?:\/\//, '')}/api/v1` : OS_BASE
  tokenCache = { token: String(data.token), base, at: Date.now() }
  return tokenCache
}

type OsItem = { id: string; attributes?: { language?: string; download_count?: number; release?: string; files?: { file_id: number; file_name?: string }[]; feature_details?: { title?: string; movie_name?: string; year?: number; feature_type?: string } } }

export async function searchOpenSubtitles(q: string, c: OsCreds, fetchImpl: typeof fetch = fetch): Promise<SubResult[]> {
  if (!q.trim()) return []
  const params = new URLSearchParams({ query: q.toLowerCase(), languages: 'en', order_by: 'download_count', order_direction: 'desc' })
  const res = await fetchImpl(`${OS_BASE}/subtitles?${params}`, { headers: osHeaders(c.apiKey) })
  if (!res.ok) throw new Error(`OpenSubtitles ${res.status}`)
  const data = await res.json()
  const items = (Array.isArray(data?.data) ? data.data : []) as OsItem[]
  const out: SubResult[] = []
  for (const it of items) {
    const a = it.attributes, f = a?.files?.[0]
    if (!a || !f) continue
    const fd = a.feature_details ?? {}
    out.push({
      source: 'opensubtitles', id: String(f.file_id), kind: 'movie',
      title: fd.movie_name || fd.title || a.release || f.file_name || 'Sin título',
      detail: [fd.year, a.release && a.release !== fd.title ? a.release : null, `${a.download_count ?? 0} descargas`].filter(Boolean).join(' · '),
    })
    if (out.length >= MAX_RESULTS) break
  }
  return out
}

export async function downloadOpenSubtitles(fileId: string, c: OsCreds, fetchImpl: typeof fetch = fetch): Promise<string> {
  const login = await osLogin(c, fetchImpl).catch(e => { console.warn('[subtitles] login:', e instanceof Error ? e.message : e); return null })
  const res = await fetchImpl(`${login?.base ?? OS_BASE}/download`, {
    method: 'POST', headers: osHeaders(c.apiKey, login?.token),
    body: JSON.stringify({ file_id: Number(fileId), sub_format: 'srt' }),
  })
  if (res.status === 406 || res.status === 429) throw new Error('Se terminaron las descargas de subtítulos de hoy. Probá mañana o transcribí con IA.')
  if (!res.ok) throw new Error(`OpenSubtitles ${res.status}`)
  const { link } = await res.json()
  if (typeof link !== 'string') throw new Error('OpenSubtitles no devolvió el archivo')
  const file = await fetchImpl(link)
  if (!file.ok) throw new Error(`OpenSubtitles archivo ${file.status}`)
  return (await file.text()).replace(/^﻿/, '')
}
