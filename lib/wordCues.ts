// Subtítulos a partir de palabras con tiempo (2026-11-23). Puro, sin red.
//
// Por qué: Gemini inventa los tiempos de cada bloque mirando el video entero y se le
// corren (empieza antes o después de que se escuche la voz). Un servicio de
// reconocimiento de voz (Deepgram) devuelve CADA PALABRA con su inicio y su fin exactos,
// así que el bloque arranca justo cuando se escucha su primera palabra y termina cuando
// termina la última. Acá solo se agrupan esas palabras en bloques cortos y fáciles de leer.
//
// Reglas de agrupado (mismas que se le pedían a Gemini):
//   · Máximo WORD_CUE_MAX_CHARS letras (renglón y medio) y WORD_CUE_MAX_SEC segundos por bloque.
//   · Se corta al terminar una oración y en un silencio largo (LONG_PAUSE_SEC). Un silencio
//     corto (PAUSE_SEC) corta SOLO si la frase ya terminó una cláusula (coma) o ya es larga:
//     los narradores hacen pausas en el medio de la oración y cortar ahí la partía en dos.
//   · (2026-11-23) Después se juntan los pedazos de una misma oración si entran juntos.
//   · (2026-11-23) El bloque aparece LEAD_IN_SEC antes de la primera palabra: Whisper marca
//     el inicio un poco tarde, y lo normal en subtítulos es que aparezcan apenas antes de la voz.
//   · Si hay que cortar por largo, se busca un buen lugar hacia atrás (después de una
//     coma, o antes de "and", "but", "because"...; nunca después de "the", "a"...).
//   · El bloque queda en pantalla un poquito más (END_PAD_SEC) para poder leerlo, sin
//     pisar nunca al siguiente.
import { srtTime } from '@/lib/srt'

export type TimedWord = { text: string; start: number; end: number; speaker?: number }
export type WordCue = { start: number; end: number; text: string }

// (2026-11-23) Más cortos, a pedido del dueño: antes 84 letras (2 renglones llenos) y 6 s.
export const WORD_CUE_MAX_CHARS = 60
export const WORD_CUE_MAX_SEC = 4.5
export const PAUSE_SEC = 0.7       // silencio que corta si ya terminó una cláusula o es largo
export const LONG_PAUSE_SEC = 1.5  // silencio que corta siempre
export const LEAD_IN_SEC = 0.2     // el bloque aparece un poquito antes de la voz
const PAUSE_CUT_CHARS = 30         // desde este largo, un silencio corto ya corta
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

