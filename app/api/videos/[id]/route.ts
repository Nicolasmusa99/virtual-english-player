import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { videos, videoSessions } from '@/lib/db/schema'
import { getOwnedVideo } from '@/lib/library'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const video = await getOwnedVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  const [videoSession] = await db.select().from(videoSessions).where(eq(videoSessions.videoId, id))
  return NextResponse.json({ video, session: videoSession ?? null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const video = await getOwnedVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  if (video.storageUrl) {
    try { await del(video.storageUrl) } catch { /* best-effort */ }
  }
  await db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const video = await getOwnedVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  const { storageUrl } = await req.json()
  if (!storageUrl || typeof storageUrl !== 'string') {
    return NextResponse.json({ error: 'storageUrl requerido' }, { status: 400 })
  }

  await db.update(videos).set({ storageUrl, status: 'ready', updatedAt: new Date() }).where(eq(videos.id, id))
  return NextResponse.json({ ok: true })
}
