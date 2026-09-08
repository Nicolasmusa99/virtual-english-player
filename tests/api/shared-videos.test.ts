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
import { GET } from '@/app/api/shared-videos/route'

const ADMIN = { user: { id: 'admin-1', role: 'admin' } }
const PROFE = { user: { id: 'profe-1', role: 'profesor' } }
const ALUMNO = { user: { id: 'alu-1', role: 'alumno' } }

function req(qs = '') {
  return new NextRequest(`http://localhost/api/shared-videos${qs}`, { method: 'GET' })
}

beforeEach(() => { authMock.mockReset(); (db as any).__rows = [] })

describe('GET /api/shared-videos (biblioteca compartida)', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('403 si es alumno', async () => {
    authMock.mockResolvedValue(ALUMNO)
    expect((await GET(req())).status).toBe(403)
  })

  it('200 y lista para admin', async () => {
    authMock.mockResolvedValue(ADMIN)
    ;(db as any).__rows = [{ id: 'v1', originalName: 'a.mp4', sharedType: 'pelicula', sharedLevel: 'beginner' }]
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect((await res.json()).videos).toHaveLength(1)
  })

  it('200 para profesor (ve la compartida)', async () => {
    authMock.mockResolvedValue(PROFE)
    ;(db as any).__rows = []
    expect((await GET(req())).status).toBe(200)
  })

  it('200 con filtros válidos tipo+nivel', async () => {
    authMock.mockResolvedValue(PROFE)
    expect((await GET(req('?tipo=pelicula&nivel=advance'))).status).toBe(200)
  })

  it('400 si el tipo del filtro es inválido', async () => {
    authMock.mockResolvedValue(PROFE)
    expect((await GET(req('?tipo=corto'))).status).toBe(400)
  })

  it('400 si el nivel del filtro es inválido', async () => {
    authMock.mockResolvedValue(PROFE)
    expect((await GET(req('?nivel=pro'))).status).toBe(400)
  })
})
