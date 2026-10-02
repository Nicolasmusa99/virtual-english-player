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

