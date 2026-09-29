import { and, asc, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm'
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
  weekday: classSeries.weekday, startMinute: classSeries.startMinute, durationMin: classSeries.durationMin,
  startsOn: classSeries.startsOn, endsOn: classSeries.endsOn, meetUrl: classSeries.meetUrl,
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
  const series = await db.select(SERIES_COLS).from(classSeries).where(pair)
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

// ─── Horario fijo ───────────────────────────────────────────────────────────

// Los horarios fijos del alumno con este profe que siguen vigentes (sin fin, o que
// terminan hoy o después — `today` en 'YYYY-MM-DD' de CLASS_TZ).
export async function listActiveSeries(studentId: string, teacherId: string, today: string): Promise<SeriesFull[]> {
  return db
    .select(SERIES_COLS)
    .from(classSeries)
    .where(
      and(
        eq(classSeries.studentId, studentId),
        eq(classSeries.teacherId, teacherId),
        or(isNull(classSeries.endsOn), gte(classSeries.endsOn, today))
      )
    )
    .orderBy(asc(classSeries.weekday), asc(classSeries.startMinute))
}

export async function createSeries(data: {
  teacherId: string; studentId: string; weekday: number; startMinute: number; durationMin: number
  startsOn: string; endsOn: string | null; meetUrl: string | null; createdBy: string
}): Promise<SeriesFull> {
  const [row] = await db.insert(classSeries).values(data).returning(SERIES_COLS)
  return row
}

export async function getSeries(id: string): Promise<SeriesFull | null> {
  const [row] = await db.select(SERIES_COLS).from(classSeries).where(eq(classSeries.id, id))
  return row ?? null
}

// Solo se edita el FIN, el link y la duración. Cambiar día/hora = terminar esta serie
// y crear otra (así las clases pasadas y sus excepciones quedan como estaban).
export async function updateSeries(
  id: string, patch: { endsOn?: string | null; meetUrl?: string | null; durationMin?: number }
): Promise<SeriesFull | null> {
  const [row] = await db.update(classSeries).set(patch).where(eq(classSeries.id, id)).returning(SERIES_COLS)
  return row ?? null
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
