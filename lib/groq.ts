// Transcripción con Groq + Whisper (2026-11-23): gratis (free tier sin tarjeta) y con el
// tiempo exacto de CADA palabra. La usa /api/transcribe cuando está GROQ_API_KEY; si no
// está, falla o el video pasa el límite del free tier (25 MB), sigue Gemini.
// Groq baja el video él mismo desde la URL pública de Vercel Blob (parámetro `url`): el
// servidor no lo descarga. Tests: tests/lib/word-cues.test.ts (con un fetch falso).
import type { TimedWord } from '@/lib/wordCues'

export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const GROQ_MODEL = 'whisper-large-v3'
export const GROQ_FREE_MAX_BYTES = 25 * 1024 * 1024

type GWord = { word?: string; start?: number; end?: number }
type GSegment = { text?: string; end?: number }

// Whisper a veces da las palabras sin puntuación; los segmentos sí la traen. Se le pasa
// el signo final de cada segmento a su última palabra, así wordCues corta las oraciones.
function punctuate(words: TimedWord[], segments: GSegment[]): TimedWord[] {
  if (!segments.length || words.some(w => /[.?!,]$/.test(w.text))) return words
  const out = words.map(w => ({ ...w }))
  for (const s of segments) {
    const mark = String(s.text ?? '').trim().match(/[.?!,]$/)?.[0]
    if (!mark || !Number.isFinite(s.end)) continue
    let best = -1
    out.forEach((w, i) => { if (w.end <= (s.end as number) + 0.05) best = i })
    if (best >= 0 && !/[.?!,]$/.test(out[best].text)) out[best].text += mark
  }
  return out
}

export async function groqWords(
  mediaUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TimedWord[]> {
  const form = new FormData()
  form.append('model', GROQ_MODEL)
  form.append('url', mediaUrl)
  form.append('language', 'en') // el audio es SIEMPRE en inglés
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  form.append('temperature', '0')
  const res = await fetchImpl(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Groq error: ${res.status} — ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const words: TimedWord[] = ((data?.words ?? []) as GWord[])
    .map(w => ({ text: String(w.word ?? '').trim(), start: Number(w.start), end: Number(w.end) }))
    .filter(w => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
  return punctuate(words, (data?.segments ?? []) as GSegment[])
}
