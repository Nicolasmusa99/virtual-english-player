import { describe, it, expect } from 'vitest'
import { resolveScope } from '@/lib/exercises'
import type { Phrase } from '@/lib/srt'

const p = (text: string, sel: boolean): Phrase => ({ start: 0, end: 1, text, sel })

describe('resolveScope', () => {
  it('scope=all → returns all phrases regardless of sel', () => {
    const phrases = [p('a', true), p('b', false), p('c', true)]
    expect(resolveScope(phrases, 'all')).toEqual(phrases)
  })

  it('scope=sel with selected phrases → returns only selected', () => {
    const phrases = [p('a', true), p('b', false), p('c', true)]
    const result  = resolveScope(phrases, 'sel')
    expect(result).toHaveLength(2)
    expect(result.every(r => r.sel)).toBe(true)
  })

  it('scope=sel with NO selected phrases → falls back to all', () => {
    const phrases = [p('a', false), p('b', false), p('c', false)]
    const result  = resolveScope(phrases, 'sel')
    expect(result).toEqual(phrases)
  })

  it('scope=sel — fallback preserves original array reference', () => {
    const phrases = [p('a', false)]
    expect(resolveScope(phrases, 'sel')).toBe(phrases)
  })

  it('scope=sel with empty array → returns empty array', () => {
    expect(resolveScope([], 'sel')).toEqual([])
  })

  it('scope=all with empty array → returns empty array', () => {
    expect(resolveScope([], 'all')).toEqual([])
  })

  it('scope=sel selects only the marked phrases among a mixed set', () => {
    const phrases = [p('one', false), p('two', true), p('three', false), p('four', true)]
    const result  = resolveScope(phrases, 'sel')
    expect(result.map(r => r.text)).toEqual(['two', 'four'])
  })
})
