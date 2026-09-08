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
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'profesor' } })
    ;(db as any).__rows = []
    const res = await PUT(req({ phrases: [] }), ctx())
    expect(res.status).toBe(404)
  })

  it('(c) 400 si phrases no es un array', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'profesor' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PUT(req({ phrases: 'no-array' }), ctx())
    expect(res.status).toBe(400)
  })

  it('(d) 200 y guarda la sesión (upsert) cuando es dueño y el body es válido', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', role: 'profesor' } })
    ;(db as any).__rows = [OWNED_VIDEO]
    const res = await PUT(req({
      phrases: [{ start: 0, end: 1, text: 'hi', sel: true }],
      delay: 0.5, speedIdx: 2, ccOn: true, filter: 'all', srtSource: 'gemini',
    }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  // ─── INVARIANTE (biblioteca compartida): el material central es intocable ──
  // Un profe que edita las captions de un video COMPARTIDO (que no es suyo)
  // escribe SU propia fila (video_id, suUserId); jamás la del dueño. La garantía
  // es que el user_id insertado sale de la sesión del server, y que el upsert va
  // contra la PK compuesta (video_id, user_id). Este test es la barrera que
  // impide que un profe altere el original.
  it('(e) INVARIANTE: un profe editando un compartido escribe SU fila, nunca la del dueño', async () => {
    authMock.mockResolvedValue({ user: { id: 'profe-2', role: 'profesor' } })
    // video publicado, propiedad de owner-1 (getAccessibleVideo lo devuelve por publishedAt)
    ;(db as any).__rows = [{ id: 'video-1', userId: 'owner-1', status: 'ready', publishedAt: new Date() }]

    const res = await PUT(req({ phrases: [{ start: 0, end: 1, text: 'editado por el profe', sel: false }] }), ctx())
    expect(res.status).toBe(200)

    // El insert lleva el user_id del PROFE (de la sesión), no el del dueño.
    const valuesArg = (db as any).values.mock.calls.at(-1)[0]
    expect(valuesArg.userId).toBe('profe-2')
    expect(valuesArg.userId).not.toBe('owner-1')
    expect(valuesArg.videoId).toBe('video-1')

    // El upsert resuelve conflicto por la PK compuesta (video_id, user_id).
    const conflictArg = (db as any).onConflictDoUpdate.mock.calls.at(-1)[0]
    expect(Array.isArray(conflictArg.target)).toBe(true)
    expect(conflictArg.target).toHaveLength(2)
  })
})
