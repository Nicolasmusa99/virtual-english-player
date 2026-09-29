// Vista del alumno (fase vista-alumno, E3) — funciones puras de presentación.
// Sin React ni DOM: se testean solas (tests/lib/student-view-helpers.test.ts).
import type { SharedLevel, SharedType } from '@/lib/db/schema'
import type { StudentPhrase } from '@/lib/assignments'

// "Hola, {nombre}": primer nombre; si no hay nombre, la parte local del email.
export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  if (n) return n
  const local = (email ?? '').split('@')[0].trim()
  return local
}

// El nombre del archivo, sin la extensión: "Frozen (demo).mp4" → "Frozen (demo)".
export function displayVideoName(originalName: string): string {
  const s = originalName.trim()
  const i = s.lastIndexOf('.')
  return i > 0 && s.length - i <= 5 ? s.slice(0, i) : s
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

// Qué frase se ve en el momento `t` del video, con el delay que configuró el profe
// (mismo criterio que el player del profe: t - delay dentro de [start, end]).
export function phraseAt(phrases: StudentPhrase[], t: number, delay: number): string {
  const x = t - delay
  const p = phrases.find((ph) => x >= ph.start && x <= ph.end)
  return p ? p.text : ''
}

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
