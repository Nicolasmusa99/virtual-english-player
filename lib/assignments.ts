import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assignments, users, videos, videoSessions } from '@/lib/db/schema'
import type { SharedType, SharedLevel } from '@/lib/db/schema'

// Capa de datos de `assignments`. Igual que lib/users.ts: helpers finos de DB,
// SIN autorización — el guard (alumno es del profe / video accesible / rol) vive
// en las rutas (commit b). NUNCA toca video_sessions: assignments es read-only
// respecto de las captions (el invariante). La versión que ve el alumno se
// resuelve aparte por su teacher_id; acá solo vive el puntero de acceso.

export type AssignmentVideo = {
  videoId: string
  originalName: string
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  durationSec: number | null
  publishedAt: Date | null
  active: boolean // publishedAt !== null: si el admin despublicó, la fila persiste pero queda inerte
  assignedAt: Date
  assignedBy: string | null
}

// Alta idempotente. El caller (ruta) ya validó que el alumno es del profe y que el
// video es accesible/publicado. Re-asignar el mismo par no crea fila ni falla.
export async function assignVideo(data: {
  studentId: string
  videoId: string
  assignedBy: string
}): Promise<{ created: boolean }> {
  const rows = await db
    .insert(assignments)
    .values({ studentId: data.studentId, videoId: data.videoId, assignedBy: data.assignedBy })
    .onConflictDoNothing({ target: [assignments.studentId, assignments.videoId] })
    .returning({ studentId: assignments.studentId })
  return { created: rows.length > 0 }
}

// Baja. Devuelve si la asignación existía (para distinguir 200 de 404 en la ruta).
export async function unassignVideo(studentId: string, videoId: string): Promise<{ removed: boolean }> {
  const rows = await db
    .delete(assignments)
    .where(and(eq(assignments.studentId, studentId), eq(assignments.videoId, videoId)))
    .returning({ studentId: assignments.studentId })
  return { removed: rows.length > 0 }
}

// Lo asignado a UN alumno: metadata del video, NO captions. `active` refleja si el
// video sigue publicado ahora (mismo criterio que getAccessibleVideo). Una fila
// inerte (video despublicado) sigue apareciendo, marcada active:false.
export async function listAssignmentsForStudent(studentId: string): Promise<AssignmentVideo[]> {
  const rows = await db
    .select({
      videoId: assignments.videoId,
      assignedAt: assignments.assignedAt,
      assignedBy: assignments.assignedBy,
      originalName: videos.originalName,
      sharedType: videos.sharedType,
      sharedLevel: videos.sharedLevel,
      durationSec: videos.durationSec,
      publishedAt: videos.publishedAt,
    })
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .where(eq(assignments.studentId, studentId))
    .orderBy(desc(assignments.assignedAt))
  return rows.map((r) => ({ ...r, active: r.publishedAt !== null }))
}

const teacherAssignmentCols = {
  studentId: assignments.studentId,
  videoId: assignments.videoId,
  assignedAt: assignments.assignedAt,
  assignedBy: assignments.assignedBy,
  originalName: videos.originalName,
  sharedType: videos.sharedType,
  sharedLevel: videos.sharedLevel,
  durationSec: videos.durationSec,
  publishedAt: videos.publishedAt,
}

// Todas las asignaciones de los alumnos de UN profe (para el home del profe).
// El filtro va por users.teacher_id = teacherId, no por parámetro del cliente.
export async function listAssignmentsForTeacher(
  teacherId: string
): Promise<(AssignmentVideo & { studentId: string })[]> {
  const rows = await db
    .select(teacherAssignmentCols)
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .innerJoin(users, eq(users.id, assignments.studentId))
    .where(eq(users.teacherId, teacherId))
    .orderBy(desc(assignments.assignedAt))
  return rows.map((r) => ({ ...r, active: r.publishedAt !== null }))
}

