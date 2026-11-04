import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { checkStudentFor } from '@/lib/staffAccess'
import { createFolder, FOLDER_NAME_ERROR, listLibraryFolders, listStudentFolders, normalizeFolderName } from '@/lib/folders'
import { listSharedVideoIds } from '@/lib/library'

// Carpetas (2026-11).
// GET  /api/folders?studentId=X → las carpetas de ese alumno (admin, o su profe).
// GET  /api/folders             → las de la biblioteca, con sus videos. El profe solo ve
//                                 los videos PUBLICADOS y no ve carpetas que queden vacías.
// POST /api/folders { name, studentId? } → nueva carpeta: de ese alumno (admin o su profe)
//                                 o, sin studentId, de la biblioteca (solo el admin).
const err = (status: number, msg: string) => NextResponse.json({ error: msg }, { status })

export async function GET(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const studentId = new URL(req.url).searchParams.get('studentId')
  if (studentId) {
    const chk = await checkStudentFor(studentId, me)
    if (!chk.ok) return err(chk.status, chk.error)
    return NextResponse.json({ folders: await listStudentFolders(chk.student.id) })
  }

  const list = await listLibraryFolders()
  if (me.role === 'admin') return NextResponse.json({ folders: list })
  const published = new Set(await listSharedVideoIds())
  return NextResponse.json({
    folders: list
      .map((f) => ({ ...f, videoIds: f.videoIds.filter((v) => published.has(v)) }))
      .filter((f) => f.videoIds.length > 0),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const { name: rawName, studentId } = body as Record<string, unknown> // solo estos dos
  const name = normalizeFolderName(rawName)
  if (!name) return err(400, FOLDER_NAME_ERROR)

  if (studentId === undefined || studentId === null) {
    if (me.role !== 'admin') return err(403, 'Solo el admin arma las carpetas de la biblioteca')
    return NextResponse.json({ folder: await createFolder({ ownerId: me.id, studentId: null, name }) }, { status: 201 })
  }
  const chk = await checkStudentFor(studentId, me)
  if (!chk.ok) return err(chk.status, chk.error)
  return NextResponse.json({ folder: await createFolder({ ownerId: me.id, studentId: chk.student.id, name }) }, { status: 201 })
}
