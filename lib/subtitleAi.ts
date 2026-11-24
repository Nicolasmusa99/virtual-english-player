// La IA decide dónde cortar los subtítulos (2026-11-23).
//
// Whisper (Groq) da el tiempo exacto de cada palabra; con reglas fijas (letras, segundos,
// pausas) los cortes quedaban mecánicos ("And it is like nothing he" / "could have...").
// Acá Gemini recibe las palabras numeradas, con las pausas marcadas, y devuelve en qué
// palabra empieza cada subtítulo, como lo haría alguien que subtitula. Gemini NO toca los
// tiempos ni el texto: solo elige los cortes. Después se controla todo:
//   · los índices tienen que ser válidos (empiezan en 0, crecientes, dentro del rango);
//   · un bloque que igual pase el largo o la duración máxima se vuelve a cortar con las reglas;
//   · si Gemini falla o devuelve algo raro, quedan los cortes por reglas (groupWords).
// Tests: tests/lib/subtitle-ai.test.ts (con un fetch falso).
import { groupWords, normalizeWords, timeGroups, WORD_CUE_MAX_CHARS, WORD_CUE_MAX_SEC, type TimedWord, type WordCue } from '@/lib/wordCues'

export const SEGMENT_MODEL = 'gemini-2.5-flash'
const SHOW_PAUSE_SEC = 0.4

export function segmentPrompt(words: TimedWord[]): string {
  const lines: string[] = []
  words.forEach((w, i) => {
    const gap = i > 0 ? w.start - words[i - 1].end : 0
    if (gap >= SHOW_PAUSE_SEC) lines.push(`   (pause ${gap.toFixed(1)}s)`)
    lines.push(`${i} ${w.text}`)
  })
  return `You are a professional subtitle editor. The subtitles are for people LEARNING ENGLISH, shown under a video.

Below are the words of the transcript, numbered, in order. Silences are marked as (pause Ns).
Group the words into subtitle cues. Return ONLY the index of the FIRST word of each cue.

Rules:
- Each cue is one natural phrase that can be read at a glance: at most ${WORD_CUE_MAX_CHARS} characters, ideally 25 to 45. At most ${WORD_CUE_MAX_SEC} seconds of speech.
- Keep a short sentence whole in one cue. Split longer sentences at natural boundaries: after punctuation, before a conjunction (and, but, because, so, that, which, who, when, if) or before a new clause or prepositional phrase.
- Never end a cue with an article, preposition, possessive, auxiliary or subject pronoun (the, a, of, to, his, is, he, I...). Never split a name, a number or a phrasal verb.
- A new sentence usually starts a new cue. A long pause (1s or more) always starts a new cue.
- Do not reorder, add or remove words.

Return JSON exactly like: {"starts":[0, 7, 15]}  (must start with 0, strictly increasing, every index between 0 and ${words.length - 1}).

Words:
${lines.join('\n')}`
}

export function validStarts(starts: unknown, n: number): number[] | null {
  if (!Array.isArray(starts) || !starts.length || starts[0] !== 0) return null
  for (let i = 0; i < starts.length; i++) {
    const v = starts[i]
    if (!Number.isInteger(v) || v < 0 || v >= n || (i > 0 && v <= starts[i - 1])) return null
  }
  return starts as number[]
}

const text = (g: TimedWord[]) => g.map(w => w.text).join(' ')

// Cortes elegidos → bloques; los que se pasen del máximo se vuelven a cortar con reglas.
export function groupsFromStarts(words: TimedWord[], starts: number[]): TimedWord[][] {
  const out: TimedWord[][] = []
  starts.forEach((s, i) => {
    const g = words.slice(s, starts[i + 1] ?? words.length)
    const tooLong = text(g).length > WORD_CUE_MAX_CHARS || g[g.length - 1].end - g[0].start > WORD_CUE_MAX_SEC + 0.5
    if (tooLong) out.push(...groupWords(g)); else out.push(g)
  })
  return out
}

export async function aiCues(
  input: TimedWord[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ cues: WordCue[]; byAi: boolean }> {
  const words = normalizeWords(input)
  if (words.length < 2) return { cues: timeGroups(groupWords(words)), byAi: false }
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${SEGMENT_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: segmentPrompt(words) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    const starts = validStarts(JSON.parse(String(raw ?? '')).starts, words.length)
    if (!starts) throw new Error('cortes inválidos')
    return { cues: timeGroups(groupsFromStarts(words, starts)), byAi: true }
  } catch (e) {
    console.warn('[subtitleAi] Cortes por reglas:', e instanceof Error ? e.message : e)
    return { cues: timeGroups(groupWords(words)), byAi: false }
  }
}

// Título del video sacado de la URL de Blob (videos/<id>/<archivo>), para darle contexto a
// Whisper (acierta mejor nombres propios). Sin extensión, sin sufijos de conversores.
export function titleFromBlobUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    return last
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/\(?video-converter\.com\)?(\s*\(\d+\))?/gi, '')
      .replace(/-[A-Za-z0-9]{20,}$/, '')        // sufijo al azar de Vercel Blob
      .replace(/[_]+/g, ' ')
      .replace(/\s+-\s+/g, ', ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
  } catch { return '' }
}
