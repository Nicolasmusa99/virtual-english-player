// Player del profe (P1) — funciones puras de la barra de tiempo (lib/playerTimeline.ts).
import { describe, it, expect } from 'vitest'
import type { Phrase } from '@/lib/srt'
import { phraseSegments, phraseIndexAt, selNumber, extrapolateTime, MAX_EXTRAPOLATE_S } from '@/lib/playerTimeline'

const P: Phrase[] = [
  { start: 1, end: 3, text: 'uno', sel: true },
  { start: 4, end: 6, text: 'dos', sel: false },
  { start: 7, end: 12, text: 'tres', sel: true },
]

describe('phraseSegments', () => {
  it('tramos en % del video, con la marca de elegida', () => {
    expect(phraseSegments(P, 20)).toEqual([
      { idx: 0, left: 5, width: 10, sel: true },
      { idx: 1, left: 20, width: 10, sel: false },
      { idx: 2, left: 35, width: 25, sel: true },
    ])
  })
  it('sin duración conocida no hay tramos', () => {
    expect(phraseSegments(P, 0)).toEqual([])
    expect(phraseSegments(P, NaN)).toEqual([])
  })
  it('una frase que se pasa del final queda recortada al 100%', () => {
    const [s] = phraseSegments([{ start: 8, end: 30, text: 'x', sel: false }], 10)
    expect(s.left).toBe(80)
    expect(s.width).toBe(20)
  })
})

describe('phraseIndexAt', () => {
  it('encuentra la frase del segundo pedido, respetando el delay de subtítulos', () => {
    expect(phraseIndexAt(P, 2, 0)).toBe(0)
    expect(phraseIndexAt(P, 3.5, 0)).toBe(-1)
    expect(phraseIndexAt(P, 5.5, 1.5)).toBe(1) // 5.5 - 1.5 = 4 → "dos"
  })
})

describe('selNumber', () => {
  it('número dentro de las elegidas, o null si no está elegida', () => {
    expect(selNumber(P, 0)).toBe(1)
    expect(selNumber(P, 1)).toBeNull()
    expect(selNumber(P, 2)).toBe(2)
    expect(selNumber(P, 9)).toBeNull()
  })
})

describe('extrapolateTime (stage abierto)', () => {
  const base = { t: 10, at: 1000, playing: true, rate: 1, duration: 60 }
  it('en pausa: el último tiempo tal cual', () => {
    expect(extrapolateTime({ ...base, playing: false }, 5000)).toBe(10)
  })
  it('reproduciendo: avanza lo que pasó, a la velocidad elegida', () => {
    expect(extrapolateTime(base, 1250)).toBeCloseTo(10.25, 6)
    expect(extrapolateTime({ ...base, rate: 0.5 }, 1500)).toBeCloseTo(10.25, 6)
  })
  it('nunca más del margen (si el stage se colgó) ni más allá del final', () => {
    expect(extrapolateTime(base, 60_000)).toBeCloseTo(10 + MAX_EXTRAPOLATE_S, 6)
    expect(extrapolateTime({ ...base, t: 59.8 }, 2000)).toBe(60)
  })
  it('un reloj que va para atrás no resta', () => {
    expect(extrapolateTime(base, 500)).toBe(10)
  })
})
