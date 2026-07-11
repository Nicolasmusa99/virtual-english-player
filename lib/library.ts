import { and, eq, sql } from 'drizzle-orm'
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
