import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById, setUserName } from '@/lib/users'
import { NAME_ERROR, normalizePersonName } from '@/lib/personName'

// ─── PATCH /api/users/[id] — cambiar el nombre y apellido de un ALUMNO ───────
// admin → cualquier alumno; profesor → SOLO los suyos (teacher_id = él). Un alumno ajeno,
// otro rol o un id que no existe dan el mismo 404 (no se revela qué hay). Solo se lee `name`.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user
  const { id } = await params

  const body = await req.json().catch(() => null)
  const name = normalizePersonName((body as Record<string, unknown> | null)?.name)
  if (!name) return NextResponse.json({ error: NAME_ERROR }, { status: 400 })

  const target = await getStudentById(id)
  if (!target || target.role !== 'alumno' || (me.role === 'profesor' && target.teacherId !== me.id)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await setUserName(id, name)
  return NextResponse.json({ id, name })
}
