import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { listProgressForVideo } from '@/lib/assignments'
import { markLabel } from '@/lib/progressView'

// Avance del alumno (2026-11) — GET: dónde dejó ESTE video cada alumno, para las marcas
// de la barra del player del profe.
// Seguridad: el profe ve SOLO a sus alumnos (users.teacher_id = su id, server-side); el
// admin ve a todos. Lista blanca: id, nombre corto, segundo y fecha. Sin mails.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ progress: [] })

  const rows = await listProgressForVideo(id, me.role === 'admin' ? null : me.id)
  return NextResponse.json({
    progress: rows.map((r) => ({
      studentId: r.studentId, name: markLabel(r.name, r.email), positionSec: r.positionSec, seenAt: r.seenAt.toISOString(),
    })),
  })
}
