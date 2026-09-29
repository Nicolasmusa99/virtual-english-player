import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { classScopeFor } from '@/lib/classAccess'
import { getSchedule, listActiveSeries } from '@/lib/classes'
import { classToJson, dateInTz, parseRange, seriesToJson } from '@/lib/classSchedule'

// Calendario (C1) — lado PROFE. Las clases de UN alumno + sus horarios fijos vigentes.
// GET /api/classes?studentId=X[&from=ISO&to=ISO]  (sin rango: desde hace 2 h, 35 días)
// Profe: solo sus alumnos (403 si no). Admin: cualquiera (las del profe actual del alumno).

const err = (status: 400 | 401 | 403 | 404, msg: string) => NextResponse.json({ error: msg }, { status })

export async function GET(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const q = new URL(req.url).searchParams
  const studentId = q.get('studentId')
  if (!studentId) return err(400, 'studentId requerido')
  const scope = classScopeFor(me, await getStudentById(studentId))
  if (!scope.ok) return err(scope.status, scope.error)

  const now = new Date()
  const range = parseRange(q.get('from'), q.get('to'), now, 35, 120)
  if (!range.ok) return err(400, 'Rango de fechas inválido')

  const [classes, series] = await Promise.all([
    getSchedule(studentId, scope.teacherId, range.from, range.to),
    listActiveSeries(studentId, scope.teacherId, dateInTz(now)),
  ])
  return NextResponse.json({ series: series.map(seriesToJson), classes: classes.map(classToJson) })
}
