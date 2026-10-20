// Calendario — una clase por franja del profe: funciones PURAS de solapamiento (sin DB).
// Las rutas traen las clases del profe con findTeacherClash (lib/classes.ts) y esta parte
// decide si chocan. Tests: tests/lib/overlap.test.ts.
import { expandSeries, zonedToUtc, type SeriesRow } from '@/lib/classSchedule'

export type Slot = { startsAt: Date; durationMin: number }
export type BusyClass = Slot & { status: 'scheduled' | 'cancelled' }

const MIN = 60_000
const DAY_MS = 86_400_000

// [inicio, fin) de cada una: se cruzan si una empieza antes de que la otra termine.
// Pegadas (una termina justo cuando empieza la otra) NO se cruzan.
export function slotsOverlap(a: Slot, b: Slot): boolean {
  const a0 = a.startsAt.getTime(), a1 = a0 + a.durationMin * MIN
  const b0 = b.startsAt.getTime(), b1 = b0 + b.durationMin * MIN
  return a0 < b1 && b0 < a1
}

// La primera clase ocupada que choca con alguna de las pedidas, o null. Una cancelada no
// ocupa; `isSelf` saca la clase que se está editando (no choca consigo misma).
export function findClash<T extends BusyClass>(
  wanted: Slot[], busy: T[], isSelf: (c: T) => boolean = () => false
): { wanted: Slot; busy: T } | null {
  for (const w of wanted) {
    for (const b of busy) {
      if (b.status !== 'cancelled' && !isSelf(b) && slotsOverlap(w, b)) return { wanted: w, busy: b }
    }
  }
  return null
}

// Un horario que se repite genera clases sin fin: se chequean las de los próximos
// SERIES_CHECK_DAYS días (desde hoy, o desde que empieza si es después; hasta su fin si
// termina antes). Las que ya pasaron no importan. Es una ventana acotada, no infinita,
// para que el chequeo no cueste de más.
export const SERIES_CHECK_DAYS = 90

export function seriesSlotsToCheck(
  s: Pick<SeriesRow, 'weekdays' | 'startMinute' | 'durationMin' | 'startsOn' | 'endsOn'>,
  now: Date = new Date(), days: number = SERIES_CHECK_DAYS
): Slot[] {
  const start = zonedToUtc(s.startsOn, 0)
  const from = start.getTime() > now.getTime() ? start : now
  const to = new Date(from.getTime() + days * DAY_MS)
  return expandSeries({ ...s, id: '', meetUrl: null }, from, to).map((startsAt) => ({ startsAt, durationMin: s.durationMin }))
}

// ¿Cambia CUÁNDO caen las clases del horario (días, hora, duración, inicio o fin)? Si solo
// cambia el link, no hace falta chequear choques (y no se traba por choques viejos).
type SeriesTiming = Pick<SeriesRow, 'weekdays' | 'startMinute' | 'durationMin' | 'startsOn' | 'endsOn'>
export function seriesTimingChanged(a: SeriesTiming, b: SeriesTiming): boolean {
  const days = (x: number[]) => [...new Set(x)].sort((p, q) => p - q).join(',')
  return days(a.weekdays) !== days(b.weekdays) || a.startMinute !== b.startMinute || a.durationMin !== b.durationMin ||
    a.startsOn !== b.startsOn || a.endsOn !== b.endsOn
}
