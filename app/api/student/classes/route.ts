import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById, getUserName, getZoomUrl } from '@/lib/users'
import { getSchedule, withRoomLink } from '@/lib/classes'
import { classToStudentJson, parseRange } from '@/lib/classSchedule'

// Calendario (C1) — lado ALUMNO: SUS clases con su profe ACTUAL.
// GET /api/student/classes[?from=ISO&to=ISO]  (sin rango: desde hace 2 h, 35 días; máx. 100 días)
// El alumno sale SIEMPRE de la sesión (no hay studentId en el pedido). Lista blanca:
// { key, startsAt, durationMin, meetUrl, status } — nada de otros alumnos. Del profe, solo
// su nombre (teacherName, para "con Laura Sosa"; vista del alumno v2): ni mail ni id.
// Sin profe asignado → lista vacía. Las clases sin link propio usan "Mi sala de Zoom" de
// SU profe (G0).

export async function GET(req: NextRequest) {
  const gate = await requireRole('alumno')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  }
  const me = gate.session.user

  const q = new URL(req.url).searchParams
  const range = parseRange(q.get('from'), q.get('to'), new Date(), 35, 120)
  if (!range.ok) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 })

  const student = await getStudentById(me.id)
  if (!student?.teacherId) return NextResponse.json({ classes: [], teacherName: null })

  const [classes, room, teacherName] = await Promise.all([
    getSchedule(me.id, student.teacherId, range.from, range.to),
    getZoomUrl(student.teacherId),
    getUserName(student.teacherId),
  ])
  return NextResponse.json({ classes: withRoomLink(classes, room).map(classToStudentJson), teacherName })
}
