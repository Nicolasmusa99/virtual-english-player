// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const authMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/db', async () => {
  const { createDbChain } = await import('@/tests/mocks/db-chain')
  return { db: createDbChain() }
})

import { db } from '@/lib/db'
import { POST, PATCH, DELETE } from '@/app/api/videos/[id]/share/route'

const ADMIN = { user: { id: 'admin-1', role: 'admin' } }
const PROFE = { user: { id: 'profe-1', role: 'profesor' } }
const READY_OWNED = { id: 'video-1', userId: 'admin-1', status: 'ready', publishedAt: null }

function ctx(id = 'video-1') { return { params: Promise.resolve({ id }) } }
function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/videos/video-1/share', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => { authMock.mockReset(); (db as any).__rows = [] })

describe('POST /api/videos/[id]/share (publicar)', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    expect((await POST(req('POST', { sharedType: 'pelicula', sharedLevel: 'beginner' }), ctx())).status).toBe(401)
  })

  it('403 si es profesor (publicar es solo admin)', async () => {
    authMock.mockResolvedValue(PROFE)
    ;(db as any).__rows = [READY_OWNED]
    expect((await POST(req('POST', { sharedType: 'pelicula', sharedLevel: 'beginner' }), ctx())).status).toBe(403)
  })

  it('404 si el admin no es dueño del video', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = []
    expect((await POST(req('POST', { sharedType: 'pelicula', sharedLevel: 'beginner' }), ctx())).status).toBe(404)
  })

  it('400 si el video no está listo', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, status: 'uploading' }]
    expect((await POST(req('POST', { sharedType: 'pelicula', sharedLevel: 'beginner' }), ctx())).status).toBe(400)
  })

  it('400 si tipo/nivel son inválidos', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [READY_OWNED]
    expect((await POST(req('POST', { sharedType: 'documental', sharedLevel: 'beginner' }), ctx())).status).toBe(400)
    expect((await POST(req('POST', { sharedType: 'pelicula', sharedLevel: 'experto' }), ctx())).status).toBe(400)
  })

  it('200 cuando admin dueño publica un video listo con tipo/nivel válidos', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [READY_OWNED]
    const res = await POST(req('POST', { sharedType: 'cancion', sharedLevel: 'advance' }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})

describe('PATCH /api/videos/[id]/share (editar clasificación)', () => {
  it('403 si es profesor', async () => {
    authMock.mockResolvedValue(PROFE)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await PATCH(req('PATCH', { sharedLevel: 'medium' }), ctx())).status).toBe(403)
  })

  it('400 si el video no está publicado', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: null }]
    expect((await PATCH(req('PATCH', { sharedLevel: 'medium' }), ctx())).status).toBe(400)
  })

  it('400 si no se manda nada para actualizar', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await PATCH(req('PATCH', {}), ctx())).status).toBe(400)
  })

  it('400 si el nivel es inválido', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await PATCH(req('PATCH', { sharedLevel: 'zzz' }), ctx())).status).toBe(400)
  })

  it('200 al editar el nivel de un publicado', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await PATCH(req('PATCH', { sharedLevel: 'medium' }), ctx())).status).toBe(200)
  })
})

describe('DELETE /api/videos/[id]/share (despublicar)', () => {
  it('403 si es profesor', async () => {
    authMock.mockResolvedValue(PROFE)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await DELETE(req('DELETE'), ctx())).status).toBe(403)
  })

  it('404 si el admin no es dueño', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = []
    expect((await DELETE(req('DELETE'), ctx())).status).toBe(404)
  })

  it('200 cuando admin dueño despublica', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ ...READY_OWNED, publishedAt: new Date() }]
    expect((await DELETE(req('DELETE'), ctx())).status).toBe(200)
  })
})
