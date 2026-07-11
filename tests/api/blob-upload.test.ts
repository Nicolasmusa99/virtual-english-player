// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authMock, handleUploadMock, getOwnedVideoMock, getUsedBytesMock, dbUpdateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  handleUploadMock: vi.fn(),
  getOwnedVideoMock: vi.fn(),
  getUsedBytesMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: handleUploadMock }))
vi.mock('@/lib/library', () => ({
  getOwnedVideo: getOwnedVideoMock,
  getUsedBytes: getUsedBytesMock,
  QUOTA_BYTES: 8 * 1024 ** 3,
}))
vi.mock('@/lib/db', () => ({
  db: { update: () => ({ set: () => ({ where: dbUpdateMock }) }) },
}))

import { POST } from '@/app/api/blob-upload/route'

function req(body: unknown = { type: 'blob.generate-client-token' }) {
  return new Request('http://localhost/api/blob-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
  handleUploadMock.mockReset()
  getOwnedVideoMock.mockReset()
  getUsedBytesMock.mockReset()
  dbUpdateMock.mockReset()
})

describe('POST /api/blob-upload', () => {
  it('(a) 401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(handleUploadMock).not.toHaveBeenCalled()
  })

  it('(b) delega en handleUpload y responde 200 con su resultado', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    handleUploadMock.mockResolvedValue({ ok: true })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('(c) si handleUpload rechaza (ej. token inválido), responde 400 con el mensaje', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    handleUploadMock.mockRejectedValue(new Error('boom'))
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('boom')
  })

  describe('onBeforeGenerateToken (lógica de ownership + cuota)', () => {
    async function callOnBeforeGenerateToken(clientPayload: string) {
      authMock.mockResolvedValue({ user: { id: 'user-1' } })
      let captured: any
      handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }: any) => {
        captured = await onBeforeGenerateToken('videos/v1/a.mp4', clientPayload)
        return { captured }
      })
      const res = await POST(req())
      return { res, captured }
    }

    it('(a) lanza si el video no le pertenece al usuario', async () => {
      getOwnedVideoMock.mockResolvedValue(null)
      const { res } = await callOnBeforeGenerateToken(JSON.stringify({ videoId: 'v1' }))
      expect(res.status).toBe(400)
    })

    it('(b) lanza si supera la cuota', async () => {
      getOwnedVideoMock.mockResolvedValue({ sizeBytes: 100 })
      getUsedBytesMock.mockResolvedValue(8 * 1024 ** 3)
      const { res } = await callOnBeforeGenerateToken(JSON.stringify({ videoId: 'v1' }))
      expect(res.status).toBe(400)
    })

    it('(c) devuelve el token payload con el videoId cuando hay espacio', async () => {
      getOwnedVideoMock.mockResolvedValue({ sizeBytes: 100 })
      getUsedBytesMock.mockResolvedValue(0)
      const { res, captured } = await callOnBeforeGenerateToken(JSON.stringify({ videoId: 'v1' }))
      expect(res.status).toBe(200)
      expect(JSON.parse(captured.tokenPayload)).toEqual({ videoId: 'v1' })
    })
  })

  describe('onUploadCompleted (actualiza storage_url + status)', () => {
    it('marca el video como ready con la url final del blob', async () => {
      authMock.mockResolvedValue({ user: { id: 'user-1' } })
      handleUploadMock.mockImplementation(async ({ onUploadCompleted }: any) => {
        await onUploadCompleted({
          blob: { url: 'https://blob/final.mp4' },
          tokenPayload: JSON.stringify({ videoId: 'v1' }),
        })
        return { ok: true }
      })
      await POST(req())
      expect(dbUpdateMock).toHaveBeenCalled()
    })
  })
})
