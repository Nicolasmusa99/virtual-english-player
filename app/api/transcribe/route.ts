import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { cleanSrt, TRANSCRIPT_EMPTY_ERROR } from '@/lib/srt'

// Node.js runtime — needed for large file handling and long timeouts
export const maxDuration = 300

// Tope de salida de Gemini. Con 8192 los SRT largos salían cortados (el final incompleto o
// inventado). gemini-2.5-flash admite hasta 65536, y en ese tope también entran los tokens
// que el modelo usa para "pensar" antes de responder.
const MAX_OUTPUT_TOKENS = 65536

// El audio de los videos es SIEMPRE en inglés: se fija el idioma (no se auto-detecta) y se
// pide fidelidad palabra por palabra. La salida se valida con cleanSrt (lib/srt.ts).
const TRANSCRIBE_PROMPT = `The audio of this video is in ENGLISH. Transcribe it in English.

Transcribe ALL speech word for word, exactly as it is spoken:
- Do not translate, do not summarize, do not correct the grammar.
- Do not detect or switch language: the language is English.
- Keep contractions and informal English as they are said (gonna, wanna, gotta, ain't, y'all, and so on).
- Include every word from the very beginning to the very end of the audio. Do not stop early and do not skip the last lines.

Return ONLY a valid SRT subtitle file in this exact format:

1
00:00:00,000 --> 00:00:04,500
Text of what was said.

2
00:00:05,000 --> 00:00:09,000
More text here.

STRICT RULES:
- Number the blocks 1, 2, 3 and so on, in order
- Timestamps in HH:MM:SS,mmm format that precisely match when the words are spoken
- The end time of each block must be after its start time
- 1-2 sentences per block, 3-10 seconds each
- Return ONLY the SRT content: no markdown, no code blocks, no explanations`

async function uploadToGemini(file: Blob, mimeType: string, apiKey: string): Promise<string> {
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'video' } }),
    }
  )
  if (!startRes.ok) {
    const err = await startRes.text()
    throw new Error(`Upload start failed: ${startRes.status} — ${err.slice(0, 200)}`)
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No upload URL from Gemini')

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(file.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    // Blob passthrough: el video ya está en memoria (fetch(blobUrl).blob()); esto evita
    // una segunda copia. Peak ≈ videoSize — aceptable hasta ~1.5 GB en Vercel.
    body: file,
  })
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Upload failed: ${uploadRes.status} — ${err.slice(0, 200)}`)
  }
  const data = await uploadRes.json()
  const uri = data.file?.uri
  if (!uri) throw new Error('No file URI from Gemini')
  return uri
}

async function waitForFile(name: string, apiKey: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { 'x-goog-api-key': apiKey },
    })
    const d = await res.json()
    if (d.state === 'ACTIVE') return
    if (d.state === 'FAILED') throw new Error('Gemini failed to process the file')
  }
  throw new Error('Timeout: Gemini took too long to process the file')
}

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    const { blobUrl, mimeType: mimeIn } = await req.json()
    if (!blobUrl || typeof blobUrl !== 'string') {
      return NextResponse.json({ error: 'blobUrl requerido' }, { status: 400 })
    }

    // El video vive en Vercel Blob (subido directo por el browser). Lo bajamos acá y se lo
    // pasamos a Gemini igual que antes. Esto evita el límite de 4.5 MB de body de Vercel.
    const dl = await fetch(blobUrl)
    if (!dl.ok) throw new Error(`No se pudo descargar el video del storage: ${dl.status}`)
    const file = await dl.blob()

    const mimeType = mimeIn || file.type || 'video/mp4'
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    console.log(`[transcribe] Blob: ${sizeMB} MB — ${mimeType}`)
    console.log(`[transcribe] Uploading to Gemini...`)

    const fileUri = await uploadToGemini(file, mimeType, apiKey)
    const fileName = 'files/' + fileUri.split('/files/')[1]
    console.log(`[transcribe] Uploaded: ${fileUri}`)

    await waitForFile(fileName, apiKey)
    console.log(`[transcribe] File ACTIVE, generating transcription...`)

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { file_data: { mime_type: mimeType, file_uri: fileUri } },
              { text: TRANSCRIBE_PROMPT },
            ]
          }],
          generationConfig: { temperature: 0.0, maxOutputTokens: MAX_OUTPUT_TOKENS }
        })
      }
    )

    if (!genRes.ok) {
      const err = await genRes.text()
      throw new Error(`Gemini error: ${genRes.status} — ${err.slice(0, 300)}`)
    }

    const genData = await genRes.json()
    const candidate = genData.candidates?.[0]
    const raw = candidate?.content?.parts?.[0]?.text
    if (!raw) throw new Error('Gemini returned no transcription content')

    // Validar antes de devolver: sin fences, sin bloques con fin antes del inicio, y si se
    // cortó por el tope de tokens, sin el último bloque (puede estar incompleto).
    const truncated = candidate?.finishReason === 'MAX_TOKENS'
    const { srt, phrases, dropped } = cleanSrt(raw, { dropLast: truncated })
    console.log(`[transcribe] Done — ${phrases} phrases (${dropped} descartadas${truncated ? ', salida cortada por el tope de tokens' : ''})`)

    fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': apiKey },
    }).catch(() => {})

    if (phrases === 0) return NextResponse.json({ error: TRANSCRIPT_EMPTY_ERROR }, { status: 500 })
    return NextResponse.json({ srt })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[transcribe] Error:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
