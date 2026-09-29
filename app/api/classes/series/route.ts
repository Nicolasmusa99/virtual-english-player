import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { classScopeFor } from '@/lib/classAccess'
import { createSeries } from '@/lib/classes'
import { isDateStr, isDurationOk, isWeekday, normalizeMeetUrl, parseTime, seriesToJson } from '@/lib/classSchedule'

// Calendario (C1) — crear el HORARIO FIJO semanal de un alumno.
// POST /api/classes/series
//   { studentId, weekday: 0-6, time: 'HH:MM', durationMin: 15-240,
//     startsOn: 'YYYY-MM-DD', endsOn?: 'YYYY-MM-DD' | null, meetUrl?: https Zoom/Meet/Teams }
// Día y hora en hora de Buenos Aires. teacher_id lo decide el servidor (classScopeFor).

const err = (status: 400 | 401 | 403 | 404, msg: string) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { studentId, weekday, time, durationMin, startsOn, endsOn, meetUrl } = body as Record<string, unknown> // mass-assignment cerrado

  if (typeof studentId !== 'string' || !studentId) return err(400, 'studentId requerido')
  if (!isWeekday(weekday)) return err(400, 'Día de la semana inválido')
  const startMinute = parseTime(time)
  if (startMinute === null) return err(400, 'Hora inválida (HH:MM)')
  if (!isDurationOk(durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
  if (!isDateStr(startsOn)) return err(400, 'Fecha de inicio inválida')
  if (endsOn != null && (!isDateStr(endsOn) || endsOn < startsOn)) return err(400, 'Fecha de fin inválida')
  const link = normalizeMeetUrl(meetUrl)
  if (!link.ok) return err(400, 'El link tiene que ser de Zoom, Google Meet o Teams (https)')

  const scope = classScopeFor(me, await getStudentById(studentId))
  if (!scope.ok) return err(scope.status, scope.error)

  const series = await createSeries({
    teacherId: scope.teacherId, studentId, weekday, startMinute, durationMin, startsOn,
    endsOn: (endsOn as string | null | undefined) ?? null, meetUrl: link.url, createdBy: me.id,
  })
  return NextResponse.json({ series: seriesToJson(series) }, { status: 201 })
}
