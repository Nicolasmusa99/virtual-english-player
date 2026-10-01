import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { CLASS_ERRORS, classScopeFor, isUuid, rowScopeFor } from '@/lib/classAccess'
import { createSeries, getEvent } from '@/lib/classes'
import { isDateStr, isDurationOk, normalizeWeekdays, normalizeZoomRoomUrl, parseTime, seriesToJson } from '@/lib/classSchedule'

// Calendario — crear un HORARIO que se repite todas las semanas (C1; G1: varios días).
// POST /api/classes/series
//   { studentId, weekdays: [0-6, …] (1 a 7 días), time: 'HH:MM', durationMin: 15-240,
//     startsOn: 'YYYY-MM-DD', endsOn?: 'YYYY-MM-DD' | null, meetUrl?: https de Zoom,
//     replacesEventId?: uuid de una clase SUELTA del mismo alumno (G1: "Se repite"
//     sobre una clase suelta → pasa a ser este horario, en el mismo paso) }
// Día y hora en hora de Buenos Aires. teacher_id lo decide el servidor (classScopeFor).

const err = (status: 400 | 401 | 403 | 404, msg: string) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { studentId, weekdays, time, durationMin, startsOn, endsOn, meetUrl, replacesEventId } = body as Record<string, unknown> // mass-assignment cerrado

  if (typeof studentId !== 'string' || !studentId) return err(400, 'studentId requerido')
  const days = normalizeWeekdays(weekdays)
  if (!days) return err(400, 'Días de la semana inválidos')
  const startMinute = parseTime(time)
  if (startMinute === null) return err(400, 'Hora inválida (HH:MM)')
  if (!isDurationOk(durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
  if (!isDateStr(startsOn)) return err(400, 'Fecha de inicio inválida')
  if (endsOn != null && (!isDateStr(endsOn) || endsOn < startsOn)) return err(400, 'Fecha de fin inválida')
  const link = normalizeZoomRoomUrl(meetUrl)
  if (!link.ok) return err(400, CLASS_ERRORS.zoomOnly)

  const scope = classScopeFor(me, await getStudentById(studentId))
  if (!scope.ok) return err(scope.status, scope.error)

  // La clase suelta que se reemplaza: del MISMO alumno y profe, y suelta (no excepción).
  if (replacesEventId !== undefined) {
    const ev = isUuid(replacesEventId) ? await getEvent(replacesEventId) : null
    const ok = ev && !ev.seriesId && ev.studentId === studentId &&
      rowScopeFor(me, ev, await getStudentById(ev.studentId)).ok
    if (!ok) return err(404, CLASS_ERRORS.classNotFound)
  }

  const series = await createSeries({
    teacherId: scope.teacherId, studentId, weekdays: days, startMinute, durationMin, startsOn,
    endsOn: (endsOn as string | null | undefined) ?? null, meetUrl: link.url, createdBy: me.id,
  }, replacesEventId as string | undefined)
  return NextResponse.json({ series: seriesToJson(series) }, { status: 201 })
}
