import { describe, it, expect } from 'vitest'
import { cleanSrt, parseSRT, tidyCues, CUE_MAX_CHARS } from '@/lib/srt'

const LONG = 'After some time adjusting to the blinding light, the freed prisoner will begin to experience the world outside of the cave for the very first time.'

describe('tidyCues (subtítulos de Gemini más prolijos)', () => {
  it('corta un bloque largo en pedazos cortos, en la coma, con el tiempo repartido', () => {
    const out = tidyCues([{ start: 10, end: 19, text: LONG }])
    expect(out.length).toBeGreaterThan(1)
    for (const c of out) expect(c.text.length).toBeLessThanOrEqual(CUE_MAX_CHARS)
    expect(out[0].text).toBe('After some time adjusting to the blinding light,')
    expect(out.map(c => c.text).join(' ')).toBe(LONG) // no se pierde ni se inventa texto
    expect(out[0].start).toBe(10)
    expect(out[out.length - 1].end).toBe(19)
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBe(out[i - 1].end)
  })
  it('deja como están los bloques cortos', () => {
    const c = [{ start: 1, end: 3, text: 'Hello there.' }]
    expect(tidyCues(c)).toEqual(c)
  })
  it('recorta un bloque que se pisa con el siguiente', () => {
    const out = tidyCues([{ start: 1, end: 5, text: 'One two.' }, { start: 4, end: 6, text: 'Three.' }])
    expect(out[0].end).toBe(4)
  })
  it('no deja una frase corta en pantalla durante un silencio largo', () => {
    const out = tidyCues([{ start: 0, end: 20, text: 'Okay.' }])
    expect(out[0].end).toBe(5)
  })
  it('cleanSrt con tidy devuelve SRT válido y renumerado', () => {
    const raw = `1\n00:00:10,000 --> 00:00:19,000\n${LONG}\n\n2\n00:00:19,500 --> 00:00:21,000\nYes.\n`
    const out = cleanSrt(raw, { tidy: true })
    const ps = parseSRT(out.srt)
    expect(ps.length).toBe(out.phrases)
    expect(ps.length).toBeGreaterThan(2)
    expect(ps[ps.length - 1].text).toBe('Yes.')
    expect(out.srt.startsWith('1\n00:00:10,000 --> ')).toBe(true)
  })
  it('sin tidy, cleanSrt no cambia nada (como antes)', () => {
    const raw = `1\n00:00:10,000 --> 00:00:19,000\n${LONG}\n`
    expect(cleanSrt(raw).phrases).toBe(1)
  })
})

describe('tidyPhrases ("Ordenar subtítulos" sobre lo ya cargado)', () => {
  it('corta las largas y cada pedazo conserva si su frase estaba elegida', async () => {
    const { tidyPhrases } = await import('@/lib/srt')
    const out = tidyPhrases([
      { start: 10, end: 19, text: LONG, sel: true },
      { start: 19.5, end: 21, text: 'Yes.', sel: false },
    ])
    expect(out.length).toBe(4)
    expect(out.slice(0, 3).every(p => p.sel)).toBe(true)
    expect(out[3]).toEqual({ start: 19.5, end: 21, text: 'Yes.', sel: false })
  })
  it('si ya está todo bien, devuelve lo mismo', async () => {
    const { tidyPhrases } = await import('@/lib/srt')
    const ps = [{ start: 1, end: 3, text: 'Hello there.', sel: false }]
    expect(tidyPhrases(ps)).toEqual(ps)
  })
})
