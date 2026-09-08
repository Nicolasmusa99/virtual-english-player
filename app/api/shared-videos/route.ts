import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videos, videoSessions, users, isSharedType, isSharedLevel } from '@/lib/db/schema'

// Explorar la biblioteca compartida. Admin + profesor (solo lectura). Filtros
// opcionales por tipo y nivel. phraseCount viene de la sesión del DUEÑO (canónica).
export async function GET(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const nivel = searchParams.get('nivel')
  const conds = [isNotNull(videos.publishedAt)]
  if (tipo)  { if (!isSharedType(tipo))   return NextResponse.json({ error: 'tipo inválido' },  { status: 400 }); conds.push(eq(videos.sharedType, tipo)) }
  if (nivel) { if (!isSharedLevel(nivel)) return NextResponse.json({ error: 'nivel inválido' }, { status: 400 }); conds.push(eq(videos.sharedLevel, nivel)) }

  const rows = await db
    .select({
      id: videos.id,
      originalName: videos.originalName,
      durationSec: videos.durationSec,
      sharedType: videos.sharedType,
      sharedLevel: videos.sharedLevel,
      publishedAt: videos.publishedAt,
      ownerName: users.name,
      phraseCount: sql<number>`coalesce(jsonb_array_length(${videoSessions.phrases}), 0)`,
    })
    .from(videos)
    .leftJoin(videoSessions, and(eq(videoSessions.videoId, videos.id), eq(videoSessions.userId, videos.userId)))
    .leftJoin(users, eq(users.id, videos.userId))
    .where(and(...conds))
    .orderBy(desc(videos.publishedAt))

  return NextResponse.json({ videos: rows })
}
