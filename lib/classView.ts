// Calendario (C3) — funciones PURAS de presentación (sin React ni DOM).
// Las usan la vista del alumno (en la hora de SU dispositivo) y la sección "Clases" del
// profe (siempre en hora de Buenos Aires, que es en la que carga). Todas reciben la zona
// horaria como parámetro para poder testearlas: tests/lib/class-view.test.ts.
import { CLASS_TZ, dateInTz, minuteInTz, formatTime, zonedToUtc, addDays, weekdayOf } from '@/lib/classSchedule'

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// La zona del dispositivo (la del alumno). Fallback: la de las clases.
export function deviceTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || CLASS_TZ } catch { return CLASS_TZ }
}

const ymd = (day: string) => day.split('-').map(Number) as [number, number, number]

// '18:00'
export const hhmm = (t: Date, tz: string) => formatTime(minuteInTz(t, tz))

// '18:00–19:00'
export const timeRange = (t: Date, durationMin: number, tz: string) =>
  `${hhmm(t, tz)}–${hhmm(new Date(t.getTime() + durationMin * 60_000), tz)}`

// 'Mar 6/10'
export function shortDate(t: Date, tz: string): string {
  const day = dateInTz(t, tz)
  const [, m, d] = ymd(day)
  return `${WEEKDAYS_SHORT[weekdayOf(day)]} ${d}/${m}`
}

// 'martes 29 de septiembre'
export function longDate(t: Date, tz: string): string {
  const day = dateInTz(t, tz)
  const [, m, d] = ymd(day)
  return `${WEEKDAYS[weekdayOf(day)]} ${d} de ${MONTHS[m - 1]}`
}

// 'Hoy' / 'Mañana' / null (por día de calendario en esa zona).
export function relativeDay(t: Date, now: Date, tz: string): 'Hoy' | 'Mañana' | null {
  const day = dateInTz(t, tz)
  const today = dateInTz(now, tz)
  if (day === today) return 'Hoy'
  if (day === addDays(today, 1)) return 'Mañana'
  return null
}

// Tarjeta de la próxima clase: 'Hoy, martes 29 · 18:00' / 'Jueves 15 de octubre · 17:00'.
export function nextClassTitle(t: Date, now: Date, tz: string): string {
  const rel = relativeDay(t, now, tz)
  const day = dateInTz(t, tz)
  const [, , d] = ymd(day)
  return rel ? `${rel}, ${WEEKDAYS[weekdayOf(day)]} ${d} · ${hhmm(t, tz)}` : `${cap(longDate(t, tz))} · ${hhmm(t, tz)}`
}

// La "hojita" del calendario de la tarjeta: { month: 'sep', day: 29 }.
export function calendarLeaf(t: Date, tz: string): { month: string; day: number } {
  const [, m, d] = ymd(dateInTz(t, tz))
  return { month: MONTHS_SHORT[m - 1], day: d }
}

// Nombre de la plataforma según el link (para "60 min · Google Meet").
export function meetLabel(url: string | null): string | null {
  if (!url) return null
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  if (host === 'meet.google.com') return 'Google Meet'
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return 'Zoom'
  if (host.startsWith('teams.')) return 'Teams'
  return null
}

// ¿El dispositivo ve otra hora que Buenos Aires en ese momento? (para avisar "tu hora local")
export function differsFromClassTz(t: Date, tz: string): boolean {
  return minuteInTz(t, tz) !== minuteInTz(t, CLASS_TZ) || dateInTz(t, tz) !== dateInTz(t, CLASS_TZ)
}

// ─── Próximas clases ────────────────────────────────────────────────────────

type Timed = { startsAt: string; durationMin: number; status: 'scheduled' | 'cancelled' }

// La próxima clase = la primera PROGRAMADA que todavía no terminó (una en curso cuenta).
// Después, las siguientes `more` (incluidas las canceladas, que se muestran tachadas).
export function splitUpcoming<T extends Timed>(classes: T[], now: Date, more = 4): { next: T | null; rest: T[] } {
  const future = classes
    .filter((c) => new Date(c.startsAt).getTime() + c.durationMin * 60_000 > now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const i = future.findIndex((c) => c.status === 'scheduled')
  if (i === -1) return { next: null, rest: future.slice(0, more) }
  return { next: future[i], rest: future.filter((_, j) => j !== i).filter((c) => c.startsAt > future[i].startsAt).slice(0, more) }
}

// ─── Mes ────────────────────────────────────────────────────────────────────

export type MonthCell = { day: string; inMonth: boolean }

// Semanas de lunes a domingo que cubren el mes (5 o 6 filas). month: 1-12.
export function monthGrid(year: number, month: number): MonthCell[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const start = addDays(first, -((weekdayOf(first) + 6) % 7)) // el lunes de esa semana
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const cells: MonthCell[] = []
  for (let day = start; cells.length < 42; day = addDays(day, 1)) {
    if (cells.length % 7 === 0 && day >= nextMonth) break
    cells.push({ day, inMonth: day >= first && day < nextMonth })
  }
  return cells
}

// Instantes de inicio y fin del mes en la zona dada (para pedir las clases de ese mes).
export function monthRange(year: number, month: number, tz: string): { from: Date; to: Date } {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { from: zonedToUtc(first, 0, tz), to: zonedToUtc(next, 0, tz) }
}

export const monthTitle = (year: number, month: number) => `${cap(MONTHS[month - 1])} ${year}`

// Mes siguiente / anterior: { year, month }.
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}

// Clases agrupadas por día ('YYYY-MM-DD' en la zona dada), en orden.
export function byDay<T extends { startsAt: string }>(classes: T[], tz: string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const c of [...classes].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = dateInTz(new Date(c.startsAt), tz)
    out.set(k, [...(out.get(k) ?? []), c])
  }
  return out
}

// ─── Lado profe (siempre en hora de Buenos Aires) ───────────────────────────

export type TeacherClass = {
  key: string; seriesId: string | null; eventId: string | null; startsAt: string; durationMin: number
  meetUrl: string | null; status: 'scheduled' | 'cancelled'; originalStartsAt: string | null
}
export type ClassKind = 'fija' | 'suelta' | 'movida' | 'cancelada'

export function classKind(c: TeacherClass): ClassKind {
  if (c.status === 'cancelled') return 'cancelada'
  if (!c.seriesId) return 'suelta'
  if (c.originalStartsAt && c.originalStartsAt !== c.startsAt) return 'movida'
  return 'fija'
}

// Para precargar los formularios: fecha y hora en Buenos Aires.
export const formDate = (t: Date) => dateInTz(t, CLASS_TZ)
export const formTime = (t: Date) => hhmm(t, CLASS_TZ)

// 'Todos los martes · 18:00' / 'Todos los sábados · 10:00'
export const seriesTitle = (weekday: number, time: string) =>
  `Todos los ${WEEKDAYS[weekday]}${weekday === 0 || weekday === 6 ? 's' : ''} · ${time}`

// '1/9' a partir de 'YYYY-MM-DD'
export function dayMonth(day: string): string {
  const [, m, d] = ymd(day)
  return `${d}/${m}`
}
