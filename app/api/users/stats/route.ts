import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { listAllUsers, listStudentsOf } from '@/lib/users'
import { studentStats } from '@/lib/people'

// ─── GET /api/users/stats — el resumen de cada alumno para la lista (2026-11) ──
// { stats: { [alumnoId]: { materialCount, folderCount, nextClassAt } } }. Mismo alcance
// que GET /api/users: el admin, de todos; el profe, SOLO de sus alumnos (server-side).
export async function GET() {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user

  const people = me.role === 'admin' ? await listAllUsers() : await listStudentsOf(me.id)
  const students = people.filter((u) => u.role === 'alumno').map((u) => ({ id: u.id, teacherId: u.teacherId }))
  return NextResponse.json({ stats: await studentStats(students) })
}
