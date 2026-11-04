import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { del } from '@vercel/blob'
import { requireRole } from '@/lib/authz'
import { setCustomImage } from '@/lib/users'
import { AVATAR_MAX_BYTES, AVATAR_TYPES, isOwnAvatarPath, isOwnAvatarUrl } from '@/lib/avatar'

// ─── /api/me/photo — la foto de perfil (2026-11) ─────────────────────────────
// POST  → token de Vercel Blob para que el navegador suba la foto (solo imágenes, hasta
//         2 MB, solo dentro de avatars/<su id>/).
// PUT   { url } → la deja como su foto (solo una URL de nuestro Blob en SU carpeta).
// DELETE → quita la subida y vuelve a la de Google (si tiene).
// SIEMPRE sobre el usuario de la sesión. La foto anterior subida se borra del Blob.
const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'No autenticado' : 'No autorizado' }, { status })
const gateAll = () => requireRole('admin', 'profesor', 'alumno')

async function dropOld(previous: string | null, userId: string, keep: string | null) {
  if (previous && previous !== keep && isOwnAvatarUrl(previous, userId)) {
    try { await del(previous) } catch { /* si no se puede borrar, queda huérfana: no rompe nada */ }
  }
}

export async function POST(req: NextRequest) {
  const gate = await gateAll()
  if (!gate.ok) return deny(gate.status)
  const userId = gate.session.user.id
  const body = (await req.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!isOwnAvatarPath(pathname, userId)) throw new Error('Ruta de foto inválida')
        return { allowedContentTypes: [...AVATAR_TYPES], maximumSizeInBytes: AVATAR_MAX_BYTES, addRandomSuffix: true }
      },
      onUploadCompleted: async () => { /* se guarda con el PUT, que es el que valida la URL */ },
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await gateAll()
  if (!gate.ok) return deny(gate.status)
  const userId = gate.session.user.id
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!isOwnAvatarUrl(body?.url, userId)) return NextResponse.json({ error: 'Foto inválida' }, { status: 400 })
  const { previous, image } = await setCustomImage(userId, body!.url as string)
  await dropOld(previous, userId, image)
  return NextResponse.json({ image })
}

export async function DELETE() {
  const gate = await gateAll()
  if (!gate.ok) return deny(gate.status)
  const userId = gate.session.user.id
  const { previous, image } = await setCustomImage(userId, null)
  await dropOld(previous, userId, image)
  return NextResponse.json({ image })
}
