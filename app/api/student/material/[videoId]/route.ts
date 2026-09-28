import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentMaterial } from '@/lib/assignments'

// Vista del alumno (E1) — UN video asignado, con la versión viva de SU profe.
// Seguridad:
//   · Solo rol 'alumno'. El id del alumno sale de la SESIÓN, nunca del pedido.
//   · "No existe", "no es tuyo", "despublicado" y "id inválido" responden IGUAL
//     (404 con el mismo cuerpo): no se puede sondear qué videos existen.
//   · Lista blanca de campos: nombre, URL del video, frases {start,end,text} y delay.
//     Sin ids de profe/dueño, sin emails, sin la selección del profe.
//   · LÍMITE CONOCIDO (fase futura, no se arregla en la v1): `storageUrl` es una URL
//     PÚBLICA de Vercel Blob (imposible de adivinar, pero sin vencimiento). Un alumno
//     que la copie la conserva aunque lo desasignen. Cerrarlo = blobs privados + URL
//     firmada con vencimiento servida por esta ruta. Hoy pasa lo mismo con los profes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND = { error: 'Material no encontrado' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  const gate = await requireRole('alumno')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const { videoId } = await params
  if (!UUID_RE.test(videoId)) return NextResponse.json(NOT_FOUND, { status: 404 })

  const m = await getStudentMaterial(gate.session.user.id, videoId)
  if (!m) return NextResponse.json(NOT_FOUND, { status: 404 })

  return NextResponse.json({
    video: { id: m.videoId, originalName: m.originalName, storageUrl: m.storageUrl, durationSec: m.durationSec },
    captions: { phrases: m.phrases, delay: m.delay },
  })
}
