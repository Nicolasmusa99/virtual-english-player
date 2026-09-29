import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getZoomUrl, setZoomUrl } from '@/lib/users'
import { normalizeZoomRoomUrl } from '@/lib/classSchedule'

// Calendario (G0) — "Mi sala de Zoom": el link personal de Zoom del profe (o admin).
// GET → { zoomUrl }   PUT { zoomUrl } → guarda ('' o null = la quita).
// SIEMPRE sobre el usuario de la sesión: no hay id en el pedido. Solo https de zoom.us.

const err = (status: 400 | 401 | 403, msg: string) => NextResponse.json({ error: msg }, { status })

export async function GET() {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  return NextResponse.json({ zoomUrl: await getZoomUrl(gate.session.user.id) })
}

export async function PUT(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('zoomUrl' in body)) return err(400, 'Body inválido')
  const link = normalizeZoomRoomUrl((body as Record<string, unknown>).zoomUrl)
  if (!link.ok) return err(400, 'Tiene que ser un link de Zoom (https://…zoom.us/…)')

  await setZoomUrl(gate.session.user.id, link.url)
  return NextResponse.json({ zoomUrl: link.url })
}
