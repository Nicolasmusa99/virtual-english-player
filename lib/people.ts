// Personas en "Usuarios" (admin) y "Alumnos" (profe): los datos de resumen que acompañan
// la lista (videos asignados, carpetas, próxima clase). Lo de mostrar (puro) está en
// lib/peopleView.ts.
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assignments, folders, videos } from '@/lib/db/schema'
import { getTeacherSchedule } from '@/lib/classes'
import { nextClassByStudent } from '@/lib/peopleView'

// ─── Base ───────────────────────────────────────────────────────────────────

// lastWatched (2026-11): el último video que abrió el alumno y dónde lo dejó.
export type LastWatched = { videoName: string; positionSec: number; durationSec: number | null; seenAt: string }
export type StudentStats = { materialCount: number; folderCount: number; nextClassAt: string | null; lastWatched: LastWatched | null }

const DAY = 86_400_000

// El resumen de estos alumnos (agrupados por su profe actual, para la próxima clase).
export async function studentStats(
  students: { id: string; teacherId: string | null }[], now: Date = new Date()
): Promise<Record<string, StudentStats>> {
  const ids = students.map((s) => s.id)
  const out: Record<string, StudentStats> = {}
  for (const id of ids) out[id] = { materialCount: 0, folderCount: 0, nextClassAt: null, lastWatched: null }
  if (ids.length === 0) return out

  const [material, folderRows, watched] = await Promise.all([
    db.select({ studentId: assignments.studentId, n: sql<number>`count(*)::int` })
      .from(assignments).where(inArray(assignments.studentId, ids)).groupBy(assignments.studentId),
    db.select({ studentId: folders.studentId, n: sql<number>`count(*)::int` })
      .from(folders).where(inArray(folders.studentId, ids)).groupBy(folders.studentId),
    db.select({
      studentId: assignments.studentId, videoName: videos.originalName, durationSec: videos.durationSec,
      positionSec: assignments.lastPositionSec, seenAt: assignments.lastSeenAt,
    })
      .from(assignments).innerJoin(videos, eq(videos.id, assignments.videoId))
      .where(and(inArray(assignments.studentId, ids), isNotNull(assignments.lastSeenAt), isNotNull(assignments.lastPositionSec)))
      .orderBy(desc(assignments.lastSeenAt)),
  ])
  for (const r of material) out[r.studentId].materialCount = Number(r.n)
  for (const r of folderRows) if (r.studentId) out[r.studentId].folderCount = Number(r.n)
  // Ya vienen del más reciente al más viejo: el primero de cada alumno es el último que vio.
  for (const r of watched) {
    const o = out[r.studentId]
    if (!o || o.lastWatched || !r.seenAt) continue
    o.lastWatched = { videoName: r.videoName, positionSec: r.positionSec ?? 0, durationSec: r.durationSec, seenAt: r.seenAt.toISOString() }
  }

  // Próxima clase: una lectura de la agenda por profe (las clases son del profe actual).
  const byTeacher = new Map<string, string[]>()
  for (const s of students) if (s.teacherId) byTeacher.set(s.teacherId, [...(byTeacher.get(s.teacherId) ?? []), s.id])
  const from = new Date(now.getTime() - 4 * 3_600_000), to = new Date(now.getTime() + 35 * DAY)
  const agendas = await Promise.all([...byTeacher].map(([teacherId, sids]) => getTeacherSchedule(teacherId, sids, from, to)))
  const next = nextClassByStudent(agendas.flatMap((a) => a.classes), now)
  for (const [sid, at] of next) if (out[sid]) out[sid].nextClassAt = at.toISOString()
  return out
}
