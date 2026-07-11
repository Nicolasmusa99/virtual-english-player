import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { videoSessions } from '@/lib/db/schema'
import { getOwnedVideo } from '@/lib/library'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

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
