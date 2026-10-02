// Calendario (G2) — "Mi agenda" del PROFE: funciones PURAS de la grilla semanal (sin
// React ni DOM). Todo en hora de Argentina (CLASS_TZ), como el resto del lado profe.
// Tests: tests/lib/agenda-view.test.ts.
import { CLASS_TZ, addDays, dateInTz, minuteInTz, weekdayOf, zonedToUtc } from '@/lib/classSchedule'
import { MONTHS, WEEKDAYS } from '@/lib/classView'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const ymd = (day: string) => day.split('-').map(Number) as [number, number, number]

// ─── Semanas (de lunes a domingo) ───────────────────────────────────────────

// El lunes de la semana de `day` ('YYYY-MM-DD').
export const weekStartOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

// Los 7 días de la semana que empieza en `start`.
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

// Instantes [lunes 00:00, lunes siguiente 00:00) en hora de Argentina (lo que se pide a la API).
export function weekRange(start: string): { from: Date; to: Date } {
  return { from: zonedToUtc(start, 0, CLASS_TZ), to: zonedToUtc(addDays(start, 7), 0, CLASS_TZ) }
}

// '28 sep – 4 oct 2026' · '5 – 11 oct 2026' · '28 dic 2026 – 3 ene 2027'
export function weekTitle(start: string): string {
  const end = addDays(start, 6)
  const [y1, m1, d1] = ymd(start)
  const [y2, m2, d2] = ymd(end)
  if (y1 !== y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`
  if (m1 !== m2) return `${d1} ${MONTHS_SHORT[m1 - 1]} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`
  return `${d1} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`
}

// Cabecera de cada día: { short: 'MAR', letter: 'M', num: 29 }.
export function dayHead(day: string): { short: string; letter: string; num: number } {
  const name = WEEKDAYS[weekdayOf(day)]
  return { short: cap(name.slice(0, 3)), letter: name[0].toUpperCase(), num: ymd(day)[2] }
}

// Vista de un día (celular): 'Martes 29'.
export const dayTitle = (day: string) => `${cap(WEEKDAYS[weekdayOf(day)])} ${ymd(day)[2]}`

// Para lectores de pantalla: 'martes 6 de octubre'.
export const dayLong = (day: string) => `${WEEKDAYS[weekdayOf(day)]} ${ymd(day)[2]} de ${MONTHS[ymd(day)[1] - 1]}`

// ─── Grilla horaria ─────────────────────────────────────────────────────────

export const DEFAULT_HOURS = { from: 8, to: 22 } as const // filas de 8:00 a 22:00

type Timed = { startsAt: string; durationMin: number }

// Las horas que muestra la grilla: 8 a 22, o más si alguna clase de la semana se sale.
export function hourBounds(classes: Timed[], tz: string = CLASS_TZ): { from: number; to: number } {
  let from: number = DEFAULT_HOURS.from, to: number = DEFAULT_HOURS.to
  for (const c of classes) {
    const start = minuteInTz(new Date(c.startsAt), tz)
    from = Math.min(from, Math.floor(start / 60))
    to = Math.max(to, Math.min(24, Math.ceil((start + c.durationMin) / 60)))
  }
  return { from, to }
}

// Dónde se hizo clic en la columna de un día → hora de inicio 'HH:MM' (de a media hora).
export function slotTime(offsetMin: number, fromHour: number, step = 30): string {
  const m = Math.max(0, Math.min(24 * 60 - step, fromHour * 60 + Math.floor(Math.max(0, offsetMin) / step) * step))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Cada clase en su día, con su lugar en la grilla. Las que se superponen (dos alumnos a
// la misma hora) se reparten el ancho en columnas, como en Google Calendar.
export type Placed<T> = { item: T; day: string; startMin: number; endMin: number; col: number; cols: number }

export function placeClasses<T extends Timed>(classes: T[], days: string[], tz: string = CLASS_TZ): Placed<T>[] {
  const wanted = new Set(days)
  const byDay = new Map<string, Placed<T>[]>()
  for (const item of classes) {
    const t = new Date(item.startsAt)
    const day = dateInTz(t, tz)
    if (!wanted.has(day)) continue
    const startMin = minuteInTz(t, tz)
    const p: Placed<T> = { item, day, startMin, endMin: Math.min(24 * 60, startMin + item.durationMin), col: 0, cols: 1 }
    byDay.set(day, [...(byDay.get(day) ?? []), p])
  }
  const out: Placed<T>[] = []
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
    // Grupos de clases que se tocan entre sí; dentro de cada grupo, primera columna libre.
    let group: Placed<T>[] = []
    let groupEnd = -1
    const close = () => { const n = Math.max(...group.map((p) => p.col)) + 1; group.forEach((p) => { p.cols = n }) }
    for (const p of list) {
      if (group.length && p.startMin >= groupEnd) { close(); group = []; groupEnd = -1 }
      const busy = new Set(group.filter((g) => g.endMin > p.startMin).map((g) => g.col))
      let col = 0
      while (busy.has(col)) col++
      p.col = col
      group.push(p)
      groupEnd = Math.max(groupEnd, p.endMin)
    }
    if (group.length) close()
    out.push(...list)
  }
  return out
}

// ─── Alumnos: nombre corto y color ──────────────────────────────────────────

export type AgendaStudent = { id: string; name: string | null; email: string | null }

export const STUDENT_COLORS = 8

// Nombre que se ve en la grilla: el primer nombre ('Martina'); si dos alumnos comparten
// el primer nombre, el nombre completo; sin nombre, lo de antes de la @ del mail.
// Color: fijo por alumno (por orden alfabético de toda la lista, no de la semana), así
// Martina es siempre del mismo color al pasar de semana.
export function studentLabels(students: AgendaStudent[]): Map<string, { label: string; full: string; color: number }> {
  const full = (s: AgendaStudent) => s.name?.trim() || (s.email ? s.email.split('@')[0] : 'Alumno')
  const first = (s: AgendaStudent) => full(s).split(/\s+/)[0]
  const firstCount = new Map<string, number>()
  for (const s of students) firstCount.set(first(s).toLowerCase(), (firstCount.get(first(s).toLowerCase()) ?? 0) + 1)
  const sorted = [...students].sort((a, b) => full(a).localeCompare(full(b), 'es') || a.id.localeCompare(b.id))
  return new Map(sorted.map((s, i) => [s.id, {
    label: (firstCount.get(first(s).toLowerCase()) ?? 0) > 1 ? full(s) : first(s),
    full: full(s),
    color: i % STUDENT_COLORS,
  }]))
}
