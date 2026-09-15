import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assignments, videos } from '@/lib/db/schema'
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
