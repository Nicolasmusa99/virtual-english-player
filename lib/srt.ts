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
  const textA    = phrase.text.slice(0, charOffset)
  const textB    = phrase.text.slice(charOffset).trimStart()
  return [
    { start: phrase.start, end: splitAt,    text: textA, sel: phrase.sel },
    { start: splitAt,      end: phrase.end, text: textB, sel: phrase.sel },
  ]
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
export function cleanSrt(text: string, opts: { dropLast?: boolean } = {}): { srt: string; phrases: number; dropped: number } {
  const all = parseSRT(text)
  let ok = all.filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start)
    .sort((a, b) => a.start - b.start)
  if (opts.dropLast && ok.length > 0) ok = ok.slice(0, -1)
  const srt = ok.map((p, i) => `${i + 1}\n${srtTime(p.start)} --> ${srtTime(p.end)}\n${p.text}`).join('\n\n')
  return { srt: ok.length ? srt + '\n' : '', phrases: ok.length, dropped: all.length - ok.length }
}

// Mensaje cuando Gemini no devolvió ningún bloque usable.
export const TRANSCRIPT_EMPTY_ERROR = 'La transcripción salió vacía o mal formada, probá de nuevo.'
