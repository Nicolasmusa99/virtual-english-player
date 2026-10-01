import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getZoomUrl, listStudentNames } from '@/lib/users'
import { getTeacherSchedule } from '@/lib/classes'
import { classToJson, parseRange, seriesToJson } from '@/lib/classSchedule'

// Calendario (G2) — "Mi agenda" del PROFE: todas sus clases de un rango (la semana que
// mira), con TODOS sus alumnos actuales (para nombrarlos, darles color y elegirlos al
// crear) y los horarios de los que salen esas clases (para editarlas).
// GET /api/classes/agenda[?from=ISO&to=ISO]  (sin rango: 7 días desde ahora; máx. 100)
// Solo profesor: el alcance sale de la SESIÓN (teacher_id = él), sin parámetros que lo
// amplíen. El admin no tiene agenda propia (sus clases quedan a nombre del profe de
// cada alumno): las ve y gestiona en la pantalla de cada alumno.

const err = (status: 400 | 401 | 403, msg: string) => NextResponse.json({ error: msg }, { status })

export async function GET(req: NextRequest) {
  const gate = await requireRole('profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const q = new URL(req.url).searchParams
  const range = parseRange(q.get('from'), q.get('to'), new Date(), 7)
  if (!range.ok) return err(400, 'Rango de fechas inválido')

  const students = await listStudentNames(me.id)
  const [{ classes, series }, zoomUrl] = await Promise.all([
    getTeacherSchedule(me.id, students.map((s) => s.id), range.from, range.to),
    getZoomUrl(me.id),
  ])
  return NextResponse.json({
    students: students.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    series: series.map((s) => ({ ...seriesToJson(s), studentId: s.studentId })),
    classes: classes.map((c) => ({ ...classToJson(c), studentId: c.studentId })),
    zoomUrl,
  })
}
