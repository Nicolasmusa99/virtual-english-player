import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { listProgressForVideo } from '@/lib/assignments'
import { listClassProgressForVideo } from '@/lib/classProgress'
import { markLabel } from '@/lib/progressView'

// Avance (2026-11) — GET: dónde quedó ESTE video con cada alumno, para el player del profe.
//   · inClass: dónde quedó cuando el profe se lo mostró en clase (el dato principal).
//   · own: hasta dónde lo vio el alumno por su cuenta (secundario).
// Seguridad: el profe ve SOLO a sus alumnos (users.teacher_id = su id, server-side); el
// admin ve a todos. Lista blanca: id, nombre corto, segundo y fecha. Sin mails.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = { studentId: string; name: string | null; email: string | null; positionSec: number; seenAt: Date }
const toJson = (r: Row) => ({ studentId: r.studentId, name: markLabel(r.name, r.email), positionSec: r.positionSec, seenAt: r.seenAt.toISOString() })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ inClass: [], own: [] })

  const scope = me.role === 'admin' ? null : me.id
  const [inClass, own] = await Promise.all([listClassProgressForVideo(id, scope), listProgressForVideo(id, scope)])
  return NextResponse.json({ inClass: inClass.map(toJson), own: own.map(toJson) })
}
