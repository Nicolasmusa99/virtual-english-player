import { and, asc, eq, gt, gte, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { classEvents, classSeries } from '@/lib/db/schema'
import type { ClassStatus } from '@/lib/db/schema'
import { buildSchedule, type ClassItem, type EventRow, type SeriesRow } from '@/lib/classSchedule'

// Capa de datos del calendario (C1). Igual que lib/assignments.ts: helpers finos de DB,
// SIN autorización — quién puede tocar qué lo deciden las rutas con lib/classAccess.ts.
// Las fechas NO se guardan clase por clase: getSchedule() lee la serie + los eventos y
// las calcula con buildSchedule() (lib/classSchedule.ts).

export type SeriesFull = SeriesRow & { teacherId: string; studentId: string }
export type EventFull = EventRow & { teacherId: string; studentId: string }

const SERIES_COLS = {
  id: classSeries.id, teacherId: classSeries.teacherId, studentId: classSeries.studentId,
  weekday: classSeries.weekday, weekdays: classSeries.weekdays, startMinute: classSeries.startMinute,
  durationMin: classSeries.durationMin, startsOn: classSeries.startsOn, endsOn: classSeries.endsOn,
  meetUrl: classSeries.meetUrl,
}
type SeriesDbRow = Omit<SeriesFull, 'weekdays'> & { weekday: number; weekdays: number[] | null }
// Fila de la base → serie. Una fila vieja sin `weekdays` (antes de 0004) es [weekday].
function toSeries({ weekday, weekdays, ...r }: SeriesDbRow): SeriesFull {
  return { ...r, weekdays: weekdays && weekdays.length ? [...weekdays].sort((a, b) => a - b) : [weekday] }
}
const EVENT_COLS = {
  id: classEvents.id, teacherId: classEvents.teacherId, studentId: classEvents.studentId,
  seriesId: classEvents.seriesId, originalStartsAt: classEvents.originalStartsAt, startsAt: classEvents.startsAt,
  durationMin: classEvents.durationMin, status: classEvents.status, meetUrl: classEvents.meetUrl,
}

const DAY = 86_400_000

// Las clases del alumno CON ESTE PROFE entre [from, to). Solo lectura.
export async function getSchedule(studentId: string, teacherId: string, from: Date, to: Date): Promise<ClassItem[]> {
  const pair = and(eq(classSeries.studentId, studentId), eq(classSeries.teacherId, teacherId))
  const series = (await db.select(SERIES_COLS).from(classSeries).where(pair)).map(toSeries)
  // Margen de un día hacia atrás: una clase larga que empezó antes de `from` sigue en curso.
  // Las excepciones se traen también por su ORIGINAL, para esconder el martes que se movió.
  const lo = new Date(from.getTime() - DAY)
  const events = await db
    .select(EVENT_COLS)
    .from(classEvents)
    .where(
      and(
        eq(classEvents.studentId, studentId),
        eq(classEvents.teacherId, teacherId),
        or(
          and(gte(classEvents.startsAt, lo), lt(classEvents.startsAt, to)),
          and(isNotNull(classEvents.originalStartsAt), gte(classEvents.originalStartsAt, lo), lt(classEvents.originalStartsAt, to))
        )
      )
    )
  return buildSchedule(series, events, from, to)
}

// Las clases sin link propio usan "Mi sala de Zoom" del profe (G0). Se resuelve al leer,
// así si el profe cambia su sala, todas sus clases la toman solas.
export function withRoomLink(classes: ClassItem[], roomUrl: string | null): ClassItem[] {
  if (!roomUrl) return classes
  return classes.map((c) => (c.meetUrl ? c : { ...c, meetUrl: roomUrl }))
}

// ─── Horario fijo ───────────────────────────────────────────────────────────

// Los horarios fijos del alumno con este profe que siguen vigentes: sin fin, o que
// terminan DESPUÉS de hoy (`today` en 'YYYY-MM-DD' de CLASS_TZ). Uno que termina hoy
// o antes ya no se muestra como horario (sus clases siguen en la lista / el mes).
export async function listActiveSeries(studentId: string, teacherId: string, today: string): Promise<SeriesFull[]> {
  const rows = await db
    .select(SERIES_COLS)
    .from(classSeries)
    .where(
      and(
        eq(classSeries.studentId, studentId),
        eq(classSeries.teacherId, teacherId),
        or(isNull(classSeries.endsOn), gt(classSeries.endsOn, today))
      )
    )
    .orderBy(asc(classSeries.weekday), asc(classSeries.startMinute))
  return rows.map(toSeries)
}

export type NewSeries = {
  teacherId: string; studentId: string; weekdays: number[]; startMinute: number; durationMin: number
  startsOn: string; endsOn: string | null; meetUrl: string | null; createdBy: string
}
// `weekday` (columna vieja) = el primer día: el código anterior a G1 lo sigue entendiendo.
const seriesValues = (d: NewSeries) => ({ ...d, weekday: d.weekdays[0] })

// Crear un horario. Con `replacesEventId`: en el MISMO paso borra esa clase suelta (al
// editar una clase suelta y ponerle "Se repite", pasa a ser este horario).
export async function createSeries(data: NewSeries, replacesEventId?: string): Promise<SeriesFull> {
  const insert = db.insert(classSeries).values(seriesValues(data)).returning(SERIES_COLS)
  if (!replacesEventId) return toSeries((await insert)[0])
  const [[row]] = await db.batch([insert, db.delete(classEvents).where(eq(classEvents.id, replacesEventId))])
  return toSeries(row)
}

export async function getSeries(id: string): Promise<SeriesFull | null> {
  const [row] = await db.select(SERIES_COLS).from(classSeries).where(eq(classSeries.id, id))
  return row ? toSeries(row) : null
}

export type SeriesPatch = {
  weekdays?: number[]; startMinute?: number; durationMin?: number
  startsOn?: string; endsOn?: string | null; meetUrl?: string | null
}

// "Todas las clases" (como Google): cambia el horario entero, también las pasadas. Si
// cambia CUÁNDO es (días, hora o duración), sus excepciones (movidas/canceladas) se
// descartan; si solo cambia el fin o el link, se conservan.
export async function updateSeriesAll(id: string, patch: SeriesPatch): Promise<SeriesFull | null> {
  const set = patch.weekdays ? { ...patch, weekday: patch.weekdays[0] } : patch
  const update = db.update(classSeries).set(set).where(eq(classSeries.id, id)).returning(SERIES_COLS)
  const resetsTimes = patch.weekdays !== undefined || patch.startMinute !== undefined || patch.durationMin !== undefined
  if (!resetsTimes) return ((r) => (r ? toSeries(r) : null))((await update)[0])
  const [[row]] = await db.batch([update, db.delete(classEvents).where(eq(classEvents.seriesId, id))])
  return row ? toSeries(row) : null
}

// "Esta y las siguientes": el horario viejo termina `oldEndsOn` (y pierde sus
// excepciones desde `cutFrom`) y, si viene `next`, arranca el horario nuevo. Todo en
// un solo paso (si algo falla, no cambia nada).
export async function splitSeries(
  id: string, oldEndsOn: string, cutFrom: Date, next?: NewSeries
): Promise<SeriesFull | null> {
  const end = db.update(classSeries).set({ endsOn: oldEndsOn }).where(eq(classSeries.id, id)).returning(SERIES_COLS)
  const cut = db.delete(classEvents).where(and(eq(classEvents.seriesId, id), gte(classEvents.originalStartsAt, cutFrom)))
  if (!next) {
    await db.batch([end, cut])
    return null
  }
  const [, , [row]] = await db.batch([end, cut, db.insert(classSeries).values(seriesValues(next)).returning(SERIES_COLS)])
  return toSeries(row)
}

export async function deleteSeries(id: string): Promise<boolean> {
  const rows = await db.delete(classSeries).where(eq(classSeries.id, id)).returning({ id: classSeries.id })
  return rows.length > 0
}

// ─── Clases sueltas y excepciones ───────────────────────────────────────────

export async function createSingleClass(data: {
  teacherId: string; studentId: string; startsAt: Date; durationMin: number; meetUrl: string | null; createdBy: string
}): Promise<EventFull> {
  const [row] = await db.insert(classEvents).values({ ...data, status: 'scheduled' }).returning(EVENT_COLS)
  return row
}

// Cancelar o mover UNA clase del horario fijo. Idempotente por (serie, original): si
// ya había una excepción para ese martes, se reemplaza.
export async function upsertException(data: {
  teacherId: string; studentId: string; seriesId: string; originalStartsAt: Date
  startsAt: Date; durationMin: number; status: ClassStatus; meetUrl: string | null; createdBy: string
}): Promise<EventFull> {
  const [row] = await db
    .insert(classEvents)
    .values(data)
    .onConflictDoUpdate({
      target: [classEvents.seriesId, classEvents.originalStartsAt],
      set: { startsAt: data.startsAt, durationMin: data.durationMin, status: data.status, meetUrl: data.meetUrl },
    })
    .returning(EVENT_COLS)
  return row
}

export async function getEvent(id: string): Promise<EventFull | null> {
  const [row] = await db.select(EVENT_COLS).from(classEvents).where(eq(classEvents.id, id))
  return row ?? null
}

export async function updateEvent(
  id: string, patch: { startsAt?: Date; durationMin?: number; status?: ClassStatus; meetUrl?: string | null }
): Promise<EventFull | null> {
  const [row] = await db.update(classEvents).set(patch).where(eq(classEvents.id, id)).returning(EVENT_COLS)
  return row ?? null
}

// Borrar una clase suelta, o una excepción (= el martes vuelve a ser como el horario fijo).
export async function deleteEvent(id: string): Promise<boolean> {
  const rows = await db.delete(classEvents).where(eq(classEvents.id, id)).returning({ id: classEvents.id })
  return rows.length > 0
}
