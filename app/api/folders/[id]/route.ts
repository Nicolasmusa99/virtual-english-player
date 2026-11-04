import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { editableFolder } from '@/lib/staffAccess'
import { deleteFolder, FOLDER_NAME_ERROR, moveFolder, normalizeFolderName, renameFolder } from '@/lib/folders'

// Carpetas (2026-11) — editar una carpeta.
// PATCH  /api/folders/[id] { name? , move?: 'up' | 'down' } → renombrar y/o moverla de lugar.
// DELETE /api/folders/[id] → borrarla. Lo que tenía NO se pierde: los videos de un alumno
//                             quedan "sin carpeta" y los de la biblioteca siguen en ella.
// Quién: la de un alumno, el admin o su profe; la de la biblioteca, solo el admin. Lo
// demás (ajena, inexistente, id raro) es el MISMO 404.
type Ctx = { params: Promise<{ id: string }> }
const err = (status: number, msg: string) => NextResponse.json({ error: msg }, { status })

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { name: rawName, move } = body as Record<string, unknown>

  const access = await editableFolder((await params).id, gate.session.user)
  if (!access.ok) return err(access.status, access.error)

  if (rawName === undefined && move === undefined) return err(400, 'Nada para cambiar')
  let name: string | null = null
  if (rawName !== undefined) {
    name = normalizeFolderName(rawName)
    if (!name) return err(400, FOLDER_NAME_ERROR)
  }
  if (move !== undefined && move !== 'up' && move !== 'down') return err(400, "move tiene que ser 'up' o 'down'")

  if (name) await renameFolder(access.folder.id, name)
  if (move) await moveFolder(access.folder, move === 'up' ? -1 : 1)
  return NextResponse.json({ ok: true, folder: { ...access.folder, name: name ?? access.folder.name } })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const access = await editableFolder((await params).id, gate.session.user)
  if (!access.ok) return err(access.status, access.error)
  await deleteFolder(access.folder.id)
  return NextResponse.json({ ok: true })
}
