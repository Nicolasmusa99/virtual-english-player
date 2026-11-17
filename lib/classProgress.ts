// Avance en CLASE (2026-11): dónde quedó un video cuando el profe se lo mostró a un alumno.
// Es el dato principal de "dónde quedaron"; lo que el alumno mira por su cuenta está en
// assignments (lib/assignments.ts) y se muestra como secundario. Lo puro, en lib/progressView.ts.
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { classProgress, users } from '@/lib/db/schema'

export async function saveClassProgress(studentId: string, videoId: string, teacherId: string, positionSec: number, now: Date = new Date()): Promise<void> {
  await db.insert(classProgress)
    .values({ studentId, videoId, teacherId, positionSec, seenAt: now })
    .onConflictDoUpdate({ target: [classProgress.studentId, classProgress.videoId], set: { teacherId, positionSec, seenAt: now } })
}

export type ClassProgressRow = { studentId: string; name: string | null; email: string | null; positionSec: number; seenAt: Date }

// Dónde quedó ESTE video con cada alumno. `teacherId` = solo los alumnos ACTUALES de ese
// profe (users.teacher_id, server-side); null = todos (admin). Más reciente primero.
export async function listClassProgressForVideo(videoId: string, teacherId: string | null): Promise<ClassProgressRow[]> {
  const cond = [eq(classProgress.videoId, videoId)]
  if (teacherId) cond.push(eq(users.teacherId, teacherId))
  return db
    .select({ studentId: classProgress.studentId, name: users.name, email: users.email, positionSec: classProgress.positionSec, seenAt: classProgress.seenAt })
    .from(classProgress)
    .innerJoin(users, eq(users.id, classProgress.studentId))
    .where(and(...cond))
    .orderBy(desc(classProgress.seenAt))
}

// Todo lo visto en clase con UN alumno (para su ficha): videoId → dónde quedó y cuándo.
export async function listClassProgressForStudent(studentId: string): Promise<Map<string, { positionSec: number; seenAt: Date }>> {
  const rows = await db
    .select({ videoId: classProgress.videoId, positionSec: classProgress.positionSec, seenAt: classProgress.seenAt })
    .from(classProgress)
    .where(eq(classProgress.studentId, studentId))
  return new Map(rows.map((r) => [r.videoId, { positionSec: r.positionSec, seenAt: r.seenAt }]))
}
