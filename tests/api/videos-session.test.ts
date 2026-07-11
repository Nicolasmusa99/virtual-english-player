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
import { PUT } from '@/app/api/videos/[id]/session/route'

const OWNED_VIDEO = { id: 'video-1', userId: 'user-1' }

function ctx(id = 'video-1') { return { params: Promise.resolve({ id }) } }
function req(body?: unknown) {
  return new NextRequest('http://localhost/api/videos/video-1/session', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  authMock.mockReset()
  ;(db as any).__rows = []
})

describe('PUT /api/videos/[id]/session', () => {
  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await PUT(req({ phrases: [] }), ctx())
    expect(res.status).toBe(401)
  })

  it('(b) 404 si el video no pertenece al usuario', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = []
    const res = await PUT(req({ phrases: [] }), ctx())
    expect(res.status).toBe(404)
  })

  it('(c) 400 si phrases no es un array', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PUT(req({ phrases: 'no-array' }), ctx())
    expect(res.status).toBe(400)
  })

  it('(d) 200 y guarda la sesión (upsert) cuando es dueño y el body es válido', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PUT(req({
      phrases: [{ start: 0, end: 1, text: 'hi', sel: true }],
      delay: 0.5, speedIdx: 2, ccOn: true, filter: 'all', srtSource: 'gemini',
    }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})
