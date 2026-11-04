import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { videos } from '@/lib/db/schema'

export const QUOTA_BYTES = 8 * 1024 ** 3 // 8GB per user
export const VIDEO_RETENTION_DAYS = 90

export async function getUsedBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${videos.sizeBytes}), 0)` })
    .from(videos)
    .where(and(eq(videos.userId, userId), eq(videos.status, 'ready')))
  return Number(row?.used ?? 0)
}

export async function getOwnedVideo(userId: string, videoId: string) {
  const [row] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
  return row ?? null
}

// Biblioteca compartida — un video es accesible para leer/reproducir si:
//   · sos el DUEÑO, o
//   · está PUBLICADO ahora (publishedAt IS NOT NULL).
// Regla "dueño O publicado ahora": al despublicar, el profe pierde el acceso.
// NO autoriza a escribir el original: las rutas de escritura de sesión siempre
// upsertean sobre (videoId, userId-de-la-sesión), y borrar/PATCH-storage siguen
// exigiendo getOwnedVideo.
export async function getAccessibleVideo(userId: string, videoId: string) {
  const [row] = await db
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.id, videoId),
        or(eq(videos.userId, userId), isNotNull(videos.publishedAt))
      )
    )
  return row ?? null
}

// Carpetas de la biblioteca (2026-11): los ids de los videos PUBLICADOS (lo único que un
// profe puede ver dentro de una carpeta).
export async function listSharedVideoIds(): Promise<string[]> {
  const rows = await db.select({ id: videos.id }).from(videos).where(isNotNull(videos.publishedAt))
  return rows.map((r) => r.id)
}

// ¿Existe el video? (para meterlo en una carpeta de la biblioteca: lo hace el admin).
export async function videoExists(videoId: string): Promise<boolean> {
  const [row] = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId))
  return !!row
}
