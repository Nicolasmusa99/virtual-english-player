import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { CLASS_ERRORS, classScopeFor, isUuid, rowScopeFor } from '@/lib/classAccess'
import { createSingleClass, findTeacherClash, getSeries, upsertException } from '@/lib/classes'
import { isDateStr, isDurationOk, isOccurrence, isPastStart, normalizeZoomRoomUrl, parseTime, zonedToUtc } from '@/lib/classSchedule'

// Calendario (C1) — clases SUELTAS y EXCEPCIONES del horario fijo.
// POST /api/classes/events
//   Clase suelta:        { studentId, date: 'YYYY-MM-DD', time: 'HH:MM', durationMin, meetUrl? (Zoom) }
//   Cancelar un martes:  { seriesId, originalStartsAt: ISO, action: 'cancel' }
//   Mover un martes:     { seriesId, originalStartsAt: ISO, action: 'move', date, time, durationMin?, meetUrl? }
// Fecha y hora en hora de Buenos Aires. `originalStartsAt` es el startsAt que devolvió
// GET /api/classes para esa clase; tiene que ser una clase REAL de la serie.
// Cancelar/mover es idempotente por (serie, original): repetirlo reemplaza la excepción.
// No se agenda en el pasado: una clase suelta o "mover" a una fecha/hora que ya pasó → 400
// (mover a su mismo horario, p. ej. para cambiarle el link, se deja). Cancelar, sí.
// Una clase por franja del profe: si choca con otra de cualquiera de sus alumnos → 409.

const err = (status: 400 | 401 | 403 | 404 | 409, msg: string) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { studentId, seriesId, originalStartsAt, action, date, time, durationMin, meetUrl } = body as Record<string, unknown>

  const link = normalizeZoomRoomUrl(meetUrl)
  if (!link.ok) return err(400, CLASS_ERRORS.zoomOnly)

  // ── Excepción de una clase del horario fijo ──
  if (seriesId !== undefined) {
    if (action !== 'cancel' && action !== 'move') return err(400, "action tiene que ser 'cancel' o 'move'")
    if (!isUuid(seriesId)) return err(404, CLASS_ERRORS.classNotFound)
    const series = await getSeries(seriesId)
    const scope = rowScopeFor(me, series, series ? await getStudentById(series.studentId) : null)
    if (!series || !scope.ok) return err(404, CLASS_ERRORS.classNotFound)

    const original = typeof originalStartsAt === 'string' ? new Date(originalStartsAt) : null
    if (!original || isNaN(original.getTime()) || !isOccurrence(series, original)) {
      return err(400, 'Esa clase no es parte del horario fijo')
    }

    let startsAt = original
    let dur = series.durationMin
    if (action === 'move') {
      const minute = parseTime(time)
      if (!isDateStr(date) || minute === null) return err(400, 'Fecha u hora inválida')
      if (durationMin !== undefined && !isDurationOk(durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
      startsAt = zonedToUtc(date, minute)
      if (durationMin !== undefined) dur = durationMin as number
      if (startsAt.getTime() !== original.getTime() && isPastStart(startsAt)) return err(400, CLASS_ERRORS.pastDate)
      // La clase que se mueve no choca consigo misma (como está hoy: la del horario o su excepción).
      const self = (c: { seriesId: string | null; startsAt: Date; originalStartsAt: Date | null }) =>
        c.seriesId === series.id && (c.originalStartsAt ?? c.startsAt).getTime() === original.getTime()
      if (await findTeacherClash(scope.teacherId, [{ startsAt, durationMin: dur }], self)) return err(409, CLASS_ERRORS.overlap)
    }
    const event = await upsertException({
      teacherId: scope.teacherId, studentId: series.studentId, seriesId: series.id, originalStartsAt: original,
      startsAt, durationMin: dur, status: action === 'cancel' ? 'cancelled' : 'scheduled',
      meetUrl: action === 'move' ? link.url : null, createdBy: me.id,
    })
    return NextResponse.json({ event: { id: event.id } }, { status: 201 })
  }

  // ── Clase suelta ──
  if (typeof studentId !== 'string' || !studentId) return err(400, 'studentId requerido')
  const minute = parseTime(time)
  if (!isDateStr(date) || minute === null) return err(400, 'Fecha u hora inválida')
  if (!isDurationOk(durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
  const startsAt = zonedToUtc(date, minute)
  if (isPastStart(startsAt)) return err(400, CLASS_ERRORS.pastDate)
  const scope = classScopeFor(me, await getStudentById(studentId))
  if (!scope.ok) return err(scope.status, scope.error)
  if (await findTeacherClash(scope.teacherId, [{ startsAt, durationMin }])) return err(409, CLASS_ERRORS.overlap)

  const event = await createSingleClass({
    teacherId: scope.teacherId, studentId, startsAt, durationMin,
    meetUrl: link.url, createdBy: me.id,
  })
  return NextResponse.json({ event: { id: event.id } }, { status: 201 })
}
