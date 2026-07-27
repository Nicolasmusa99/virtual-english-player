// TC-136: Player sends load_phrases after exercises window sends ready
// TC-137: Window renders ExercisesPanel after receiving load_phrases
// TC-138: Window continues to work after player closes channel
// TC-139: Waiting state has no generate button before receiving phrases
// TC-140: Player exercises tab shows hint when exercises window is open
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import ExercisesWindow from '@/app/exercises-window/page'
import Player from '@/app/page'
import { ExercisesChannel } from '@/lib/exercisesChannel'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'

function tick(ms = 0) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_3 = [
  '1\n00:00:01,000 --> 00:00:03,000\nHello world\n',
  '2\n00:00:04,000 --> 00:00:06,000\nWe practice daily\n',
  '3\n00:00:07,000 --> 00:00:09,000\nExcuse me please\n',
].join('\n')

function mockFetch(data: object = FAKE_EXERCISES, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300, status,
    json: async () => data,
  } as Response)
}

async function loadPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File(['fake'], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_3], 'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

// ── TC-139 ─────────────────────────────────────────────────────────────────

describe('TC-139 — waiting state has no generate button', () => {
  it('shows waiting state without generate button before load_phrases', () => {
    const { container } = render(<ExercisesWindow />)
    expect(container.querySelector('[data-testid="exercises-waiting"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="btn-generate"]')).toBeNull()
  })
})

// ── TC-137 ─────────────────────────────────────────────────────────────────

describe('TC-137 — window renders ExercisesPanel after receiving load_phrases', () => {
  afterEach(() => vi.restoreAllMocks())

  it('transitions from waiting to exercises panel on load_phrases', async () => {
    const { container } = render(<ExercisesWindow />)
    await act(async () => { await tick(50) }) // let useEffect run

    expect(container.querySelector('[data-testid="exercises-waiting"]')).not.toBeNull()

    const sender = new ExercisesChannel()
    await act(async () => {
      sender.send({ type: 'load_phrases', phrases: ['Hello world', 'How are you'], level: 'intermediate', fileName: 'lesson.mp4', scope: 'all' })
      await tick(50)
    })

    expect(container.querySelector('[data-testid="exercises-waiting"]')).toBeNull()
    expect(container.querySelector('[data-testid="btn-generate"]')).not.toBeNull()

    sender.close()
  })
})

// ── TC-138 ─────────────────────────────────────────────────────────────────

describe('TC-138 — window works independently after player closes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps generate button and can generate after receiving close command', async () => {
    mockFetch()
    const { container } = render(<ExercisesWindow />)
    await act(async () => { await tick(50) })

    const sender = new ExercisesChannel()

    await act(async () => {
      sender.send({ type: 'load_phrases', phrases: ['Hello world'], level: 'intermediate', fileName: 'lesson.mp4', scope: 'all' })
      await tick(50)
    })

    // simulate player closing
    await act(async () => {
      sender.send({ type: 'close' })
      await tick(50)
    })

    const genBtn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
    expect(genBtn).not.toBeNull()

    await act(async () => { fireEvent.click(genBtn); await tick(100) })
    expect(container.querySelector('[data-testid="tab-quiz"]')).not.toBeNull()

    sender.close()
  })
})

// ── TC-136 ─────────────────────────────────────────────────────────────────

describe('TC-136 — player sends load_phrases after window ready', () => {
  afterEach(() => vi.restoreAllMocks())

  it('responds to ready with load_phrases containing all phrases', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container) // loads 3 phrases

    vi.spyOn(window, 'open').mockReturnValue(null)

    const receiver = new ExercisesChannel()
    const received: unknown[] = []
    receiver.onMessage(msg => received.push(msg))

    const openBtn = container.querySelector('[data-testid="btn-open-exercises"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(openBtn); await tick(50) })

    // simulate exercises window sending 'ready'
    await act(async () => { receiver.send({ type: 'ready' }); await tick(50) })

    const loadMsg = received.find((m: any) => m.type === 'load_phrases') as any
    expect(loadMsg).toBeDefined()
    expect(loadMsg.phrases).toHaveLength(3)
    expect(loadMsg.fileName).toBe('test.mp4')

    receiver.close()
  })
})

// ── TC-140 ─────────────────────────────────────────────────────────────────

describe('TC-140 — player exercises tab shows hint when window open', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows redirect hint instead of ExercisesPanel when exercises window is open', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)

    vi.spyOn(window, 'open').mockReturnValue(null)

    const openBtn = container.querySelector('[data-testid="btn-open-exercises"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(openBtn); await tick(50) })

    const exercisesTab = container.querySelector('[data-testid="tab-exercises"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(exercisesTab); await tick(50) })

    expect(container.querySelector('[data-testid="exercises-open-hint"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="btn-generate"]')).toBeNull()
  })
})
