import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { saveProgress } from '@/lib/assignments'
import { parseProgressBody } from '@/lib/progressView'

// Avance del alumno (2026-11) — PUT { position }: dónde dejó ESTE video.
// Seguridad:
//   · Solo rol 'alumno'. El id del alumno sale de la SESIÓN, nunca del pedido.
//   · Solo actualiza una asignación que ya existe: "no es tuyo", "no existe" e "id
//     inválido" responden IGUAL (404), como GET de esta misma ruta.
//   · Solo se escribe el segundo y la hora (lista blanca); nada del video ni de las captions.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = { error: 'Material no encontrado' }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  const gate = await requireRole('alumno')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const { videoId } = await params
  if (!UUID_RE.test(videoId)) return NextResponse.json(NOT_FOUND, { status: 404 })

  const position = parseProgressBody(await req.json().catch(() => null))
  if (position == null) return NextResponse.json({ error: 'Posición inválida' }, { status: 400 })

  if (!(await saveProgress(gate.session.user.id, videoId, position))) return NextResponse.json(NOT_FOUND, { status: 404 })
  return NextResponse.json({ ok: true })
}
