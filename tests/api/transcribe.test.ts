// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'

// Transcribir es admin-only desde "el profe no sube" (requireRole('admin')). Mockeamos auth.
const authMock = vi.hoisted(() =>
  vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(
    async () => ({ user: { id: 'test-user', role: 'admin' } })
  )
)
vi.mock('@/lib/auth', () => ({ auth: authMock }))

import { POST } from '@/app/api/transcribe/route'
import { TRANSCRIPT_EMPTY_ERROR } from '@/lib/srt'
import { geminiHandlers, FAKE_SRT, FAKE_UPLOAD_URL, FAKE_BLOB_URL } from '../mocks/gemini-handlers'

const server = setupServer(...geminiHandlers)
const GEN_RE = /generativelanguage\.googleapis\.com\/v1beta\/models\/.*generateContent/

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  delete process.env.GEMINI_API_KEY
})
afterAll(() => server.close())

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-default'
  authMock.mockResolvedValue({ user: { id: 'test-user', role: 'admin' } })
})

function makeRequest(withBlobUrl = true): NextRequest {
  const body: Record<string, string> = { mimeType: 'video/mp4' }
  if (withBlobUrl) body.blobUrl = FAKE_BLOB_URL
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

  it('(b) sin blobUrl en el body → 400', async () => {
    const res = await POST(makeRequest(false))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('blobUrl requerido')
  })

  it('(c) happy path — upload + poll + generateContent → 200 { srt }', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.srt).toBe(FAKE_SRT)
  })

  it('(guard-401) sin sesión → 401, no toca Gemini', async () => {
    authMock.mockResolvedValueOnce(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('(guard-403) rol alumno → 403, no toca Gemini', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'al-1', role: 'alumno' } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  it('(guard-403b) rol profesor → 403, no toca Gemini (subir es solo admin)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'pf-1', role: 'profesor' } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
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

  // Paso 4: la ruta valida y normaliza la salida de Gemini (cleanSrt, lib/srt.ts).
  const geminiSays = (text: string, finishReason = 'STOP') =>
    server.use(http.post(GEN_RE, () => HttpResponse.json({ candidates: [{ content: { parts: [{ text }] }, finishReason }] })))

  it('(g) SRT con code fence → la ruta lo devuelve limpio (sin fences)', async () => {
    geminiSays('```srt\n1\n00:00:01,000 --> 00:00:03,000\nFenced text\n```')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).srt).toBe('1\n00:00:01,000 --> 00:00:03,000\nFenced text\n')
  })

  it('(k) un bloque roto (fin antes del inicio) se descarta y se renumera', async () => {
    geminiSays('1\n00:00:01,000 --> 00:00:03,000\nGood\n\n2\n00:00:05,000 --> 00:00:04,000\nBroken\n\n3\n00:00:06,000 --> 00:00:08,000\nAlso good\n')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).srt).toBe('1\n00:00:01,000 --> 00:00:03,000\nGood\n\n2\n00:00:06,000 --> 00:00:08,000\nAlso good\n')
  })

  it.each([
    ['vacía', '   '],
    ['texto que no es SRT', 'Sorry, I cannot transcribe this video.'],
    ['solo bloques rotos', '1\n00:00:05,000 --> 00:00:04,000\nBroken\n'],
  ])('(l) salida %s → 500 con mensaje claro', async (_, text) => {
    geminiSays(text)
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(TRANSCRIPT_EMPTY_ERROR)
  })

  it('(m) cortada por el tope de tokens (MAX_TOKENS) → se descarta el último bloque, que puede estar incompleto', async () => {
    geminiSays('1\n00:00:01,000 --> 00:00:03,000\nComplete line\n\n2\n00:00:04,000 --> 00:00:06,000\nThis was cut in the mid', 'MAX_TOKENS')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).srt).toBe('1\n00:00:01,000 --> 00:00:03,000\nComplete line\n')
  })

  it('(n) pedido a Gemini: inglés fijo (sin auto-detectar), palabra por palabra, temperatura 0 y tope de 65536', async () => {
    let body: { contents: { parts: { text?: string }[] }[]; generationConfig: { temperature: number; maxOutputTokens: number } } | null = null
    server.use(http.post(GEN_RE, async ({ request }) => {
      body = await request.json() as typeof body
      return HttpResponse.json({ candidates: [{ content: { parts: [{ text: FAKE_SRT }] } }] })
    }))
    await POST(makeRequest())
    expect(body!.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 65536 })
    const prompt = body!.contents[0].parts.map((p) => p.text ?? '').join('\n')
    expect(prompt).toMatch(/in ENGLISH/)
    expect(prompt).toMatch(/word for word/)
    expect(prompt).toMatch(/Do not translate/)
    expect(prompt).not.toMatch(/Auto-detect/i)
    expect(prompt).toMatch(/HH:MM:SS,mmm/)
  })

  it('(h) API key se manda por header x-goog-api-key, no en query string', async () => {
    process.env.GEMINI_API_KEY = 'test-key-secret'
    const captured: Array<{ url: string; apiKeyHeader: string | null }> = []

    server.use(
      http.post('https://generativelanguage.googleapis.com/upload/v1beta/files', ({ request }) => {
        captured.push({ url: request.url, apiKeyHeader: request.headers.get('x-goog-api-key') })
        return new HttpResponse(null, {
          status: 200,
          headers: { 'x-goog-upload-url': FAKE_UPLOAD_URL },
        })
      }),
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

    // DELETE (fire-and-forget no-awaited) — no capturable de forma confiable
    expect(captured).toHaveLength(3)
    for (const { url, apiKeyHeader } of captured) {
      expect(url).not.toContain('?key=')
      expect(apiKeyHeader).toBe('test-key-secret')
    }
  })

  it('(i) POST handler no llama file.arrayBuffer() — usa Blob passthrough para evitar OOM', async () => {
    const req = makeRequest()  // crear antes del spy para no capturar serialización del NextRequest
    const spy = vi.spyOn(Blob.prototype, 'arrayBuffer')
    try {
      await POST(req)
      // Bug 2: si la route llama file.arrayBuffer() crea una copia extra de ~videoSize en RAM.
      // Con Blob passthrough (body: file directo al fetch), arrayBuffer() no se invoca.
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it.todo('(j) browser-direct upload to Gemini bypasses Next.js multipart buffering — see CLAUDE.md "Memory budget"')
})
