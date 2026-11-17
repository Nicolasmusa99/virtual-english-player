import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { saveClassProgress } from '@/lib/classProgress'
import { parseClassProgressBody } from '@/lib/progressView'

// Avance en CLASE (2026-11) — PUT { studentId, position }: dónde quedó ESTE video cuando el
// profe se lo mostró a ese alumno. Lo manda el player del profe mientras reproduce.
// Seguridad:
//   · Solo admin o profesor. El profe, solo con SUS alumnos actuales (users.teacher_id);
//     el admin, con cualquier alumno. Si no, el mismo 404 que "no existe".
//   · teacher_id = quien está en la SESIÓN, nunca del pedido.
//   · Video inexistente: la FK falla y responde 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = { error: 'No encontrado' }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json(NOT_FOUND, { status: 404 })
  const body = parseClassProgressBody(await req.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const student = await getStudentById(body.studentId)
  const allowed = !!student && student.role === 'alumno' && (me.role === 'admin' || student.teacherId === me.id)
  if (!allowed) return NextResponse.json(NOT_FOUND, { status: 404 })

  try {
    await saveClassProgress(body.studentId, id, me.id, body.position)
  } catch {
    return NextResponse.json(NOT_FOUND, { status: 404 }) // el video no existe (FK)
  }
  return NextResponse.json({ ok: true })
}
