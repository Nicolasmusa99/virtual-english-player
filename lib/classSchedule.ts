// Calendario de clases (fase calendario, C1) — funciones PURAS (sin DB, sin React).
// Calculan las clases de un alumno a partir de su horario fijo (class_series) y las
// clases sueltas / excepciones (class_events). Se testean solas:
// tests/lib/class-schedule.test.ts.
//
// Zona horaria: el profe carga todo en hora de CLASS_TZ (Buenos Aires). Los horarios
// fijos se guardan como "día de la semana + minuto del día" en esa zona, y acá se
// convierten a instantes reales (Date en UTC). Cada dispositivo los muestra en su hora.

export const CLASS_TZ = 'America/Argentina/Buenos_Aires'

// ─── Validación de lo que carga el profe ────────────────────────────────────

export const MIN_DURATION = 15
export const MAX_DURATION = 240

export function isDurationOk(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= MIN_DURATION && (x as number) <= MAX_DURATION
}

export function isWeekday(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6
}

// 'HH:MM' (24 h) → minutos desde 00:00. Cualquier otra cosa → null.
export function parseTime(x: unknown): number | null {
  if (typeof x !== 'string') return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(x)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function formatTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

// 'YYYY-MM-DD' que exista de verdad (no '2026-02-30').
export function isDateStr(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false
  const [y, m, d] = x.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

// Link de la clase: SOLO https de Zoom, Google Meet o Teams (sin usuario/clave en
// la URL). '' / null → null (sin link). Otra cosa → { ok: false }.
const MEET_HOSTS_EXACT = ['meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'zoom.us']
const MEET_HOSTS_SUFFIX = ['.zoom.us'] // us02web.zoom.us, etc.
export const MAX_MEET_URL = 500

export function normalizeMeetUrl(x: unknown): { ok: true; url: string | null } | { ok: false } {
  if (x == null || x === '') return { ok: true, url: null }
  if (typeof x !== 'string' || x.length > MAX_MEET_URL) return { ok: false }
  let u: URL
  try { u = new URL(x.trim()) } catch { return { ok: false } }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return { ok: false }
  const host = u.hostname.toLowerCase()
  const allowed = MEET_HOSTS_EXACT.includes(host) || MEET_HOSTS_SUFFIX.some((s) => host.endsWith(s))
  return allowed ? { ok: true, url: u.href } : { ok: false }
}

// ─── Fechas y zona horaria ──────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

// Cuánto adelanta (ms) la hora local de `tz` respecto de UTC en el instante dado.
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

// Día 'YYYY-MM-DD' + minuto del día en `tz` → instante real.
export function zonedToUtc(date: string, minute: number, tz: string = CLASS_TZ): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60)
  const first = guess - tzOffsetMs(guess, tz)
  return new Date(guess - tzOffsetMs(first, tz))
}

// Instante → día 'YYYY-MM-DD' en `tz`.
export function dateInTz(instant: Date, tz: string = CLASS_TZ): string {
  const off = tzOffsetMs(instant.getTime(), tz)
  const local = new Date(instant.getTime() + off)
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`
}

// Instante → minuto del día en `tz`.
export function minuteInTz(instant: Date, tz: string = CLASS_TZ): number {
  const local = new Date(instant.getTime() + tzOffsetMs(instant.getTime(), tz))
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// ─── Horario fijo → clases ──────────────────────────────────────────────────

export type SeriesRow = {
  id: string
  weekday: number
  startMinute: number
  durationMin: number
  startsOn: string
  endsOn: string | null
  meetUrl: string | null
}

export type EventRow = {
  id: string
  seriesId: string | null
  originalStartsAt: Date | null
  startsAt: Date
  durationMin: number
  status: 'scheduled' | 'cancelled'
  meetUrl: string | null
}

export type ClassItem = {
  key: string // estable: id del evento, o "serie:instante" para una clase fija sin cambios
  seriesId: string | null
  eventId: string | null
  startsAt: Date
  durationMin: number
  meetUrl: string | null
  status: 'scheduled' | 'cancelled'
  originalStartsAt: Date | null // solo en una clase fija movida/cancelada: cuándo era
}

const MIN = 60_000
const overlaps = (start: Date, durationMin: number, from: Date, to: Date) =>
  start.getTime() < to.getTime() && start.getTime() + durationMin * MIN > from.getTime()

// Las clases de UNA serie que se cruzan con [from, to). Tope de seguridad de ~2 años.
export function expandSeries(s: SeriesRow, from: Date, to: Date): Date[] {
  if (!(to.getTime() > from.getTime())) return []
  let day = s.startsOn > addDays(dateInTz(from), -1) ? s.startsOn : addDays(dateInTz(from), -1)
  const last = addDays(dateInTz(to), 1)
  const end = s.endsOn && s.endsOn < last ? s.endsOn : last
  day = addDays(day, (s.weekday - weekdayOf(day) + 7) % 7)
  const out: Date[] = []
  for (let i = 0; day <= end && i < 110; i++, day = addDays(day, 7)) {
    const start = zonedToUtc(day, s.startMinute)
    if (overlaps(start, s.durationMin, from, to)) out.push(start)
  }
  return out
}

// ¿`instant` es una clase real de la serie? (para aceptar una excepción)
export function isOccurrence(s: SeriesRow, instant: Date): boolean {
  const day = dateInTz(instant)
  if (weekdayOf(day) !== s.weekday || day < s.startsOn || (s.endsOn && day > s.endsOn)) return false
  return zonedToUtc(day, s.startMinute).getTime() === instant.getTime()
}

// Todas las clases entre [from, to), ordenadas: las del horario fijo (salvo las que
// tienen excepción), las excepciones (movidas o canceladas) y las sueltas.
// Una excepción cuyo "original" ya no es una clase de la serie (p. ej. se acortó la
// serie) se ignora.
export function buildSchedule(series: SeriesRow[], events: EventRow[], from: Date, to: Date): ClassItem[] {
  const byId = new Map(series.map((s) => [s.id, s]))
  const excKey = (seriesId: string, t: Date) => `${seriesId}|${t.getTime()}`
  const exceptions = new Set<string>()
  for (const e of events) {
    if (!e.seriesId || !e.originalStartsAt) continue
    const s = byId.get(e.seriesId)
    if (s && isOccurrence(s, e.originalStartsAt)) exceptions.add(excKey(e.seriesId, e.originalStartsAt))
  }

  const out: ClassItem[] = []
  for (const s of series) {
    for (const start of expandSeries(s, from, to)) {
      if (exceptions.has(excKey(s.id, start))) continue
      out.push({
        key: `${s.id}:${start.getTime()}`, seriesId: s.id, eventId: null, startsAt: start,
        durationMin: s.durationMin, meetUrl: s.meetUrl, status: 'scheduled', originalStartsAt: null,
      })
    }
  }
  for (const e of events) {
    const isException = !!(e.seriesId && e.originalStartsAt)
    if (isException && !exceptions.has(excKey(e.seriesId!, e.originalStartsAt!))) continue
    if (!isException && e.seriesId) continue // forma inválida: serie sin original
    if (!overlaps(e.startsAt, e.durationMin, from, to)) continue
    const s = e.seriesId ? byId.get(e.seriesId) : undefined
    out.push({
      key: e.id, seriesId: e.seriesId, eventId: e.id, startsAt: e.startsAt, durationMin: e.durationMin,
      meetUrl: e.meetUrl ?? s?.meetUrl ?? null, status: e.status,
      originalStartsAt: isException ? e.originalStartsAt : null,
    })
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.key.localeCompare(b.key))
}

// ─── Rango pedido por las rutas ─────────────────────────────────────────────

export const MAX_RANGE_DAYS = 100

// ?from=&to= (ISO). Sin valores → [ahora − `pastMin` min, ahora + `defaultDays`).
export function parseRange(
  fromQ: string | null, toQ: string | null, now: Date, defaultDays: number, pastMin = 0
): { ok: true; from: Date; to: Date } | { ok: false } {
  const from = fromQ ? new Date(fromQ) : new Date(now.getTime() - pastMin * MIN)
  const to = toQ ? new Date(toQ) : new Date(from.getTime() + defaultDays * 86_400_000)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return { ok: false }
  const span = to.getTime() - from.getTime()
  if (span <= 0 || span > MAX_RANGE_DAYS * 86_400_000) return { ok: false }
  return { ok: true, from, to }
}

// ─── Lo que sale por la API ─────────────────────────────────────────────────

// Para el PROFE: todo lo que necesita para mostrar y editar.
export function classToJson(c: ClassItem) {
  return {
    key: c.key, seriesId: c.seriesId, eventId: c.eventId, startsAt: c.startsAt.toISOString(),
    durationMin: c.durationMin, meetUrl: c.meetUrl, status: c.status,
    originalStartsAt: c.originalStartsAt ? c.originalStartsAt.toISOString() : null,
  }
}

// Para el ALUMNO: lista blanca (ni ids de serie/evento ni datos de otros).
// `moved`: una clase del horario fijo que el profe pasó a otro día/hora ("Cambió de día").
export function classToStudentJson(c: ClassItem) {
  const moved = !!c.originalStartsAt && c.status === 'scheduled' && c.startsAt.getTime() !== c.originalStartsAt.getTime()
  return { key: c.key, startsAt: c.startsAt.toISOString(), durationMin: c.durationMin, meetUrl: c.meetUrl, status: c.status, moved }
}

export function seriesToJson(s: SeriesRow) {
  return {
    id: s.id, weekday: s.weekday, time: formatTime(s.startMinute), durationMin: s.durationMin,
    startsOn: s.startsOn, endsOn: s.endsOn, meetUrl: s.meetUrl,
  }
}
