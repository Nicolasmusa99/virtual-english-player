// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/transcribe/route'
import { geminiHandlers, FAKE_SRT, FAKE_FILE_URI } from '../mocks/gemini-handlers'

const server = setupServer(...geminiHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  delete process.env.GEMINI_API_KEY
})
afterAll(() => server.close())

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-default'
})

// Nueva interfaz: JSON { fileUri, mimeType } — sin multipart/FormData
function makeRequest(withFileUri = true): NextRequest {
  const body = withFileUri
    ? { fileUri: FAKE_FILE_URI, mimeType: 'video/mp4' }
    : {}
  return new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/transcribe', () => {
  it('(a) sin GEMINI_API_KEY → 500 con mensaje claro', async () => {
    delete process.env.GEMINI_API_KEY
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('API key not configured')
  })

  it('(b) sin fileUri en el JSON → 400', async () => {
    const res = await POST(makeRequest(false))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/fileUri/)
  })

  it('(c) happy path — fileUri + poll + generateContent → 200 { srt }', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.srt).toBe(FAKE_SRT)
  })

  it('(e) poll nunca devuelve ACTIVE (siempre PROCESSING) → 500 timeout', async () => {
    server.use(
      http.get('https://generativelanguage.googleapis.com/v1beta/files/test-file-id', () =>
        HttpResponse.json({ state: 'PROCESSING' })
      )
    )

    vi.useFakeTimers()
    let res: Response
    try {
      const responsePromise = POST(makeRequest())
      await vi.runAllTimersAsync()
      res = await responsePromise
    } finally {
      vi.useRealTimers()
    }

    expect(res!.status).toBe(500)
    const data = await res!.json()
    expect(data.error).toContain('Timeout')
  }, 15_000)

  it('(f) Gemini generateContent devuelve error → 500', async () => {
    server.use(
      http.post(
        /generativelanguage\.googleapis\.com\/v1beta\/models\/.*generateContent/,
        () => new HttpResponse('Internal Server Error', { status: 500 })
      )
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('Gemini error: 500')
  })

  it('(g) Gemini devuelve SRT con code fence → route lo pasa crudo sin modificar (stripping es responsabilidad del cliente)', async () => {
    const fencedSrt = '```srt\n1\n00:00:01,000 --> 00:00:03,000\nFenced text\n```'
    server.use(
      http.post(
        /generativelanguage\.googleapis\.com\/v1beta\/models\/.*generateContent/,
        () =>
          HttpResponse.json({
            candidates: [{ content: { parts: [{ text: fencedSrt }] } }],
          })
      )
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.srt).toBe(fencedSrt)
    expect(data.srt).toContain('```srt')
  })

  it('(h) API key se manda por header x-goog-api-key, no en query string', async () => {
    process.env.GEMINI_API_KEY = 'test-key-secret'
    const captured: Array<{ url: string; apiKeyHeader: string | null }> = []

    server.use(
      http.get('https://generativelanguage.googleapis.com/v1beta/files/test-file-id', ({ request }) => {
        captured.push({ url: request.url, apiKeyHeader: request.headers.get('x-goog-api-key') })
        return HttpResponse.json({ state: 'ACTIVE', name: 'files/test-file-id' })
      }),
      http.post(
        /generativelanguage\.googleapis\.com\/v1beta\/models\/.*generateContent/,
        ({ request }) => {
          captured.push({ url: request.url, apiKeyHeader: request.headers.get('x-goog-api-key') })
          return HttpResponse.json({ candidates: [{ content: { parts: [{ text: FAKE_SRT }] } }] })
        }
      ),
    )

    await POST(makeRequest())

    // DELETE (fire-and-forget) no capturable de forma confiable
    expect(captured).toHaveLength(2)
    for (const { url, apiKeyHeader } of captured) {
      expect(url).not.toContain('?key=')
      expect(apiKeyHeader).toBe('test-key-secret')
    }
  })

  it('(j) browser-direct: route nunca llama POST /upload/v1beta/files', async () => {
    let uploadCalled = false
    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', () => {
        uploadCalled = true
        return HttpResponse.json({ error: 'upload invocado — la route no debería subir archivos' }, { status: 500 })
      })
    )
    const res = await POST(makeRequest())
    expect(uploadCalled).toBe(false)  // si falla acá, la route todavía hace el upload
    expect(res.status).toBe(200)
  })

  describe('(k) fileUri inválido → 400', () => {
    it('string vacío', async () => {
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUri: '', mimeType: 'video/mp4' }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('URI sin segmento /files/', async () => {
      const req = new NextRequest('http://localhost/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUri: 'https://example.com/invalid-uri', mimeType: 'video/mp4' }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })
})
