// Calendario (G1) — ventana "Crear / Editar clase" (estilo Google Calendar): funciones
// PURAS que pasan lo que el profe completa a lo que pide la API. Sin React ni DOM:
// tests/lib/class-draft.test.ts. Todo en hora de Buenos Aires (la del profe).
import { MAX_DURATION, MIN_DURATION, parseTime, weekdayOf } from '@/lib/classSchedule'
import { WEEKDAYS } from '@/lib/classView'

export type RepeatMode = 'none' | 'weekly' | 'custom'

export type ClassDraft = {
  date: string // 'YYYY-MM-DD' (la clase / el primer día del horario)
  start: string // 'HH:MM'
  end: string // 'HH:MM'
  repeat: RepeatMode
  days: number[] // con repeat 'custom'
  endsOn: string | null // null = "Nunca"
  link: string // '' = Mi sala de Zoom
}

// Orden de la semana para mostrar: de lunes a domingo.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const DAY_CHIPS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'] as const

const byWeek = (days: number[]) => [...new Set(days)].sort((a, b) => WEEK_ORDER.indexOf(a as 0) - WEEK_ORDER.indexOf(b as 0))

// 'el martes' · 'el martes y el jueves' · 'el lunes, el miércoles y el viernes'
function listDays(days: number[]): string {
  const names = byWeek(days).map((d) => `el ${WEEKDAYS[d]}`)
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// Texto de la opción de repetición: 'Todas las semanas el martes y el jueves' / 'Todos los días'.
export function repeatLabel(days: number[]): string {
  return new Set(days).size === 7 ? 'Todos los días' : `Todas las semanas ${listDays(days)}`
}

// Los días de la semana que pide el borrador ([] = no se repite).
export function draftWeekdays(d: ClassDraft): number[] {
  if (d.repeat === 'none') return []
  if (d.repeat === 'weekly') return [weekdayOf(d.date)]
  return [...new Set(d.days)].sort((a, b) => a - b)
}

// Minutos entre inicio y fin (la clase no cruza la medianoche). null si no sirve.
export function draftDuration(d: Pick<ClassDraft, 'start' | 'end'>): number | null {
  const a = parseTime(d.start), b = parseTime(d.end)
  if (a === null || b === null) return null
  const m = b - a
  return m >= MIN_DURATION && m <= MAX_DURATION ? m : null
}

// '1 h' · '45 min' · '1 h 30 min'
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

// 'HH:MM' + minutos (sin pasar de 23:59).
export function addMinutes(time: string, min: number): string {
  const t = Math.min(23 * 60 + 59, (parseTime(time) ?? 0) + min)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// Lo que está mal en el borrador (para no mandar nada inválido), o null si está listo.
export function draftError(d: ClassDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Elegí la fecha'
  if (parseTime(d.start) === null || parseTime(d.end) === null) return 'Elegí la hora'
  if (draftDuration(d) === null) return `La clase tiene que durar entre ${MIN_DURATION} minutos y ${MAX_DURATION / 60} horas`
  if (d.repeat === 'custom' && d.days.length === 0) return 'Elegí al menos un día'
  if (d.repeat !== 'none' && d.endsOn !== null && d.endsOn < d.date) return 'El horario no puede terminar antes de empezar'
  return null
}

// Cuerpo para POST /api/classes/series (horario nuevo).
export function seriesBody(d: ClassDraft) {
  return {
    weekdays: draftWeekdays(d), time: d.start, durationMin: draftDuration(d)!, startsOn: d.date,
    endsOn: d.endsOn, meetUrl: d.link.trim(),
  }
}

// Cuerpo para una clase suelta (POST /api/classes/events o PATCH de una suelta).
export function singleBody(d: ClassDraft) {
  return { date: d.date, time: d.start, durationMin: draftDuration(d)!, meetUrl: d.link.trim() }
}

// ¿Cambió CÓMO se repite (días o fin)? Entonces "Solo esta clase" no tiene sentido
// (como en Google: cambiar la repetición es de esta y las siguientes, o de todas).
export function repeatChanged(before: ClassDraft, after: ClassDraft): boolean {
  const a = draftWeekdays(before), b = draftWeekdays(after)
  return a.length !== b.length || a.some((x, i) => x !== b[i]) || before.endsOn !== after.endsOn
}
