import { describe, it, expect } from 'vitest'
import { parseSRT, timeToSec, fmtTime, splitPhrase, mergePhrase } from '@/lib/srt'

describe('parseSRT', () => {
  it('parses standard LF input', () => {
    const input = `1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:08,000\nSecond phrase`
    const result = parseSRT(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ start: 1, end: 4, text: 'Hello world', sel: true })
    expect(result[1]).toMatchObject({ start: 5, end: 8, text: 'Second phrase', sel: true })
  })

  it('parses CRLF line endings', () => {
    const input = `1\r\n00:00:01,000 --> 00:00:04,000\r\nHello CRLF\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nSecond`
    const result = parseSRT(input)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('Hello CRLF')
  })

  it('strips ```srt code fences added by Gemini', () => {
    const input = '```srt\n1\n00:00:01,000 --> 00:00:03,000\nFenced text\n```'
    const result = parseSRT(input)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Fenced text')
  })

  it('strips plain ``` code fences', () => {
    const input = '```\n1\n00:00:01,000 --> 00:00:03,000\nPlain fence\n```'
    const result = parseSRT(input)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Plain fence')
  })

  it('joins multi-line subtitle text with space', () => {
    const input = `1\n00:00:01,000 --> 00:00:04,000\nLine one\nLine two\nLine three`
    const result = parseSRT(input)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Line one Line two Line three')
  })

  it('accepts short MM:SS timestamps', () => {
    const input = `1\n01:00 --> 03:30\nShort timestamp`
    const result = parseSRT(input)
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(60)
    expect(result[0].end).toBe(210)
  })

  it('returns empty array for empty string', () => {
    expect(parseSRT('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parseSRT('   \n\n\t\n  ')).toEqual([])
  })

  it('skips malformed blocks without a timestamp line', () => {
    const input = `not a valid block\n\n1\n00:00:01,000 --> 00:00:03,000\nValid block`
    const result = parseSRT(input)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Valid block')
  })

  it('handles mixed valid and broken blocks', () => {
    const input = [
      '1\n00:00:01,000 --> 00:00:03,000\nGood one',
      'broken block no timestamp',
      '2\n00:00:05,000 --> 00:00:07,000\nGood two',
      '\n\n',
      '3\n00:00:09,000 --> 00:00:11,000\nGood three',
    ].join('\n\n')
    const result = parseSRT(input)
    expect(result).toHaveLength(3)
    expect(result.map(p => p.text)).toEqual(['Good one', 'Good two', 'Good three'])
  })

  it('strips HTML tags from subtitle text', () => {
    const input = `1\n00:00:01,000 --> 00:00:03,000\n<i>Italic text</i>`
    const result = parseSRT(input)
    expect(result[0].text).toBe('Italic text')
  })

  it('sets sel: true on all parsed phrases', () => {
    const input = `1\n00:00:01,000 --> 00:00:03,000\nPhrase`
    const result = parseSRT(input)
    expect(result[0].sel).toBe(true)
  })
})

describe('timeToSec', () => {
  it('converts HH:MM:SS,mmm format', () => {
    expect(timeToSec('00:01:30,500')).toBeCloseTo(90.5)
  })

  it('converts MM:SS format', () => {
    expect(timeToSec('02:30')).toBe(150)
  })

  it('handles comma as decimal separator', () => {
    expect(timeToSec('00:00:02,750')).toBeCloseTo(2.75)
  })
})

describe('fmtTime', () => {
  it('formats seconds to M:SS', () => {
    expect(fmtTime(90)).toBe('1:30')
    expect(fmtTime(65)).toBe('1:05')
    expect(fmtTime(0)).toBe('0:00')
  })

  it('returns 0:00 for NaN', () => {
    expect(fmtTime(NaN)).toBe('0:00')
  })

  it('returns 0:00 for negative values', () => {
    expect(fmtTime(-5)).toBe('0:00')
  })
})

// ── US-031: splitPhrase y mergePhrase ────────────────────────────────────────

import type { Phrase } from '@/lib/srt'

describe('splitPhrase', () => {
  // TC-073a: split proporcional — rango [0,10], texto "AAAAA BBBBB" (11 chars), offset=5
  // A="AAAAA" (5 chars), B="BBBBB" (5 chars após trimStart del espacio en pos 5)
  // end_A = 0 + 10 * (5/11) ≈ 4.545..., start_B = end_A
  it('TC-073a: split proporcional — [0,10] "AAAAA BBBBB" en offset 5', () => {
    const p: Phrase = { start: 0, end: 10, text: 'AAAAA BBBBB', sel: true }
    const [a, b] = splitPhrase(p, 5)
    expect(a.text).toBe('AAAAA')
    expect(b.text).toBe('BBBBB')
    expect(a.start).toBe(0)
    expect(b.end).toBe(10)
    expect(a.end).toBeCloseTo(10 * 5 / 11, 5)
    expect(b.start).toBe(a.end)
    expect(a.sel).toBe(true)
    expect(b.sel).toBe(true)
  })

  // TC-073b: trimStart en parte B — offset en el espacio de "Hello world"
  it('TC-073b: parte B aplica trimStart al texto desde el offset', () => {
    const p: Phrase = { start: 0, end: 10, text: 'Hello world', sel: false }
    const [a, b] = splitPhrase(p, 5)   // A="Hello", B=" world".trimStart()="world"
    expect(a.text).toBe('Hello')
    expect(b.text).toBe('world')
    expect(a.sel).toBe(false)
    expect(b.sel).toBe(false)
  })

  // TC-073c: sel heredado en ambas partes
  it('TC-073c: sel de la frase original se hereda en ambas mitades', () => {
    const p: Phrase = { start: 0, end: 6, text: 'AB CD', sel: true }
    const [a, b] = splitPhrase(p, 2)
    expect(a.sel).toBe(true)
    expect(b.sel).toBe(true)
  })

  // TC-073d: offset inválido — 0 lanza RangeError
  it('TC-073d: offset 0 lanza RangeError', () => {
    const p: Phrase = { start: 0, end: 5, text: 'Hello', sel: false }
    expect(() => splitPhrase(p, 0)).toThrow(RangeError)
  })

  // TC-073e: offset >= text.length lanza RangeError
  it('TC-073e: offset >= text.length lanza RangeError', () => {
    const p: Phrase = { start: 0, end: 5, text: 'Hello', sel: false }
    expect(() => splitPhrase(p, 5)).toThrow(RangeError)
    expect(() => splitPhrase(p, 6)).toThrow(RangeError)
  })

  // TC-073f: start distinto de 0 — splitAt usa phrase.start como base
  it('TC-073f: phrase con start=10, end=20, texto 10 chars, offset=5 → splitAt=15', () => {
    const p: Phrase = { start: 10, end: 20, text: 'AAAAAAAAAA', sel: false }
    const [a, b] = splitPhrase(p, 5)
    expect(a.start).toBe(10)
    expect(a.end).toBe(15)
    expect(b.start).toBe(15)
    expect(b.end).toBe(20)
  })
})

describe('mergePhrase', () => {
  // TC-074a: merge básico — textos con espacio, rango completo
  it('TC-074a: merge — texto concatenado con espacio, start/end del par completo', () => {
    const a: Phrase = { start: 0, end: 4, text: 'Hello', sel: false }
    const b: Phrase = { start: 4, end: 8, text: 'world', sel: false }
    const m = mergePhrase(a, b)
    expect(m.text).toBe('Hello world')
    expect(m.start).toBe(0)
    expect(m.end).toBe(8)
    expect(m.sel).toBe(false)
  })

  // TC-074b: sel=true si cualquiera lo estaba (a=true, b=false)
  it('TC-074b: sel=true si cualquiera de los dos tiene sel=true', () => {
    const a: Phrase = { start: 0, end: 4, text: 'Hello', sel: true }
    const b: Phrase = { start: 4, end: 8, text: 'world', sel: false }
    expect(mergePhrase(a, b).sel).toBe(true)
    expect(mergePhrase(b, a).sel).toBe(true)
  })

  // TC-074c: ambos sel=false → sel=false
  it('TC-074c: ambos sel=false → resultado sel=false', () => {
    const a: Phrase = { start: 0, end: 4, text: 'A', sel: false }
    const b: Phrase = { start: 4, end: 8, text: 'B', sel: false }
    expect(mergePhrase(a, b).sel).toBe(false)
  })

  // TC-074d: merge preserva start de a y end de b
  it('TC-074d: merge toma start de a y end de b independientemente de sus valores', () => {
    const a: Phrase = { start: 2.5, end: 5.0, text: 'First', sel: false }
    const b: Phrase = { start: 5.0, end: 9.3, text: 'Second', sel: false }
    const m = mergePhrase(a, b)
    expect(m.start).toBe(2.5)
    expect(m.end).toBe(9.3)
  })
})