// Todas las asignaciones (solo admin).
export async function listAllAssignments(): Promise<(AssignmentVideo & { studentId: string })[]> {
  const rows = await db
    .select(teacherAssignmentCols)
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .orderBy(desc(assignments.assignedAt))
  return rows.map((r) => ({ ...r, active: r.publishedAt !== null }))
}

// ─── Vista del ALUMNO (fase vista-alumno, E1) ──────────────────────────────────
// Lo que el alumno puede abrir: SOLO un video que tiene asignado, publicado y listo.
// Las captions son la "versión viva" de SU profe actual (student.teacher_id) y, si
// ese profe nunca editó el video, las del DUEÑO. Todo read-only: esta función NUNCA
// escribe video_sessions (el alumno no tiene copia propia).

export type StudentPhrase = { start: number; end: number; text: string }
export type StudentVideo = {
  videoId: string
  originalName: string
  storageUrl: string
  durationSec: number | null
  phrases: StudentPhrase[]
  delay: number
}

type CaptionRow = { userId: string; phrases: unknown; delay: number }

// Elige de qué copia salen las captions. Pura (sin DB) para poder testear la regla:
//   1) la del profe actual del alumno  2) la del dueño del video  3) ninguna.
// Solo acepta coincidencias EXACTAS de usuario: una fila de cualquier otro (otro
// profe, otro alumno) nunca se elige, aunque llegue en `rows`.
export function pickCaptionsRow(
  rows: CaptionRow[],
  teacherId: string | null,
  ownerId: string
): { row: CaptionRow; source: 'teacher' | 'owner' } | null {
  const byTeacher = teacherId ? rows.find((r) => r.userId === teacherId) : undefined
  if (byTeacher) return { row: byTeacher, source: 'teacher' }
  const byOwner = rows.find((r) => r.userId === ownerId)
  if (byOwner) return { row: byOwner, source: 'owner' }
  return null
}

// Deja solo lo que el player del alumno necesita de cada frase ({start,end,text}),
// descartando cualquier otro campo de la copia del profe (p. ej. su selección `sel`).
export function toStudentPhrases(raw: unknown): StudentPhrase[] {
  if (!Array.isArray(raw)) return []
  const out: StudentPhrase[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const { start, end, text } = p as Record<string, unknown>
    if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') continue
    out.push({ start, end, text })
  }
  return out
}

// null = "no existe" o "no es tuyo" (la ruta responde lo mismo a ambos: 404).
export async function getStudentMaterial(studentId: string, videoId: string): Promise<StudentVideo | null> {
  const [hit] = await db
    .select({
      videoId: videos.id,
      originalName: videos.originalName,
      storageUrl: videos.storageUrl,
      durationSec: videos.durationSec,
      ownerId: videos.userId,
      teacherId: users.teacherId,
    })
    .from(assignments)
    .innerJoin(videos, eq(videos.id, assignments.videoId))
    .innerJoin(users, eq(users.id, assignments.studentId))
    .where(
      and(
        eq(assignments.studentId, studentId),
        eq(assignments.videoId, videoId),
        eq(users.role, 'alumno'),
        isNotNull(videos.publishedAt), // despublicado → no existe para el alumno
        eq(videos.status, 'ready'),
        isNotNull(videos.storageUrl)
      )
    )
  if (!hit || !hit.storageUrl) return null

  const candidates = [hit.teacherId, hit.ownerId].filter((id): id is string => !!id)
  const rows = await db
    .select({ userId: videoSessions.userId, phrases: videoSessions.phrases, delay: videoSessions.delay })
    .from(videoSessions)
    .where(and(eq(videoSessions.videoId, videoId), inArray(videoSessions.userId, candidates)))
  const picked = pickCaptionsRow(rows, hit.teacherId, hit.ownerId)

  return {
    videoId: hit.videoId,
    originalName: hit.originalName,
    storageUrl: hit.storageUrl,
    durationSec: hit.durationSec,
    phrases: picked ? toStudentPhrases(picked.row.phrases) : [],
    delay: picked ? Number(picked.row.delay) || 0 : 0,
  }
}
