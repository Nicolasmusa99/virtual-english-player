import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videos, videoSessions } from '@/lib/db/schema'
import { getAccessibleVideo, getOwnedVideo } from '@/lib/library'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

  const { id } = await params
  const video = await getAccessibleVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  // Sesión PROPIA del que pide. Si no tiene (profe que aún no editó un video
  // compartido), sembramos con la del DUEÑO como lectura — sin crear su fila:
  // su copia nace recién en el primer PUT (copy-on-write).
  const [ownSession] = await db
    .select()
    .from(videoSessions)
    .where(and(eq(videoSessions.videoId, id), eq(videoSessions.userId, session.user.id)))
  let videoSession = ownSession ?? null
  if (!videoSession) {
    const [ownerSession] = await db
      .select()
      .from(videoSessions)
      .where(and(eq(videoSessions.videoId, id), eq(videoSessions.userId, video.userId)))
    videoSession = ownerSession ?? null
  }
  return NextResponse.json({ video, session: videoSession ?? null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

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
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

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
