import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { cleanSrt, parseSRT, TRANSCRIPT_EMPTY_ERROR } from '@/lib/srt'
import { isVercelBlobUrl } from '@/lib/blobUrl'
import { groqWords, GROQ_FREE_MAX_BYTES } from '@/lib/groq'
import { extractAudioMp3 } from '@/lib/audio'
import { aiCues, titleFromBlobUrl } from '@/lib/subtitleAi'
import { cuesToSrt, fillGaps, type WordCue } from '@/lib/wordCues'

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

TIMING (the most important part, the subtitles are used to practice listening):
- The start time of each block is the exact moment its FIRST word starts to be heard.
- The end time is the moment its LAST word ends. Do not keep a block on screen during silence, music or pauses: end it when the voice stops.
- Keep timing accurate all the way to the end of the video. Do not let it drift later or earlier as the video goes on.
- Blocks never overlap: each block ends before or exactly when the next one starts.

SEGMENTATION (short blocks that are easy to read):
- Each block is ONE short phrase: at most 2 lines and about 80 characters in total, and at most 6 seconds long.
- Split long sentences into several blocks at natural pauses: after a comma, before "and", "but", "because", "so", "that", "which", or where the speaker takes a breath.
- Never put two different speakers in the same block.
- Never put the end of one sentence and the start of the next in the same block if it makes the block long.

STRICT RULES:
- Number the blocks 1, 2, 3 and so on, in order
- Timestamps in HH:MM:SS,mmm format
- The end time of each block must be after its start time
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

// Gemini: sube el video (ya bajado de Blob) a Gemini y devuelve el SRT limpio.
async function geminiTranscript(file: Blob, mimeIn: string | undefined, apiKey: string): Promise<{ srt: string; phrases: number }> {
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
  // tidy (2026-11): corta los bloques que Gemini igual devuelva largos y recorta los que se
  // pisan o se quedan en pantalla durante un silencio (tidyCues en lib/srt.ts).
  const { srt, phrases, dropped } = cleanSrt(raw, { dropLast: truncated, tidy: true })
  console.log(`[transcribe] Done — ${phrases} phrases (${dropped} descartadas${truncated ? ', salida cortada por el tope de tokens' : ''})`)

  fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': apiKey },
  }).catch(() => {})
  return { srt, phrases }
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
    // Solo se baja de NUESTRO almacenamiento: el servidor no le pega a cualquier dirección.
    if (!isVercelBlobUrl(blobUrl)) {
      return NextResponse.json({ error: 'blobUrl inválido' }, { status: 400 })
    }

    // (2026-11-23) Groq + Whisper (gratis) y Gemini EN PARALELO:
    //   · Groq da el tiempo exacto de cada palabra, pero con música de fondo a veces se
    //     saltea tramos enteros.
    //   · Gemini escucha todo, con tiempos aproximados.
    // Se usan los bloques de Groq y los huecos que dejó se completan con los de Gemini
    // (fillGaps en lib/wordCues.ts). Sin clave de Groq o si falla, queda solo Gemini.
    // El video vive en Vercel Blob (subido directo por el browser). Se baja UNA vez acá
    // y lo usan los dos. Esto evita el límite de 4.5 MB de body de Vercel.
    const dl = await fetch(blobUrl)
    if (!dl.ok) throw new Error(`No se pudo descargar el video del storage: ${dl.status}`)
    const file = await dl.blob()

    // (2026-11-23) A Groq se le manda SOLO EL AUDIO (lib/audio.ts): el video entero solía
    // pasar los 25 MB del free tier y Groq lo rechazaba, así que todo salía de Gemini.
    // Si no se puede sacar el audio, se le pasa la URL del video (sirve si pesa menos de 25 MB).
    const groqKey = process.env.GROQ_API_KEY
    const groqP: Promise<WordCue[] | null> = !groqKey ? Promise.resolve(null) : (async () => {
      let media: string | Blob = blobUrl
      try {
        media = await extractAudioMp3(file)
        console.log(`[transcribe] Audio para Groq: ${(media.size / 1024).toFixed(0)} KB (video ${(file.size / 1024 / 1024).toFixed(1)} MB)`)
      } catch (e) {
        console.warn('[transcribe] No se pudo sacar el audio:', e instanceof Error ? e.message : e)
        if (file.size > GROQ_FREE_MAX_BYTES) { console.warn('[transcribe] Video de más de 25 MB: queda Gemini'); return null }
      }
      // (2026-11-23) El título del video le da contexto a Whisper, y los cortes los elige
      // Gemini sobre las palabras de Whisper (lib/subtitleAi.ts); si falla, cortes por reglas.
      const words = await groqWords(media, groqKey, fetch, titleFromBlobUrl(blobUrl))
      const { cues, byAi } = await aiCues(words, apiKey)
      console.log(`[transcribe] Groq — ${words.length} palabras, ${cues.length} frases (cortes ${byAi ? 'de Gemini' : 'por reglas'})`)
      return cues.length ? cues : null
    })().catch(e => { console.warn('[transcribe] Groq falló, queda Gemini:', e instanceof Error ? e.message : e); return null })
    const [groq, gemini] = await Promise.allSettled([groqP, geminiTranscript(file, mimeIn, apiKey)])
    const groqCues = groq.status === 'fulfilled' ? groq.value : null

    if (!groqCues) {
      if (gemini.status === 'rejected') throw gemini.reason
      if (gemini.value.phrases === 0) return NextResponse.json({ error: TRANSCRIPT_EMPTY_ERROR }, { status: 500 })
      return NextResponse.json({ srt: gemini.value.srt })
    }

    if (gemini.status === 'rejected') {
      console.warn('[transcribe] Gemini falló, quedan solo los bloques de Groq:', gemini.reason instanceof Error ? gemini.reason.message : gemini.reason)
    }
    const backup = gemini.status === 'fulfilled' ? parseSRT(gemini.value.srt).map(({ start, end, text }) => ({ start, end, text })) : []
    const { cues, added } = fillGaps(groqCues, backup)
    const { srt } = cleanSrt(cuesToSrt(cues))
    console.log(`[transcribe] Groq + Gemini — ${cues.length} frases (${added} agregadas de Gemini en huecos de Groq)`)
    return NextResponse.json({ srt })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[transcribe] Error:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
