import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { listAssignmentsForStudent } from '@/lib/assignments'

// Vista del alumno (E1) — SU material asignado.
// Seguridad:
//   · Solo rol 'alumno' (admin y profe reciben 403: tienen sus propias rutas).
//   · El id del alumno sale de la SESIÓN. Esta ruta no lee nada del pedido: ni
//     query ni body pueden apuntar a otro alumno.
//   · Los despublicados NO se devuelven (para el alumno no existen).
//   · Lista blanca de campos: sin quién asignó, sin ids de profe/dueño.
export async function GET() {
  const gate = await requireRole('alumno')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const rows = await listAssignmentsForStudent(gate.session.user.id)
  const material = rows
    .filter((r) => r.active)
    .map((r) => ({
      videoId: r.videoId,
      originalName: r.originalName,
      sharedType: r.sharedType,
      sharedLevel: r.sharedLevel,
      durationSec: r.durationSec,
      assignedAt: r.assignedAt,
    }))
  return NextResponse.json({ material })
}
