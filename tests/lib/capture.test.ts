import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { capture } from '@/lib/capture'

describe('capture()', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__ve_posthog
  })
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__ve_posthog
  })

  it('no-op cuando __ve_posthog no está definido', () => {
    expect(() => capture('test_event', { foo: 'bar' })).not.toThrow()
  })

  it('llama __ve_posthog.capture con event y props', () => {
    const mockCapture = vi.fn()
    ;(window as unknown as Record<string, unknown>).__ve_posthog = { capture: mockCapture }
    capture('test_event', { foo: 'bar' })
    expect(mockCapture).toHaveBeenCalledOnce()
    expect(mockCapture).toHaveBeenCalledWith('test_event', { foo: 'bar' })
  })

  it('llama __ve_posthog.capture sin props (undefined)', () => {
    const mockCapture = vi.fn()
    ;(window as unknown as Record<string, unknown>).__ve_posthog = { capture: mockCapture }
    capture('test_event')
    expect(mockCapture).toHaveBeenCalledWith('test_event', undefined)
  })

  it('traga excepciones lanzadas por __ve_posthog sin romper el caller', () => {
    ;(window as unknown as Record<string, unknown>).__ve_posthog = {
      capture: () => { throw new Error('posthog boom') }
    }
    expect(() => capture('test_event')).not.toThrow()
  })

  it('no llama capture si __ve_posthog fue eliminado entre init e invocación', () => {
    const mockCapture = vi.fn()
    ;(window as unknown as Record<string, unknown>).__ve_posthog = { capture: mockCapture }
    delete (window as unknown as Record<string, unknown>).__ve_posthog
    capture('test_event')
    expect(mockCapture).not.toHaveBeenCalled()
  })
})
