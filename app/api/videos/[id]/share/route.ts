import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireRole } from '@/lib/authz'
import { db } from '@/lib/db'
import { videos, isSharedType, isSharedLevel, type SharedType, type SharedLevel } from '@/lib/db/schema'
import { getOwnedVideo } from '@/lib/library'

// Publicar / despublicar / editar-clasificación. SOLO admin y SOLO sobre videos
// propios (getOwnedVideo): un profe nunca llega acá (requireRole('admin')) y un
// admin no puede publicar videos de otro.
async function gate(id: string) {
  const g = await requireRole('admin')
  if (!g.ok) return { res: NextResponse.json({ error: g.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: g.status }) }
  const video = await getOwnedVideo(g.session.user.id, id)
  if (!video) return { res: NextResponse.json({ error: 'Video no encontrado' }, { status: 404 }) }
  return { video }
}

// POST = publicar (tipo + nivel + publishedAt=now)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gate(id); if ('res' in g) return g.res
  if (g.video.status !== 'ready') return NextResponse.json({ error: 'Solo se puede publicar un video listo' }, { status: 400 })
  const { sharedType, sharedLevel } = await req.json()
  if (!isSharedType(sharedType) || !isSharedLevel(sharedLevel)) return NextResponse.json({ error: 'tipo/nivel inválidos' }, { status: 400 })
  await db.update(videos).set({ sharedType, sharedLevel, publishedAt: new Date(), updatedAt: new Date() }).where(eq(videos.id, id))
  return NextResponse.json({ ok: true })
}

// PATCH = editar clasificación de un YA publicado
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gate(id); if ('res' in g) return g.res
  if (!g.video.publishedAt) return NextResponse.json({ error: 'El video no está publicado' }, { status: 400 })
  const { sharedType, sharedLevel } = await req.json()
  const set: { updatedAt: Date; sharedType?: SharedType; sharedLevel?: SharedLevel } = { updatedAt: new Date() }
  if (sharedType !== undefined) { if (!isSharedType(sharedType)) return NextResponse.json({ error: 'tipo inválido' }, { status: 400 }); set.sharedType = sharedType }
  if (sharedLevel !== undefined) { if (!isSharedLevel(sharedLevel)) return NextResponse.json({ error: 'nivel inválido' }, { status: 400 }); set.sharedLevel = sharedLevel }
  if (set.sharedType === undefined && set.sharedLevel === undefined) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  await db.update(videos).set(set).where(eq(videos.id, id))
  return NextResponse.json({ ok: true })
}

// DELETE = despublicar (publishedAt -> null; conserva tipo/nivel)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gate(id); if ('res' in g) return g.res
  await db.update(videos).set({ publishedAt: null, updatedAt: new Date() }).where(eq(videos.id, id))
  return NextResponse.json({ ok: true })
}
