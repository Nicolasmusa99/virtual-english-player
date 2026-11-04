import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { editableFolder } from '@/lib/staffAccess'
import { addVideoToFolder, removeVideoFromFolder } from '@/lib/folders'
import { videoExists } from '@/lib/library'

// Carpetas de la BIBLIOTECA (2026-11) — meter o sacar un video. Solo el admin (las
// carpetas de un alumno se llenan asignando: PATCH/POST /api/assignments con folderId).
// POST   /api/folders/[id]/videos { videoId } → agregarlo (idempotente).
// DELETE /api/folders/[id]/videos { videoId } → sacarlo de la carpeta (el video no se borra).
type Ctx = { params: Promise<{ id: string }> }
const err = (status: number, msg: string) => NextResponse.json({ error: msg }, { status })

type Prepared = { ok: false; res: NextResponse } | { ok: true; folderId: string; videoId: string }

async function prepare(req: NextRequest, { params }: Ctx): Promise<Prepared> {
  const gate = await requireRole('admin')
  if (!gate.ok) return { ok: false, res: err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado') }
  const body = await req.json().catch(() => null)
  const videoId = (body as Record<string, unknown> | null)?.videoId
  if (typeof videoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(videoId)) return { ok: false, res: err(400, 'videoId requerido') }
  const access = await editableFolder((await params).id, gate.session.user)
  if (!access.ok) return { ok: false, res: err(access.status, access.error) }
  if (access.folder.studentId !== null) return { ok: false, res: err(400, 'Esa carpeta es de un alumno: se llena asignándole material') }
  return { ok: true, folderId: access.folder.id, videoId }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const p = await prepare(req, ctx)
  if (!p.ok) return p.res
  if (!(await videoExists(p.videoId))) return err(404, 'Video no encontrado')
  await addVideoToFolder(p.folderId, p.videoId)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const p = await prepare(req, ctx)
  if (!p.ok) return p.res
  if (!(await removeVideoFromFolder(p.folderId, p.videoId))) return err(404, 'Ese video no está en la carpeta')
  return NextResponse.json({ ok: true })
}
