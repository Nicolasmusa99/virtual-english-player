// La IA elige los cortes (lib/subtitleAi.ts), con un fetch falso de Gemini.
import { describe, it, expect, vi } from 'vitest'
import { aiCues, groupsFromStarts, segmentPrompt, titleFromBlobUrl, validStarts } from '@/lib/subtitleAi'
import { WORD_CUE_MAX_CHARS, type TimedWord } from '@/lib/wordCues'

function say(text: string, t0 = 0, dur = 0.3, gap = 0.02): TimedWord[] {
  let t = t0
  return text.split(' ').map(w => { const o = { text: w, start: t, end: t + dur }; t += dur + gap; return o })
}
const gemini = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(
  status === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] } : body), { status }))

const CAVE = [...say('And it is like nothing he', 95), ...say('could have ever imagined.', 97.9), ...say('With his new perception of the world,', 110)]

describe('aiCues', () => {
  it('usa los cortes que elige Gemini y los tiempos exactos de las palabras', async () => {
    const f = gemini({ starts: [0, 10] })
    const { cues, byAi } = await aiCues(CAVE, 'K', f as unknown as typeof fetch)
    expect(byAi).toBe(true)
    expect(cues.map(c => c.text)).toEqual(['And it is like nothing he could have ever imagined.', 'With his new perception of the world,'])
    expect(cues[1].start).toBeCloseTo(110 - 0.2, 3)
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.contents[0].parts[0].text).toContain('5 he')
  })

  it('si Gemini devuelve cortes inválidos, quedan los cortes por reglas', async () => {
    for (const bad of [{ starts: [1, 4] }, { starts: [0, 4, 3] }, { starts: [0, 99] }, { nope: true }]) {
      const { cues, byAi } = await aiCues(CAVE, 'K', gemini(bad) as unknown as typeof fetch)
      expect(byAi).toBe(false)
      expect(cues.length).toBeGreaterThan(0)
    }
  })

  it('si Gemini falla, quedan los cortes por reglas', async () => {
    const { byAi } = await aiCues(CAVE, 'K', gemini({ error: 'x' }, 500) as unknown as typeof fetch)
    expect(byAi).toBe(false)
  })

  it('un bloque demasiado largo que elija Gemini se vuelve a cortar', () => {
    const ws = say('So I told my brother that we should probably leave early because the traffic on the highway is always terrible')
    const groups = groupsFromStarts(ws, [0])
    expect(groups.length).toBeGreaterThan(1)
    for (const g of groups) expect(g.map(w => w.text).join(' ').length).toBeLessThanOrEqual(WORD_CUE_MAX_CHARS)
  })
})

describe('segmentPrompt / validStarts / titleFromBlobUrl', () => {
  it('marca las pausas entre palabras', () => {
    const p = segmentPrompt(CAVE)
    expect(p).toMatch(/\(pause 1\.0s\)\n6 could/)
    expect(p).toMatch(/\(pause 1[0-9]\.\ds\)\n10 With/)
  })
  it('valida los índices', () => {
    expect(validStarts([0, 3, 5], 6)).toEqual([0, 3, 5])
    expect(validStarts([0, 3, 3], 6)).toBeNull()
    expect(validStarts([0, 1.5], 6)).toBeNull()
    expect(validStarts('x', 6)).toBeNull()
  })
  it('saca un título limpio de la URL de Blob', () => {
    expect(titleFromBlobUrl('https://abc.public.blob.vercel-storage.com/videos/12/PLATOS_ALLEGORY_-_The_Cave_video-converter.com.mp4'))
      .toBe('PLATOS ALLEGORY, The Cave')
    expect(titleFromBlobUrl('no es una url')).toBe('')
  })
})
