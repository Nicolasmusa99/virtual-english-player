// Carpetas (2026-11). Dos clases (ver lib/db/schema.ts):
//   · de la BIBLIOTECA (student_id NULL): el admin ordena los videos; los videos van en
//     folder_videos y un video puede estar en varias.
//   · de un ALUMNO: su profe (o el admin) ordena su material; adentro van SUS asignaciones
//     (assignments.folder_id). El acceso sigue siendo la asignación: la carpeta solo ordena.
// Igual que lib/assignments.ts: helpers finos de base SIN autorización (la deciden las
// rutas). Lo puro (nombre, orden, agrupar) está en lib/folderView.ts.
import { and, asc, eq, isNull, max } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assignments, folders, folderVideos } from '@/lib/db/schema'
import { moveInList } from '@/lib/folderView'
export { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName } from '@/lib/folderView'

// ─── Base ───────────────────────────────────────────────────────────────────

export type Folder = { id: string; name: string; studentId: string | null; position: number }
const COLS = { id: folders.id, name: folders.name, studentId: folders.studentId, position: folders.position }
const ORDER = [asc(folders.position), asc(folders.createdAt)] as const
const scopeOf = (studentId: string | null) => (studentId ? eq(folders.studentId, studentId) : isNull(folders.studentId))

export async function getFolder(id: string): Promise<Folder | null> {
  const [row] = await db.select(COLS).from(folders).where(eq(folders.id, id))
  return row ?? null
}

// Las carpetas de un alumno, en orden.
export async function listStudentFolders(studentId: string): Promise<Folder[]> {
  return db.select(COLS).from(folders).where(scopeOf(studentId)).orderBy(...ORDER)
}

// Las carpetas de la biblioteca, en orden, con los ids de sus videos.
export async function listLibraryFolders(): Promise<(Folder & { videoIds: string[] })[]> {
  const list = await db.select(COLS).from(folders).where(scopeOf(null)).orderBy(...ORDER)
  if (list.length === 0) return []
  const links = await db.select({ folderId: folderVideos.folderId, videoId: folderVideos.videoId })
    .from(folderVideos).orderBy(asc(folderVideos.addedAt))
  return list.map((f) => ({ ...f, videoIds: links.filter((l) => l.folderId === f.id).map((l) => l.videoId) }))
}

// Nueva carpeta, al final de sus hermanas.
export async function createFolder(data: { ownerId: string; studentId: string | null; name: string }): Promise<Folder> {
  const [{ top }] = await db.select({ top: max(folders.position) }).from(folders).where(scopeOf(data.studentId))
  const [row] = await db.insert(folders)
    .values({ ownerId: data.ownerId, studentId: data.studentId, name: data.name, position: (top ?? -1) + 1 })
    .returning(COLS)
  return row
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.update(folders).set({ name }).where(eq(folders.id, id))
}

// Borrar una carpeta: sus videos de la biblioteca salen de ella (folder_videos en cascada)
// y las asignaciones que tenía quedan "sin carpeta" (SET NULL): el alumno no pierde nada.
export async function deleteFolder(id: string): Promise<boolean> {
  const rows = await db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id })
  return rows.length > 0
}

// Subir / bajar una carpeta entre sus hermanas (reescribe las posiciones 0..n-1).
export async function moveFolder(folder: Folder, dir: -1 | 1): Promise<void> {
  const siblings = await db.select({ id: folders.id }).from(folders).where(scopeOf(folder.studentId)).orderBy(...ORDER)
  const ids = moveInList(siblings.map((s) => s.id), siblings.findIndex((s) => s.id === folder.id), dir)
  await Promise.all(ids.map((id, position) => db.update(folders).set({ position }).where(eq(folders.id, id))))
}

// Videos de una carpeta de la biblioteca (idempotente).
export async function addVideoToFolder(folderId: string, videoId: string): Promise<void> {
  await db.insert(folderVideos).values({ folderId, videoId }).onConflictDoNothing()
}
export async function removeVideoFromFolder(folderId: string, videoId: string): Promise<boolean> {
  const rows = await db.delete(folderVideos)
    .where(and(eq(folderVideos.folderId, folderId), eq(folderVideos.videoId, videoId)))
    .returning({ folderId: folderVideos.folderId })
  return rows.length > 0
}

// Pasar un video asignado a otra carpeta del alumno (null = sin carpeta).
export async function setAssignmentFolder(studentId: string, videoId: string, folderId: string | null): Promise<boolean> {
  const rows = await db.update(assignments).set({ folderId })
    .where(and(eq(assignments.studentId, studentId), eq(assignments.videoId, videoId)))
    .returning({ videoId: assignments.videoId })
  return rows.length > 0
}
