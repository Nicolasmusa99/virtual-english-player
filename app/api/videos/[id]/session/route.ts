import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videoSessions } from '@/lib/db/schema'
import { getOwnedVideo } from '@/lib/library'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

  const { id } = await params
  const video = await getOwnedVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  const { phrases, delay, speedIdx, ccOn, filter, srtSource } = await req.json()
  if (!Array.isArray(phrases)) {
    return NextResponse.json({ error: 'phrases debe ser un array' }, { status: 400 })
  }

  await db
    .insert(videoSessions)
    .values({ videoId: id, phrases, delay, speedIdx, ccOn, filter, srtSource, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: videoSessions.videoId,
      set: { phrases, delay, speedIdx, ccOn, filter, srtSource, updatedAt: new Date() },
    })

  return NextResponse.json({ ok: true })
}
