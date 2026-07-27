// TC-134: Standalone exercises section generates without video (topic-only)
// TC-135: Player exercises tab no longer shows topic mode button (singleMode="video")
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import ExercisesPanel from '@/app/ExercisesPanel'
import Player from '@/app/page'
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

// ── TC-134: Standalone exercises section (topic-only, no video) ─────────────

describe('TC-134 — exercises section generates without video', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mode selector hidden and topic input visible when singleMode="topic"', () => {
    const { container } = render(
      <ExercisesPanel phrases={[]} videoFileName="" singleMode="topic" />
    )
    // mode selector should be hidden (singleMode set)
    expect(container.querySelector('[data-testid="mode-video"]')).toBeNull()
    expect(container.querySelector('[data-testid="mode-topic"]')).toBeNull()
    expect(container.querySelector('[data-testid="mode-both"]')).toBeNull()

    // topic input is visible
    expect(container.querySelector('[data-testid="topic-input"]')).not.toBeNull()
  })

  it('generate button disabled until topic typed', async () => {
    const { container } = render(
      <ExercisesPanel phrases={[]} videoFileName="" singleMode="topic" />
    )
    const genBtn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
    expect(genBtn.disabled).toBe(true)

    const topicInput = container.querySelector('[data-testid="topic-input"]') as HTMLInputElement
    await act(async () => { fireEvent.change(topicInput, { target: { value: 'World War II' } }) })
    expect(genBtn.disabled).toBe(false)
  })

  it('calls /api/exercises and shows exercises after generate', async () => {
    mockFetch()
    const { container } = render(
      <ExercisesPanel phrases={[]} videoFileName="" singleMode="topic" />
    )
    const topicInput = container.querySelector('[data-testid="topic-input"]') as HTMLInputElement
    await act(async () => { fireEvent.change(topicInput, { target: { value: 'Space exploration' } }) })

    const genBtn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(genBtn); await tick(100) })

    expect(container.querySelector('[data-testid="tab-quiz"]')).not.toBeNull()
  })
})

// ── TC-135: Player exercises tab has no topic mode button ───────────────────

describe('TC-135 — player exercises tab has no topic mode button', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mode-topic button is absent when player exercises tab is opened', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)

    const exercisesTab = container.querySelector('[data-testid="tab-exercises"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(exercisesTab); await tick(50) })

    expect(container.querySelector('[data-testid="mode-topic"]')).toBeNull()
    expect(container.querySelector('[data-testid="mode-video"]')).toBeNull()
    expect(container.querySelector('[data-testid="mode-both"]')).toBeNull()
  })
})
