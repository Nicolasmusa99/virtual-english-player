// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/transcribe/route'
import { geminiHandlers, FAKE_SRT, FAKE_UPLOAD_URL } from '../mocks/gemini-handlers'

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

function makeRequest(withFile = true): NextRequest {
  const fd = new FormData()
  if (withFile) {
    fd.append('file', new Blob(['fake-video-bytes'], { type: 'video/mp4' }), 'test.mp4')
  }
  return new NextRequest('http://localhost/api/transcribe', {
    method: 'POST',
    body: fd,
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

  it('(b) sin file en el FormData → 400', async () => {
    const res = await POST(makeRequest(false))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('No file provided')
  })

  it('(c) happy path — upload + poll + generateContent → 200 { srt }', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.srt).toBe(FAKE_SRT)
  })

  it('(d) Gemini upload start devuelve 4xx → 500 con mensaje de error', async () => {
    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', () =>
        new HttpResponse('Forbidden', { status: 403 })
      )
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('Upload start failed: 403')
  })

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
    expect(data.srt).toBe(fencedSrt)          // pasa crudo, con fences
    expect(data.srt).toContain('```srt')       // confirma que NO hizo stripping
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

  it('(h) documenta bug 3: API key en query string en lugar de header', async () => {
    process.env.GEMINI_API_KEY = 'test-key-secret'
    let capturedUrl: string | null = null

    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', ({ request }) => {
        capturedUrl = request.url
        return new HttpResponse(null, {
          status: 200,
          headers: { 'x-goog-upload-url': FAKE_UPLOAD_URL },
        })
      })
    )

    await POST(makeRequest())

    expect(capturedUrl).not.toBeNull()
    expect(capturedUrl).toContain('?key=test-key-secret')
    // Cuando se fixee bug 3, esto cambia a:
    // expect(capturedUrl).not.toContain('?key=')
    // expect(capturedRequest.headers.get('x-goog-api-key')).toBe('test-key-secret')
  })

  it('(i) POST handler no llama file.arrayBuffer() — usa Blob passthrough para evitar OOM', async () => {
    const req = makeRequest()  // crear antes del spy para no capturar serialización del NextRequest
    const spy = vi.spyOn(Blob.prototype, 'arrayBuffer')
    try {
      await POST(req)
      // Bug 2: línea 71-72 de route.ts llama file.arrayBuffer() → copia extra de ~videoSize en RAM
      // Después del fix (Blob passthrough), arrayBuffer() no se llama y este expect pasa
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it.todo('(j) browser-direct upload to Gemini bypasses Next.js multipart buffering — see CLAUDE.md "Memory budget"')
})
