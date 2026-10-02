// Vista del alumno (fase vista-alumno, E3) — funciones puras de presentación.
// Sin React ni DOM: se testean solas (tests/lib/student-view-helpers.test.ts).
import type { SharedLevel, SharedType } from '@/lib/db/schema'
import type { StudentPhrase } from '@/lib/assignments'
import { VIDEO_EXT_RE } from '@/lib/videoName'

// "Hola, {nombre}": primer nombre; si no hay nombre, la parte local del email.
export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  if (n) return n
  const local = (email ?? '').split('@')[0].trim()
  return local
}

// El nombre del video, sin la extensión si la trae: "Frozen (demo).mp4" → "Frozen (demo)".
// Solo saca extensiones de video ("Song vol.2" queda igual): desde que el admin escribe el
// nombre al subirlo, ya no suele traer extensión.
export function displayVideoName(originalName: string): string {
  const s = originalName.trim()
  const out = s.replace(VIDEO_EXT_RE, '')
  return out ? out : s
}

const TYPE_LABEL: Record<SharedType, string> = { pelicula: 'Película', cancion: 'Canción' }
const LEVEL_LABEL: Record<SharedLevel, string> = { beginner: 'Inicial', medium: 'Intermedio', advance: 'Avanzado' }

export const typeLabel = (t: SharedType | null | undefined) => (t ? TYPE_LABEL[t] ?? null : null)
export const levelLabel = (l: SharedLevel | null | undefined) => (l ? LEVEL_LABEL[l] ?? null : null)

// Duración redondeada a minutos (mínimo 1). Sin dato → null (no se muestra la etiqueta).
export function durationLabel(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null
  return `${Math.max(1, Math.round(sec / 60))} min`
}

// "Asignado hoy / ayer / hace N días / hace 1 semana / hace N semanas / el d/m/aaaa".
// Cuenta días de CALENDARIO (local), no bloques de 24 h.
export function assignedAgo(assignedAt: Date | string, now: Date = new Date()): string {
  const a = new Date(assignedAt)
  if (isNaN(a.getTime())) return ''
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((day(now) - day(a)) / 86_400_000)
  if (days <= 0) return 'Asignado hoy'
  if (days === 1) return 'Asignado ayer'
  if (days < 7) return `Asignado hace ${days} días`
  if (days < 14) return 'Asignado hace 1 semana'
  if (days <= 30) return `Asignado hace ${Math.floor(days / 7)} semanas`
  return `Asignado el ${a.getDate()}/${a.getMonth() + 1}/${a.getFullYear()}`
}

// "Nuevo": asignado en los últimos 7 días de calendario (hoy cuenta como día 0).
export const NEW_DAYS = 7
export function isNewAssignment(assignedAt: Date | string, now: Date = new Date()): boolean {
  const a = new Date(assignedAt)
  if (isNaN(a.getTime())) return false
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((day(now) - day(a)) / 86_400_000) < NEW_DAYS
}

// El material, lo último asignado primero (sin fecha válida, al final).
export function newestFirst<T extends { assignedAt: string }>(items: T[]): T[] {
  const t = (x: T) => { const n = new Date(x.assignedAt).getTime(); return isNaN(n) ? -Infinity : n }
  return [...items].sort((a, b) => t(b) - t(a))
}

// Qué frase se ve en el momento `t` del video, con el delay que configuró el profe
// (mismo criterio que el player del profe: t - delay dentro de [start, end]).
export function phraseAt(phrases: StudentPhrase[], t: number, delay: number): string {
  const x = t - delay
  const p = phrases.find((ph) => x >= ph.start && x <= ph.end)
  return p ? p.text : ''
}

// ─── Player para practicar (vista del alumno v2) ───────────────────────────
// Las frases llegan en orden (SRT). Los tiempos del video llevan el delay del profe:
// la frase i suena entre start + delay y end + delay.

// La frase que suena en `t` (su índice), o -1 en un silencio.
export function phraseIndexAt(phrases: StudentPhrase[], t: number, delay: number): number {
  const x = t - delay
  return phrases.findIndex((ph) => x >= ph.start && x <= ph.end)
}

// La última frase que ya empezó en `t` (-1 antes de la primera). Con un margen chico, así
// al saltar al principio de una frase ya cuenta como "esa".
export function lastStartedIndex(phrases: StudentPhrase[], t: number, delay: number): number {
  const x = t - delay + 0.05
  let i = -1
  for (let j = 0; j < phrases.length && phrases[j].start <= x; j++) i = j
  return i
}

// A qué frase llevan "Anterior", "Repetir" y "Siguiente" (null = a ninguna).
export function phraseTarget(phrases: StudentPhrase[], t: number, delay: number, action: 'prev' | 'repeat' | 'next'): number | null {
  if (phrases.length === 0) return null
  const base = lastStartedIndex(phrases, t, delay)
  if (action === 'prev') return Math.max(0, base - 1)
  if (action === 'repeat') return Math.max(0, base)
  return base + 1 < phrases.length ? base + 1 : null
}

// El segundo del video donde empieza / termina la frase (con el delay; nunca negativo).
export const phraseStartAt = (p: StudentPhrase, delay: number) => Math.max(0, p.start + delay)
export const phraseEndAt = (p: StudentPhrase, delay: number) => Math.max(0, p.end + delay)

// Más lento para escuchar mejor.
export const SLOW_RATE = 0.75

// Volumen en pasos del 10%, entre 0 y 1, sin errores de coma flotante (0.1 + 0.2).
export const VOLUME_STEP = 0.1
export function stepVolume(v: number, dir: 1 | -1): number {
  const next = Math.round((v + dir * VOLUME_STEP) * 10) / 10
  return Math.min(1, Math.max(0, next))
}

// Cuántas de las N barritas del indicador van prendidas (0 → ninguna, 1 → todas).
export const VOLUME_BARS = 7
export function volumeBarsOn(v: number, bars = VOLUME_BARS): number {
  if (!(v > 0)) return 0
  return Math.min(bars, Math.max(1, Math.round(v * bars)))
}

// Progreso 0..100 para la barra de tiempo.
export function progressPct(current: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(current)) return 0
  return Math.min(100, Math.max(0, (current / duration) * 100))
}

// Barra de tiempo: dónde tocó el alumno (x en pantalla) → segundo del video.
// Fuera de la barra se clava en 0 / el final. Sin duración conocida → null (no salta).
export function timeAtX(clientX: number, left: number, width: number, duration: number): number | null {
  if (!(duration > 0) || !(width > 0) || !Number.isFinite(clientX)) return null
  const frac = Math.min(1, Math.max(0, (clientX - left) / width))
  return frac * duration
}

// Flechas ← → sobre la barra: 5 segundos para atrás / adelante, sin salirse del video.
export const SEEK_STEP = 5
export function stepSeek(t: number, dir: 1 | -1, duration: number): number {
  if (!(duration > 0)) return 0
  return Math.min(duration, Math.max(0, t + dir * SEEK_STEP))
}