// Limpia y ordena las palabras (sin vacías ni sin tiempo).
export function normalizeWords(input: TimedWord[]): TimedWord[] {
  return input
    .filter(w => w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map(w => ({ ...w, text: w.text.trim(), end: Math.max(w.end, w.start) }))
    .sort((a, b) => a.start - b.start)
}

// Agrupa las palabras en bloques con las reglas de arriba (sin tiempos todavía).
export function groupWords(input: TimedWord[]): TimedWord[][] {
  const words = normalizeWords(input)
  const groups: TimedWord[][] = []
  let cur: TimedWord[] = []
  const close = () => { if (cur.length) groups.push(cur); cur = [] }

  words.forEach((w, i) => {
    const prev = cur[cur.length - 1]
    if (prev) {
      const gap = w.start - prev.end
      const speakerChange = w.speaker !== undefined && prev.speaker !== undefined && w.speaker !== prev.speaker
      const pauseCuts = gap >= LONG_PAUSE_SEC ||
        (gap >= PAUSE_SEC && (endsClause(prev.text) || joined(cur).length >= PAUSE_CUT_CHARS))
      if (pauseCuts || speakerChange) close()
      else {
        const tooLong = joined([...cur, w]).length > WORD_CUE_MAX_CHARS || w.end - cur[0].start > WORD_CUE_MAX_SEC
        if (tooLong) {
          const k = softCut(cur)
          if (k > 0) { groups.push(cur.slice(0, k)); cur = cur.slice(k) } else close()
          // lo que quedó todavía puede no entrar con la palabra nueva
          if (cur.length && (joined([...cur, w]).length > WORD_CUE_MAX_CHARS || w.end - cur[0].start > WORD_CUE_MAX_SEC)) close()
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

  // Juntar pedazos de una misma oración (el primero no la termina) si entran en un bloque
  // y no hay un silencio largo ni cambio de persona entre ellos.
  for (let i = 0; i < groups.length - 1; ) {
    const a = groups[i], b = groups[i + 1]
    const last = a[a.length - 1]
    const fits = joined([...a, ...b]).length <= WORD_CUE_MAX_CHARS && b[b.length - 1].end - a[0].start <= WORD_CUE_MAX_SEC
    const sameSpeaker = last.speaker === b[0].speaker
    if (!endsSentence(last.text) && fits && sameSpeaker && b[0].start - last.end < LONG_PAUSE_SEC) {
      groups.splice(i, 2, [...a, ...b])
    } else i++
  }
  return groups
}

// Tiempos de cada bloque: aparece LEAD_IN_SEC antes de su primera palabra (sin meterse en
// la voz del anterior) y queda END_PAD_SEC después de la última, sin pisar al siguiente.
export function timeGroups(groups: TimedWord[][]): WordCue[] {
  groups = groups.filter(g => g.length)
  const r = (n: number) => Math.round(n * 1000) / 1000
  // Inicio: un poquito antes de la primera palabra, sin meterse en la voz del bloque anterior.
  const starts = groups.map((g, i) => {
    const prevWordEnd = i > 0 ? groups[i - 1][groups[i - 1].length - 1].end : 0
    return Math.max(0, prevWordEnd, g[0].start - LEAD_IN_SEC)
  })
  return groups.map((g, i) => {
    const start = starts[i]
    const nextStart = starts[i + 1] ?? Infinity
    let end = Math.min(g[g.length - 1].end + END_PAD_SEC, nextStart)
    if (end - start < MIN_CUE_SEC) end = Math.min(start + MIN_CUE_SEC, nextStart)
    if (end <= start) end = start + 0.05
    return { start: r(start), end: r(end), text: joined(g) }
  })
}

export function cuesFromWords(input: TimedWord[]): WordCue[] {
  return timeGroups(groupWords(input))
}

// Bloques → texto SRT (numerados desde 1). Vacío si no hay bloques.
export function cuesToSrt(cues: WordCue[]): string {
  if (!cues.length) return ''
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join('\n\n') + '\n'
}

// ─── Completar lo que Whisper no escuchó (2026-11-23) ───────────────────────
// Whisper (Groq) da tiempos exactos pero a veces se saltea tramos enteros cuando hay
// música de fondo (en un video de 2:34 dejó huecos de 35 y 45 segundos). Gemini escucha
// todo pero con tiempos aproximados. fillGaps se queda con los bloques de Whisper y agrega
// los de Gemini que caen donde Whisper no puso nada:
//   · Un bloque de Gemini entra si menos del GAP_OVERLAP_MAX de su duración se pisa con
//     bloques de Whisper (si se pisa más, es lo mismo que Whisper ya escuchó).
//   · Tampoco entra si su texto ya está en los bloques de Whisper de al lado.
//   · Se recorta para que no pise a los de Whisper que tiene antes y después.
export const GAP_OVERLAP_MAX = 0.25
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function fillGaps(primary: WordCue[], backup: WordCue[]): { cues: WordCue[]; added: number } {
  const p = [...primary].sort((a, b) => a.start - b.start)
  const out: WordCue[] = [...p]
  let added = 0
  for (const b of backup) {
    const dur = b.end - b.start
    if (!(dur > 0) || !b.text.trim()) continue
    const overlap = p.reduce((s, c) => s + Math.max(0, Math.min(b.end, c.end) - Math.max(b.start, c.start)), 0)
    if (overlap / dur >= GAP_OVERLAP_MAX) continue
    const before = [...p].reverse().find(c => c.start <= b.start)
    const after = p.find(c => c.start > b.start)
    const near = norm([before?.text, after?.text].filter(Boolean).join(' '))
    const bt = norm(b.text)
    if (bt && near.includes(bt)) continue
    const start = Math.max(b.start, before ? before.end : 0)
    const end = Math.min(b.end, after ? after.start : Infinity)
    if (end - start < 0.3) continue
    out.push({ start, end, text: b.text.replace(/\s*\n\s*/g, ' ').trim() })
    added++
  }
  out.sort((a, b) => a.start - b.start)
  // Por las dudas: nada se pisa con el siguiente.
  for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i] = { ...out[i], end: out[i + 1].start }
  return { cues: out.filter(c => c.end > c.start), added }
}
