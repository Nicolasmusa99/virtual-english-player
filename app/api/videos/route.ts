import { NextRequest, NextResponse } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videos, videoSessions } from '@/lib/db/schema'
import { getUsedBytes, QUOTA_BYTES } from '@/lib/library'

export async function GET() {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

  const rows = await db
    .select({
      id: videos.id,
      originalName: videos.originalName,
      sizeBytes: videos.sizeBytes,
      durationSec: videos.durationSec,
      status: videos.status,
      createdAt: videos.createdAt,
      sharedType: videos.sharedType,
      sharedLevel: videos.sharedLevel,
      publishedAt: videos.publishedAt,
      phraseCount: sql<number>`coalesce(jsonb_array_length(${videoSessions.phrases}), 0)`,
    })
    .from(videos)
    .leftJoin(videoSessions, eq(videoSessions.videoId, videos.id))
    .where(eq(videos.userId, session.user.id))
    .orderBy(desc(videos.createdAt))

  return NextResponse.json({ videos: rows })
}

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

  const { originalName, sizeBytes, mimeType } = await req.json()
  if (!originalName || typeof sizeBytes !== 'number' || sizeBytes <= 0 || !mimeType) {
    return NextResponse.json({ error: 'Datos de video inválidos' }, { status: 400 })
  }

  const used = await getUsedBytes(session.user.id)
  if (used + sizeBytes > QUOTA_BYTES) {
    return NextResponse.json(
      { error: 'Tu biblioteca alcanzó el límite de espacio. Borrá un video para liberar lugar.', usedBytes: used },
      { status: 413 }
    )
  }

  const [row] = await db
    .insert(videos)
    .values({ userId: session.user.id, originalName, sizeBytes, mimeType, status: 'uploading' })
    .returning({ id: videos.id })

  return NextResponse.json({ id: row.id })
}
