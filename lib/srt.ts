export interface Phrase { start: number; end: number; text: string; sel: boolean }

export function timeToSec(s: string): number {
  const c = s.replace(',', '.').trim().split(':')
  if (c.length === 3) return +c[0] * 3600 + +c[1] * 60 + +c[2]
  if (c.length === 2) return +c[0] * 60 + +c[1]
  return +c[0]
}

export function parseSRT(text: string): Phrase[] {
  const result: Phrase[] = []
  const clean = text.replace(/```[a-z]*\n?/gi, '').trim()
  const blocks = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/)
  blocks.forEach(block => {
    const lines = block.trim().split('\n')
    const tl = lines.find(l => l.includes('-->'))
    if (!tl) return
    const [a, b] = tl.split('-->').map(s => s.trim())
    const start = timeToSec(a), end = timeToSec(b)
    const idx = lines.indexOf(tl)
    const txt = lines.slice(idx + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (txt && !isNaN(start) && start >= 0) result.push({ start, end, text: txt, sel: true })
  })
  return result
}

export function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60), sc = Math.floor(s % 60)
  return `${m}:${sc < 10 ? '0' : ''}${sc}`
}

// Converts seconds to "M:SS,mmm" for timestamp edit inputs.
export function secToTs(s: number): string {
  const m  = Math.floor(s / 60)
  const sc = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${m}:${sc < 10 ? '0' : ''}${sc},${String(ms).padStart(3, '0')}`
}

export function splitPhrase(phrase: Phrase, charOffset: number): [Phrase, Phrase] {
  if (charOffset <= 0 || charOffset >= phrase.text.length)
    throw new RangeError(`charOffset ${charOffset} out of range for text of length ${phrase.text.length}`)
  const duration = phrase.end - phrase.start
  const splitAt  = phrase.start + duration * (charOffset / phrase.text.length)
  const textA    = phrase.text.slice(0, charOffset).trimEnd()
  const textB    = phrase.text.slice(charOffset).trimStart()
  return [
    { start: phrase.start, end: splitAt,    text: textA, sel: phrase.sel },
    { start: splitAt,      end: phrase.end, text: textB, sel: phrase.sel },
  ]
}

// Dónde dividir una frase (2026-11): SIEMPRE entre palabras, nunca en la mitad de una.
// Busca el espacio más cercano a la mitad del texto; prefiere cortar después de una coma o
// un punto (queda más natural) y evita dejar una sola palabra suelta de un lado si la frase
// da para más. Devuelve la posición del espacio, o null si no se puede (una sola palabra).
export function wordSplitOffset(text: string): number | null {
  const spaces: number[] = []
  for (let i = 1; i < text.length - 1; i++) if (/\s/.test(text[i]) && !/\s/.test(text[i - 1])) spaces.push(i)
  if (spaces.length === 0) return null
  const words = text.trim().split(/\s+/).length
  const mid = text.length / 2
  let best: number | null = null
  let bestScore = Infinity
  for (const i of spaces) {
    const left = text.slice(0, i).trim().split(/\s+/).length
    const right = words - left
    if (words >= 4 && (left < 2 || right < 2)) continue // sin palabras sueltas
    let score = Math.abs(i - mid)
    if (/[,;:.!?]/.test(text[i - 1])) score -= text.length * 0.15 // corte natural
    if (score < bestScore) { bestScore = score; best = i }
  }
  return best ?? spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
}

export function mergePhrase(a: Phrase, b: Phrase): Phrase {
  return {
    start: a.start,
    end:   b.end,
    text:  a.text + ' ' + b.text,
    sel:   a.sel || b.sel,
  }
}

// ─── Transcripción de Gemini: validar y normalizar lo que devuelve (paso 4) ───

// Segundos → 'HH:MM:SS,mmm' (formato de SRT).
export function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000), r = ms % 1000
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`
}

// Lo que devolvió Gemini, limpio: reusa parseSRT (saca fences, CRLF, acepta HH:MM:SS,mmm y
// MM:SS) y además descarta los bloques con un fin imposible (antes del inicio, igual, o que
// no se pudo leer). Los ordena por inicio y los renumera. `dropLast`: la salida se cortó por
// el tope de tokens, así que el último bloque puede estar incompleto y se descarta.
// Devuelve el SRT limpio, cuántos bloques quedaron y cuántos se descartaron.
// `tidy` (2026-11, lo usa /api/transcribe): además ajusta los tiempos y corta los bloques
// largos (tidyCues). Los números de `phrases`/`dropped` cuentan lo que sale.
export function cleanSrt(text: string, opts: { dropLast?: boolean; tidy?: boolean } = {}): { srt: string; phrases: number; dropped: number } {
  const all = parseSRT(text)
  let ok = all.filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start)
    .sort((a, b) => a.start - b.start)
  if (opts.dropLast && ok.length > 0) ok = ok.slice(0, -1)
  if (opts.tidy) ok = tidyCues(ok).map((c) => ({ ...c, sel: false }))
  const srt = ok.map((p, i) => `${i + 1}\n${srtTime(p.start)} --> ${srtTime(p.end)}\n${p.text}`).join('\n\n')
  return { srt: ok.length ? srt + '\n' : '', phrases: ok.length, dropped: all.length - ok.length }
}

// Mensaje cuando Gemini no devolvió ningún bloque usable.
export const TRANSCRIPT_EMPTY_ERROR = 'La transcripción salió vacía o mal formada, probá de nuevo.'

// ─── Subtítulos de Gemini más prolijos (2026-11) ─────────────────────────────
// Gemini a veces devuelve bloques larguísimos (3-4 renglones) o que se quedan en pantalla
// durante un silencio, y a veces se pisan con el siguiente. tidyCues lo arregla sin
// inventar texto:
//   1. Un bloque no termina después de que empieza el siguiente (se recorta el fin).
//   2. Un bloque no queda en pantalla mucho más de lo que se tarda en decirlo (silencios).
//   3. Un bloque de más de CUE_MAX_CHARS letras o más de CUE_MAX_SEC segundos se corta en
//      dos, primero en un punto, si no en una coma y si no en un espacio, lo más cerca del
//      medio posible. El tiempo se reparte según las letras de cada mitad. Se repite hasta
//      que todos entran.
export const CUE_MAX_CHARS = 84      // dos renglones cómodos
export const CUE_MAX_SEC = 7
const CUE_MIN_SEC = 0.8              // ningún pedazo dura menos que esto
const CHARS_PER_SEC = 15             // inglés hablado, aproximado
const CUE_LINGER = 3                 // cuánto más que "lo que tarda en decirse" puede quedar
const CUE_LINGER_MIN_SEC = 5

type Cue = { start: number; end: number; text: string }
// Palabras antes de las que se corta bien, y después de las que no se corta nunca.
const CUT_BEFORE = new Set(['and', 'but', 'or', 'because', 'so', 'that', 'which', 'who', 'when', 'where', 'while', 'if', 'to', 'for', 'with', 'of', 'in', 'on', 'at', 'from', 'about', 'into', 'than', 'until', 'before', 'after'])
const NO_CUT_AFTER = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this', 'that', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but', 'i', "i'm", 'very', 'so', 'not', 'no'])

// Dónde cortar `text` en dos: el índice del espacio después del corte, o -1.
function cutIndex(text: string): number {
  const mid = text.length / 2
  const spaces: number[] = []
  for (let i = 1; i < text.length - 1; i++) if (text[i] === ' ') spaces.push(i)
  if (spaces.length === 0) return -1
  const lo = text.length * 0.25, hi = text.length * 0.75
  const nearest = (cands: number[]) => cands.reduce((b, i) => (Math.abs(i - mid) < Math.abs(b - mid) ? i : b))
  const lastWord = (i: number) => (text.slice(0, i).match(/([A-Za-z']+)\W*$/)?.[1] ?? '').toLowerCase()
  const nextWord = (i: number) => (text.slice(i + 1).match(/^\W*([A-Za-z']+)/)?.[1] ?? '').toLowerCase()
  const tiers: ((i: number) => boolean)[] = [
    (i) => /[.?!…]["')\]]?$/.test(text.slice(0, i)),                       // fin de oración
    (i) => /[,;:\-–—]$/.test(text.slice(0, i)),                             // coma, punto y coma
    (i) => CUT_BEFORE.has(nextWord(i)) && !NO_CUT_AFTER.has(lastWord(i)),  // antes de "and", "to", "of"...
    (i) => !NO_CUT_AFTER.has(lastWord(i)),                                  // nunca después de "the", "a"...
  ]
  for (const ok of tiers) {
    const c = spaces.filter((i) => i >= lo && i <= hi && ok(i))
    if (c.length) return nearest(c)
  }
  return nearest(spaces)
}

function splitCue(c: Cue): Cue[] {
  const text = c.text.replace(/\s*\n\s*/g, ' ').trim()
  const dur = c.end - c.start
  const tooLong = text.length > CUE_MAX_CHARS || (dur > CUE_MAX_SEC && text.length > CUE_MAX_CHARS / 2)
  if (!tooLong || dur < CUE_MIN_SEC * 2) return [c]
  const at = cutIndex(text)
  if (at < 0) return [c]
  const left = text.slice(0, at).trim(), right = text.slice(at + 1).trim()
  if (!left || !right) return [c]
  const cut = Math.min(c.end - CUE_MIN_SEC, Math.max(c.start + CUE_MIN_SEC, c.start + dur * (left.length / (left.length + right.length))))
  const t = Math.round(cut * 1000) / 1000
  return [...splitCue({ start: c.start, end: t, text: left }), ...splitCue({ start: t, end: c.end, text: right })]
}

export function tidyCues<T extends Cue>(cues: T[]): Cue[] {
  const out: Cue[] = []
  cues.forEach((c, i) => {
    let end = c.end
    const next = cues[i + 1]
    if (next && end > next.start && next.start > c.start) end = next.start
    const len = c.text.replace(/\s+/g, ' ').trim().length
    const maxStay = Math.max(CUE_LINGER_MIN_SEC, (len / CHARS_PER_SEC) * CUE_LINGER)
    if (end - c.start > maxStay) end = c.start + maxStay
    out.push(...splitCue({ start: c.start, end: Math.round(end * 1000) / 1000, text: c.text }))
  })
  return out
}
