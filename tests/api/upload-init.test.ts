// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/upload-init/route'

const FAKE_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=fake-session-123'

const server = setupServer(
  http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', () =>
    new HttpResponse(null, {
      status: 200,
      headers: { 'x-goog-upload-url': FAKE_UPLOAD_URL },
    })
  )
)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  delete process.env.GEMINI_API_KEY
})
afterAll(() => server.close())

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-default'
})

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/upload-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/upload-init', () => {
  it('(a) sin GEMINI_API_KEY → 500 con mensaje claro', async () => {
    delete process.env.GEMINI_API_KEY
    const res = await POST(makeRequest({ mimeType: 'video/mp4', size: 1000 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('API key not configured')
  })

  it('(b) sin mimeType en el body → 400', async () => {
    const res = await POST(makeRequest({ size: 1000 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/mimeType/)
  })

  it('(c) size ausente, no numérico, cero o negativo → 400', async () => {
    const invalidBodies = [
      { mimeType: 'video/mp4' },              // size ausente
      { mimeType: 'video/mp4', size: 'abc' }, // no numérico
      { mimeType: 'video/mp4', size: 0 },     // cero
      { mimeType: 'video/mp4', size: -1 },    // negativo
    ]
    for (const body of invalidBodies) {
      const res = await POST(makeRequest(body))
      expect(res.status, `expected 400 for body: ${JSON.stringify(body)}`).toBe(400)
      expect((await res.json()).error).toMatch(/size/)
    }
  })

  it('(d) happy path → 200 { uploadUrl } sin exponer API key', async () => {
    const res = await POST(makeRequest({ mimeType: 'video/mp4', size: 104_857_600 }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.uploadUrl).toBe(FAKE_UPLOAD_URL)
    // Seguridad: la respuesta no debe contener la API key
    expect(JSON.stringify(data)).not.toContain('test-key-default')
  })

  it('(e) Gemini devuelve 4xx → 500 con mensaje que incluye el status', async () => {
    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', () =>
        new HttpResponse('Unauthorized', { status: 401 })
      )
    )
    const res = await POST(makeRequest({ mimeType: 'video/mp4', size: 1000 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('401')
  })

  it('(f) Gemini responde 200 pero sin x-goog-upload-url → 500', async () => {
    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', () =>
        new HttpResponse(null, { status: 200 }) // sin el header
      )
    )
    const res = await POST(makeRequest({ mimeType: 'video/mp4', size: 1000 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('No upload URL')
  })

  it('(g) reenvía mimeType y size a Gemini en los headers correctos', async () => {
    let captured = { contentType: null as string | null, contentLength: null as string | null }
    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', ({ request }) => {
        captured.contentType = request.headers.get('X-Goog-Upload-Header-Content-Type')
        captured.contentLength = request.headers.get('X-Goog-Upload-Header-Content-Length')
        return new HttpResponse(null, {
          status: 200,
          headers: { 'x-goog-upload-url': FAKE_UPLOAD_URL },
        })
      })
    )
    await POST(makeRequest({ mimeType: 'video/quicktime', size: 52_428_800 }))
    expect(captured.contentType).toBe('video/quicktime')
    expect(captured.contentLength).toBe('52428800')
  })
})
