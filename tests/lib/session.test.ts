import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionKey, saveSession, loadSession } from '@/lib/session'
import type { SessionData } from '@/lib/session'

const SAMPLE: SessionData = {
  phrases: [
    { start: 0, end: 2, text: 'Hello world', sel: false },
    { start: 3, end: 5, text: 'Second phrase', sel: true },
  ],
  delay: 0.5,
  speedIdx: 3,
  ccOn: false,
  filter: 'sel',
}

describe('lib/session', () => {
  beforeEach(() => localStorage.clear())

  it('sessionKey returns ve-session:{fileName}:{fileSize}', () => {
    expect(sessionKey('lecture.mp4', 12345)).toBe('ve-session:lecture.mp4:12345')
  })

  it('saveSession + loadSession round-trip preserves all fields', () => {
    const key = sessionKey('video.mp4', 100)
    saveSession(key, SAMPLE)
    const loaded = loadSession(key)
    expect(loaded).toEqual(SAMPLE)
  })

  it('loadSession returns null for unknown key', () => {
    expect(loadSession('ve-session:missing.mp4:0')).toBeNull()
  })

  it('loadSession returns null for malformed JSON', () => {
    localStorage.setItem('ve-session:bad:0', 'not-json{{{')
    expect(loadSession('ve-session:bad:0')).toBeNull()
  })

  it('saveSession silently swallows localStorage errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveSession('some-key', SAMPLE)).not.toThrow()
    spy.mockRestore()
  })
})
