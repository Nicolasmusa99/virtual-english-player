// Avance del alumno (2026-11): lo PURO de mostrar y validar dónde dejó cada video.
// El alumno no ve nada de esto; lo usa el profe (tarjeta del alumno, su material y las
// marcas en la barra del player). Lo de base está en lib/assignments.ts y lib/people.ts.
import { fmtTime } from '@/lib/srt'
import { CLASS_TZ } from '@/lib/classSchedule'

/** Cada cuánto guarda el player del alumno mientras reproduce. */
export const PROGRESS_SAVE_MS = 10_000
/** No se guarda si se movió menos que esto desde el último guardado. */
export const PROGRESS_MIN_DELTA_SEC = 1
/** A menos de esto del final se considera que lo vio entero. */
export const PROGRESS_DONE_TAIL_SEC = 5
/** Tope de cordura para un segundo de video (24 h). */
export const PROGRESS_MAX_SEC = 86_400

/** Valida el cuerpo de PUT .../progress: `{ position }` en segundos. null = inválido. */
export function parseProgressBody(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null
  const p = (body as Record<string, unknown>).position
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > PROGRESS_MAX_SEC) return null
  return Math.round(p * 10) / 10
}

/** ¿Hay que guardar? Solo si cambió lo suficiente desde lo último guardado. */
export function shouldSaveProgress(position: number, lastSaved: number | null): boolean {
  if (!Number.isFinite(position) || position <= 0) return false
  return lastSaved == null || Math.abs(position - lastSaved) >= PROGRESS_MIN_DELTA_SEC
}

export function progressDone(position: number, duration: number | null | undefined): boolean {
  return !!duration && duration > 0 && position >= duration - PROGRESS_DONE_TAIL_SEC
}

/** "Quedó en 12:34 de 20:10" · "Lo vio entero" · "Quedó en 12:34" (sin duración). */
export function progressText(position: number, duration: number | null | undefined): string {
  if (progressDone(position, duration)) return 'Lo vio entero'
  return duration && duration > 0 ? `Quedó en ${fmtTime(position)} de ${fmtTime(duration)}` : `Quedó en ${fmtTime(position)}`
}

/** Porcentaje 0..100 para la barrita (null si no hay duración). */
export function progressPctOf(position: number, duration: number | null | undefined): number | null {
  if (!duration || duration <= 0) return null
  return Math.min(100, Math.max(0, (position / duration) * 100))
}

const dayKey = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz })

/** Cuándo lo miró: "hoy", "ayer", "hace 3 días" (hasta 6) y si no "el 4/11". */
export function lastSeenText(iso: string | Date, now: Date, tz: string = CLASS_TZ): string {
  const at = typeof iso === 'string' ? new Date(iso) : iso
  const a = dayKey(at, tz), b = dayKey(now, tz)
  const days = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return 'el ' + at.toLocaleDateString('es-AR', { timeZone: tz, day: 'numeric', month: 'numeric' })
}

/** Lo que se muestra de un alumno en la barra del player del profe. */
export type StudentMark = { studentId: string; name: string; positionSec: number; seenAt: string }

/** Nombre corto para la marca: el primer nombre, o el mail antes de la @. */
export function markLabel(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim()
  if (n) return n.split(/\s+/)[0]
  return (email ?? '').split('@')[0] || 'Alumno'
}

/** "Juan quedó en 12:34, hace 2 días" (para el título de la marca y el aviso). */
export function markText(m: StudentMark, now: Date): string {
  return `${m.name} quedó en ${fmtTime(m.positionSec)}, ${lastSeenText(m.seenAt, now)}`
}
