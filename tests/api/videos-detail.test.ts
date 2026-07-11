// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, delMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  delMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@vercel/blob', () => ({ del: delMock }))
vi.mock('@/lib/db', async () => {
  const { createDbChain } = await import('@/tests/mocks/db-chain')
  return { db: createDbChain() }
})

import { db } from '@/lib/db'
import { GET, DELETE, PATCH } from '@/app/api/videos/[id]/route'

const OWNED_VIDEO = { id: 'video-1', userId: 'user-1', originalName: 'a.mp4', storageUrl: 'https://blob/a.mp4', status: 'ready' }

function ctx(id = 'video-1') { return { params: Promise.resolve({ id }) } }
function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/videos/video-1`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  authMock.mockReset()
  delMock.mockReset()
  ;(db as any).__rows = []
})

describe('GET /api/videos/[id]', () => {
  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await GET(req('GET'), ctx())
    expect(res.status).toBe(401)
  })

  it('(b) 404 si el video no pertenece al usuario (o no existe)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = []
    const res = await GET(req('GET'), ctx())
    expect(res.status).toBe(404)
  })

  it('(c) 200 con el video y su sesión guardada cuando es dueño', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await GET(req('GET'), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).video).toEqual(OWNED_VIDEO)
  })
})

describe('DELETE /api/videos/[id]', () => {
  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await DELETE(req('DELETE'), ctx())
    expect(res.status).toBe(401)
  })

  it('(b) 404 si no es dueño del video', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = []
    const res = await DELETE(req('DELETE'), ctx())
    expect(res.status).toBe(404)
    expect(delMock).not.toHaveBeenCalled()
  })

  it('(c) borra el blob y la fila cuando es dueño', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await DELETE(req('DELETE'), ctx())
    expect(res.status).toBe(200)
    expect(delMock).toHaveBeenCalledWith(OWNED_VIDEO.storageUrl)
  })

  it('(d) si el borrado del blob falla, igual responde 200 (best-effort)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    delMock.mockRejectedValue(new Error('blob gone'))
    const res = await DELETE(req('DELETE'), ctx())
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/videos/[id]', () => {
  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await PATCH(req('PATCH', { storageUrl: 'https://blob/x' }), ctx())
    expect(res.status).toBe(401)
  })

  it('(b) 404 si no es dueño del video', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = []
    const res = await PATCH(req('PATCH', { storageUrl: 'https://blob/x' }), ctx())
    expect(res.status).toBe(404)
  })

  it('(c) 400 si falta storageUrl', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PATCH(req('PATCH', {}), ctx())
    expect(res.status).toBe(400)
  })

  it('(d) 200 y confirma el storageUrl cuando es dueño', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PATCH(req('PATCH', { storageUrl: 'https://blob/final.mp4' }), ctx())
    expect(res.status).toBe(200)
  })
})
