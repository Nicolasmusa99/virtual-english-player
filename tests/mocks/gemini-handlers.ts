import { http, HttpResponse } from 'msw'

export const FAKE_UPLOAD_URL = 'https://gemini-upload.test/upload/session'
export const FAKE_FILE_URI = 'https://generativelanguage.googleapis.com/v1beta/files/test-file-id'
export const FAKE_SRT = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n'

const BASE = 'https://generativelanguage.googleapis.com'

export const geminiHandlers = [
  // 1. Resumable upload start — devuelve la session upload URL
  http.post(`${BASE}/upload/v1beta/files`, () =>
    new HttpResponse(null, {
      status: 200,
      headers: { 'x-goog-upload-url': FAKE_UPLOAD_URL },
    })
  ),

  // 2. Upload bytes al session URL — devuelve file URI
  http.put(FAKE_UPLOAD_URL, () =>
    HttpResponse.json({
      file: { uri: FAKE_FILE_URI, name: 'files/test-file-id' },
    })
  ),

  // 3. Poll file state — devuelve ACTIVE inmediatamente (sin espera real en tests)
  http.get(`${BASE}/v1beta/files/test-file-id`, () =>
    HttpResponse.json({ state: 'ACTIVE', name: 'files/test-file-id' })
  ),

  // 4. Generate content — devuelve SRT mínimo válido
  //    Regex porque path-to-regexp interpreta el : en "gemini-2.5-flash:generateContent" como param
  http.post(
    /generativelanguage\.googleapis\.com\/v1beta\/models\/.*generateContent/,
    () =>
      HttpResponse.json({
        candidates: [{ content: { parts: [{ text: FAKE_SRT }] } }],
      })
  ),

  // 5. Delete uploaded file — fire-and-forget en el route, solo acknowledge
  http.delete(`${BASE}/v1beta/files/test-file-id`, () =>
    new HttpResponse(null, { status: 200 })
  ),
]
