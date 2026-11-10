import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videoSessions } from '@/lib/db/schema'
import { getAccessibleVideo } from '@/lib/library'

const MAX_PHRASES = 5000

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const session = gate.session

  const { id } = await params
  const video = await getAccessibleVideo(session.user.id, id)
  if (!video) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const phrases = body?.phrases
  if (!Array.isArray(phrases)) {
    return NextResponse.json({ error: 'phrases debe ser un array' }, { status: 400 })
  }
  if (phrases.length > MAX_PHRASES) {
    return NextResponse.json({ error: 'Demasiadas frases' }, { status: 400 })
  }
  // El resto, con su tipo o el valor por defecto: un dato mal armado no llega a la base.
  const delay = typeof body!.delay === 'number' && Number.isFinite(body!.delay) ? Math.max(-60, Math.min(60, body!.delay)) : 0
  const speedIdx = Number.isInteger(body!.speedIdx) && (body!.speedIdx as number) >= 0 && (body!.speedIdx as number) <= 10 ? (body!.speedIdx as number) : 2
  const ccOn = typeof body!.ccOn === 'boolean' ? body!.ccOn : true
  const filter = body!.filter === 'sel' ? 'sel' : 'all'
  const srtSource = body!.srtSource === 'gemini' || body!.srtSource === 'srt-upload' ? body!.srtSource : null

  // El user_id sale SIEMPRE de la sesión del server, nunca del body: por eso un
  // profe escribe SU propia fila (video_id, suUserId) y la del dueño es intocable.
  const userId = session.user.id
  await db
    .insert(videoSessions)
    .values({ videoId: id, userId, phrases, delay, speedIdx, ccOn, filter, srtSource, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [videoSessions.videoId, videoSessions.userId],
      set: { phrases, delay, speedIdx, ccOn, filter, srtSource, updatedAt: new Date() },
    })

  return NextResponse.json({ ok: true })
}
