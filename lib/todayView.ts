// Rediseño (fase 2) — "Hoy" del profe: funciones PURAS (sin React ni DOM) para la lista
// de clases del día. Todo en hora de Argentina, como el resto del lado profe.
// Tests: tests/lib/today-view.test.ts.
import { CLASS_TZ } from '@/lib/classSchedule'
import { hhmm } from '@/lib/classView'

export type DayClass = { startsAt: string; durationMin: number; status: 'scheduled' | 'cancelled' }

const startOf = (c: DayClass) => new Date(c.startsAt).getTime()
const endOf = (c: DayClass) => startOf(c) + c.durationMin * 60_000

// La próxima clase: la primera programada que todavía no terminó (una en curso cuenta).
export function nextIndex(classes: DayClass[], now: Date): number {
  return classes.findIndex((c) => c.status === 'scheduled' && endOf(c) > now.getTime())
}

// Dónde va la raya de "ahora": antes de la primera clase que todavía no empezó.
// (= classes.length si ya empezaron todas.)
export function nowLineIndex(classes: DayClass[], now: Date): number {
  const i = classes.findIndex((c) => startOf(c) > now.getTime())
  return i === -1 ? classes.length : i
}

// Cuánto falta: 'En 25 min' · 'En 2 h' · 'En 3 h 20 min' · 'Ahora, hasta las 19:00' · 'Terminó'.
export function untilLabel(c: DayClass, now: Date, tz: string = CLASS_TZ): string {
  const t = now.getTime()
  if (endOf(c) <= t) return 'Terminó'
  if (startOf(c) <= t) return `Ahora, hasta las ${hhmm(new Date(endOf(c)), tz)}`
  const min = Math.ceil((startOf(c) - t) / 60_000)
  const h = Math.floor(min / 60), m = min % 60
  return h && m ? `En ${h} h ${m} min` : h ? `En ${h} h` : `En ${m} min`
}

// La frase de arriba: 'Tenés 2 clases. La próxima es a las 18:00 con Martina.'
export function todaySummary(classes: DayClass[], now: Date, nameOf: (i: number) => string, tz: string = CLASS_TZ): string {
  const scheduled = classes.filter((c) => c.status === 'scheduled').length
  if (scheduled === 0) {
    if (classes.length === 0) return 'Hoy no tenés clases.'
    return classes.length === 1 ? 'Hoy no tenés clases: la única está cancelada.' : 'Hoy no tenés clases: están todas canceladas.'
  }
  const base = scheduled === 1 ? 'Tenés 1 clase.' : `Tenés ${scheduled} clases.`
  const i = nextIndex(classes, now)
  if (i === -1) return `${base} ${scheduled === 1 ? 'Ya terminó.' : 'Ya terminaron todas.'}`
  const c = classes[i]
  if (startOf(c) <= now.getTime()) return `${base} Ahora estás en clase con ${nameOf(i)}.`
  return `${base} La próxima es a las ${hhmm(new Date(c.startsAt), tz)} con ${nameOf(i)}.`
}


// ─── "Tu día" como línea de horas (rediseño 2026-11) ─────────────────────────
// Dónde va cada clase sobre una línea de horas, en porcentajes. `startMin` = minutos desde
// las 00:00 en la zona de las clases. La línea va de una hora antes de la primera clase a
// una después de la última (al menos 6 horas); la hora actual entra solo si cae adentro.
export type TimelineInput = { startMin: number; durationMin: number }
export type Timeline = { hours: number[]; items: { left: number; width: number }[]; nowLeft: number | null }

export function dayTimeline(classes: TimelineInput[], nowMin: number): Timeline | null {
  if (classes.length === 0) return null
  const first = Math.min(...classes.map((c) => c.startMin))
  const last = Math.max(...classes.map((c) => c.startMin + c.durationMin))
  let from = Math.max(0, Math.floor(first / 60) - 1)
  let to = Math.min(24, Math.ceil(last / 60) + 1)
  while (to - from < 6) { if (to < 24) to++; else if (from > 0) from--; else break }
  const span = (to - from) * 60
  const pct = (min: number) => Math.round(((min - from * 60) / span) * 1000) / 10
  const hours: number[] = []
  for (let h = from; h <= to; h++) hours.push(h)
  return {
    hours,
    items: classes.map((c) => ({ left: pct(c.startMin), width: Math.round((Math.min(c.durationMin, to * 60 - c.startMin) / span) * 1000) / 10 })),
    nowLeft: nowMin >= from * 60 && nowMin <= to * 60 ? pct(nowMin) : null,
  }
}

// 'HH:MM' → minutos desde las 00:00.
export const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// ─── Primeros pasos del profe (rediseño 2026-11) ─────────────────────────────
// Tres pasos: su sala de Zoom, su primer alumno y su primera clase. `current` = el primero
// que falta (o -1 si están todos).
export type FirstSteps = { done: [boolean, boolean, boolean]; count: number; current: number }
export function firstSteps(s: { hasZoom: boolean; students: number; classes: number }): FirstSteps {
  const done: [boolean, boolean, boolean] = [s.hasZoom, s.students > 0, s.classes > 0]
  return { done, count: done.filter(Boolean).length, current: done.indexOf(false) }
}
export const STEPS_DONE_KEY = 've-first-steps-done'
