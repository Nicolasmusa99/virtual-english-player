import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import type { Role } from '@/lib/db/schema'
import { getStudentById } from '@/lib/users'
import { getAccessibleVideo } from '@/lib/library'
import {
  assignVideo,
  unassignVideo,
  listAssignmentsForStudent,
  listAssignmentsForTeacher,
  listAllAssignments,
} from '@/lib/assignments'

const err = (status: 400 | 401 | 403 | 404, msg: string) =>
  NextResponse.json({ error: msg }, { status })

// Guard del alumno: existe, es 'alumno', y —si el que pide es PROFE— es SUYO
// (teacher_id === su id, chequeado server-side, nunca del body). Admin: cualquiera.
async function checkStudent(
  studentId: unknown,
  me: { id: string; role: Role | null } // requireRole ya garantizó admin|profesor; solo 'profesor' se restringe a sus alumnos
): Promise<
  | { ok: true; student: NonNullable<Awaited<ReturnType<typeof getStudentById>>> }
  | { ok: false; res: NextResponse }
> {
  if (typeof studentId !== 'string' || !studentId) return { ok: false, res: err(400, 'studentId requerido') }
  const student = await getStudentById(studentId)
  if (!student || student.role !== 'alumno') return { ok: false, res: err(404, 'Alumno no encontrado') }
  if (me.role === 'profesor' && student.teacherId !== me.id) {
    return { ok: false, res: err(403, 'Ese alumno no es tuyo') }
  }
  return { ok: true, student }
}

// ─── POST /api/assignments — asignar (idempotente) ───────────────────────────
export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { studentId, videoId } = body as Record<string, unknown> // mass-assignment cerrado

  const chk = await checkStudent(studentId, me)
  if (!chk.ok) return chk.res

  // El video debe existir Y estar PUBLICADO (no se asigna material privado/despublicado).
  if (typeof videoId !== 'string' || !videoId) return err(400, 'videoId requerido')
  const video = await getAccessibleVideo(me.id, videoId)
  if (!video) return err(404, 'Video no encontrado')
  if (!video.publishedAt) return err(400, 'El video no está publicado')

  const { created } = await assignVideo({ studentId: chk.student.id, videoId, assignedBy: me.id })
  return NextResponse.json({ ok: true, created }, { status: created ? 201 : 200 })
}

// ─── DELETE /api/assignments — desasignar ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { studentId, videoId } = body as Record<string, unknown>

  const chk = await checkStudent(studentId, me)
  if (!chk.ok) return chk.res
  if (typeof videoId !== 'string' || !videoId) return err(400, 'videoId requerido')

  const { removed } = await unassignVideo(chk.student.id, videoId)
  if (!removed) return err(404, 'La asignación no existe')
  return NextResponse.json({ ok: true })
}

// ─── GET /api/assignments — listar ───────────────────────────────────────────
// ?studentId=X → asignaciones de ese alumno (con guard de pertenencia).
// sin studentId → profe: las de TODOS sus alumnos; admin: todas.
export async function GET(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const studentId = new URL(req.url).searchParams.get('studentId')
  if (studentId) {
    const chk = await checkStudent(studentId, me)
    if (!chk.ok) return chk.res
    return NextResponse.json({ assignments: await listAssignmentsForStudent(chk.student.id) })
  }

  const assignments =
    me.role === 'admin' ? await listAllAssignments() : await listAssignmentsForTeacher(me.id)
  return NextResponse.json({ assignments })
}
