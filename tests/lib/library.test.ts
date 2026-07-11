// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { createDbChain } = await import('@/tests/mocks/db-chain')
  return { db: createDbChain() }
})

import { db } from '@/lib/db'
import { getUsedBytes, getOwnedVideo, QUOTA_BYTES, VIDEO_RETENTION_DAYS } from '@/lib/library'

beforeEach(() => { (db as any).__rows = [] })

describe('getUsedBytes', () => {
  it('devuelve 0 si el usuario no tiene videos', async () => {
    (db as any).__rows = [{ used: null }]
    expect(await getUsedBytes('user-1')).toBe(0)
  })

  it('devuelve la suma reportada por la consulta', async () => {
    (db as any).__rows = [{ used: 12345 }]
    expect(await getUsedBytes('user-1')).toBe(12345)
  })
})

describe('getOwnedVideo', () => {
  it('devuelve null si no hay coincidencia', async () => {
    (db as any).__rows = []
    expect(await getOwnedVideo('user-1', 'video-1')).toBeNull()
  })

  it('devuelve la fila si hay coincidencia', async () => {
    const row = { id: 'video-1', userId: 'user-1' }
    ;(db as any).__rows = [row]
    expect(await getOwnedVideo('user-1', 'video-1')).toEqual(row)
  })
})

describe('constantes de cuota', () => {
  it('QUOTA_BYTES es 8GB y VIDEO_RETENTION_DAYS es 90', () => {
    expect(QUOTA_BYTES).toBe(8 * 1024 ** 3)
    expect(VIDEO_RETENTION_DAYS).toBe(90)
  })
})
