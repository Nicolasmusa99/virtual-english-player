// Subtítulos a partir de palabras con tiempo (2026-11-23). Puro, sin red.
//
// Por qué: Gemini inventa los tiempos de cada bloque mirando el video entero y se le
// corren (empieza antes o después de que se escuche la voz). Un servicio de
// reconocimiento de voz (Deepgram) devuelve CADA PALABRA con su inicio y su fin exactos,
// así que el bloque arranca justo cuando se escucha su primera palabra y termina cuando
// termina la última. Acá solo se agrupan esas palabras en bloques cortos y fáciles de leer.
//
// Reglas de agrupado (mismas que se le pedían a Gemini):
//   · Máximo CUE_MAX_CHARS letras (2 renglones) y WORD_CUE_MAX_SEC segundos por bloque.
//   · Se corta en un silencio de PAUSE_SEC o más, y al terminar una oración.
//   · Si hay que cortar por largo, se busca un buen lugar hacia atrás (después de una
//     coma, o antes de "and", "but", "because"...; nunca después de "the", "a"...).
//   · El bloque queda en pantalla un poquito más (END_PAD_SEC) para poder leerlo, sin
//     pisar nunca al siguiente.
import { CUE_MAX_CHARS, srtTime } from '@/lib/srt'

export type TimedWord = { text: string; start: number; end: number; speaker?: number }
export type WordCue = { start: number; end: number; text: string }

export const WORD_CUE_MAX_SEC = 6
export const PAUSE_SEC = 0.7       // silencio que corta el bloque
export const END_PAD_SEC = 0.25    // cuánto más queda en pantalla después de la última palabra
export const MIN_CUE_SEC = 0.6     // ningún bloque dura menos (si hay lugar antes del siguiente)
const SHORT_SENTENCE = 12          // "Yes." "Oh, okay." se juntan con lo que sigue si no hay pausa

const CUT_BEFORE = new Set(['and', 'but', 'or', 'because', 'so', 'that', 'which', 'who', 'when', 'where', 'while', 'if', 'than', 'until', 'before', 'after', 'then'])
const NO_CUT_AFTER = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but', 'i', "i'm", 'very', 'not', 'no', 'is', 'are', 'was', 'be'])

const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')
const joined = (ws: TimedWord[]) => ws.map(w => w.text).join(' ')
const endsSentence = (w: string) => /[.?!…]["')\]]?$/.test(w)
const endsClause = (w: string) => /[,;:\-–—]["')\]]?$/.test(w)

// Dónde partir `ws` (índice de la primera palabra del pedazo de la derecha), buscando de
// atrás para adelante en la segunda mitad. -1 si no hay un lugar bueno.
function softCut(ws: TimedWord[]): number {
  const from = Math.max(1, Math.ceil(ws.length * 0.4))
  for (let k = ws.length - 1; k >= from; k--) if (endsSentence(ws[k - 1].text) || endsClause(ws[k - 1].text)) return k
  for (let k = ws.length - 1; k >= from; k--) {
    if (CUT_BEFORE.has(bare(ws[k].text)) && !NO_CUT_AFTER.has(bare(ws[k - 1].text))) return k
  }
  for (let k = ws.length - 1; k >= from; k--) if (!NO_CUT_AFTER.has(bare(ws[k - 1].text))) return k
  return -1
}

export function cuesFromWords(input: TimedWord[]): WordCue[] {
  const words = input
    .filter(w => w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map(w => ({ ...w, text: w.text.trim(), end: Math.max(w.end, w.start) }))
    .sort((a, b) => a.start - b.start)

  const groups: TimedWord[][] = []
  let cur: TimedWord[] = []
  const close = () => { if (cur.length) groups.push(cur); cur = [] }

  words.forEach((w, i) => {
    const prev = cur[cur.length - 1]
    if (prev) {
      const gap = w.start - prev.end
      const speakerChange = w.speaker !== undefined && prev.speaker !== undefined && w.speaker !== prev.speaker
      if (gap >= PAUSE_SEC || speakerChange) close()
      else {
        const tooLong = joined([...cur, w]).length > CUE_MAX_CHARS || w.end - cur[0].start > WORD_CUE_MAX_SEC
        if (tooLong) {
          const k = softCut(cur)
          if (k > 0) { groups.push(cur.slice(0, k)); cur = cur.slice(k) } else close()
          // lo que quedó todavía puede no entrar con la palabra nueva
          if (cur.length && (joined([...cur, w]).length > CUE_MAX_CHARS || w.end - cur[0].start > WORD_CUE_MAX_SEC)) close()
        }
      }
    }
    cur.push(w)
    const next = words[i + 1]
    if (endsSentence(w.text)) {
      const shortAndRushed = joined(cur).length < SHORT_SENTENCE && next && next.start - w.end < 0.3 && next.speaker === w.speaker
      if (!shortAndRushed) close()
    }
  })
  close()

  return groups.map((g, i) => {
    const start = g[0].start
    const nextStart = groups[i + 1]?.[0].start ?? Infinity
    let end = Math.min(g[g.length - 1].end + END_PAD_SEC, nextStart)
    if (end - start < MIN_CUE_SEC) end = Math.min(start + MIN_CUE_SEC, nextStart)
    if (end <= start) end = start + 0.05
    const r = (n: number) => Math.round(n * 1000) / 1000
    return { start: r(start), end: r(end), text: joined(g) }
  })
}

// Bloques → texto SRT (numerados desde 1). Vacío si no hay bloques.
export function cuesToSrt(cues: WordCue[]): string {
  if (!cues.length) return ''
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join('\n\n') + '\n'
}
