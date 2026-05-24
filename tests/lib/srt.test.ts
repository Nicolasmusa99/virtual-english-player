import { describe, it, expect } from 'vitest'
import { parseSRT, timeToSec, fmtTime } from '@/lib/srt'

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
