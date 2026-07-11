// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, getUsedBytesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUsedBytesMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/db', async () => {
  const { createDbChain } = await import('@/tests/mocks/db-chain')
  return { db: createDbChain() }
})
vi.mock('@/lib/library', () => ({ getUsedBytes: getUsedBytesMock, QUOTA_BYTES: 8 * 1024 ** 3 }))

import { db } from '@/lib/db'
import { GET, POST } from '@/app/api/videos/route'

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/videos', () => {
  beforeEach(() => {
    authMock.mockReset()
    ;(db as any).__rows = []
  })

  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('(b) 200 con la lista de videos del usuario logueado', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    ;(db as any).__rows = [{ id: 'v1', originalName: 'clase.mp4', phraseCount: 5, status: 'ready' }]
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).videos).toEqual((db as any).__rows)
  })
})

describe('POST /api/videos', () => {
  beforeEach(() => {
    authMock.mockReset()
    getUsedBytesMock.mockReset()
    ;(db as any).__rows = [{ id: 'video-1' }]
  })

  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ originalName: 'a.mp4', sizeBytes: 100, mimeType: 'video/mp4' }))
    expect(res.status).toBe(401)
  })

  it('(b) 400 con datos inválidos (falta originalName / sizeBytes inválido / falta mimeType)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    const invalidBodies = [
      { sizeBytes: 100, mimeType: 'video/mp4' },
      { originalName: 'a.mp4', sizeBytes: 0, mimeType: 'video/mp4' },
      { originalName: 'a.mp4', sizeBytes: -5, mimeType: 'video/mp4' },
      { originalName: 'a.mp4', sizeBytes: 100 },
    ]
    for (const body of invalidBodies) {
      const res = await POST(makeRequest(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('(c) 413 si el video excede la cuota disponible', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    getUsedBytesMock.mockResolvedValue(8 * 1024 ** 3)
    const res = await POST(makeRequest({ originalName: 'a.mp4', sizeBytes: 100, mimeType: 'video/mp4' }))
    expect(res.status).toBe(413)
  })

  it('(d) 200 y crea el video cuando hay espacio disponible', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    getUsedBytesMock.mockResolvedValue(0)
    const res = await POST(makeRequest({ originalName: 'a.mp4', sizeBytes: 100, mimeType: 'video/mp4' }))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('video-1')
  })
})
