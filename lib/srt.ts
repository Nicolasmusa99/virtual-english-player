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
