import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import ExercisesPanel from '@/app/ExercisesPanel'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'
import type { Phrase } from '@/lib/srt'

// ── jsPDF mock (for TC-117) ─────────────────────────────────────────────────
const mockSave = vi.hoisted(() => vi.fn())
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function() {
    return {
      setFont: vi.fn(), setFontSize: vi.fn(),
      text: vi.fn(), addPage: vi.fn(), splitTextToSize: vi.fn(() => []),
      internal: { pageSize: { height: 297, width: 210 } },
      save: mockSave,
    }
  }),
}))

function tick(ms = 0) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_3 = [
  '1\n00:00:01,000 --> 00:00:03,000\nHello world\n',
  '2\n00:00:04,000 --> 00:00:06,000\nWe practice daily\n',
  '3\n00:00:07,000 --> 00:00:09,000\nExcuse me please\n',
].join('\n')

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

function mockFetch(data: object = FAKE_EXERCISES, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300, status,
    json: async () => data,
  } as Response)
}

async function openExercisesTab(container: HTMLElement) {
  const tab = container.querySelector('[data-testid="tab-exercises"]') as HTMLButtonElement
  await act(async () => { fireEvent.click(tab); await tick(50) })
}

async function generateAndReady(container: HTMLElement) {
  mockFetch()
  await loadPlayer(container)
  await openExercisesTab(container)
  const btn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
  await act(async () => { fireEvent.click(btn); await tick(100) })
}

// ── TC-113: default mode ────────────────────────────────────────────────────

describe('TC-113 — default source mode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('default mode is "video" when phrases are provided', () => {
    const phrases: Phrase[] = [
      { start: 0, end: 1, text: 'Hello', sel: false },
      { start: 1, end: 2, text: 'World', sel: false },
    ]
    const { container } = render(
      <ExercisesPanel phrases={phrases} videoFileName="test.mp4" />
    )
    const videoBtn = container.querySelector('[data-testid="mode-video"]') as HTMLButtonElement
    expect(videoBtn).not.toBeNull()
    expect(videoBtn.getAttribute('data-active')).toBe('true')
  })

  it('default mode is "topic" when phrases array is empty', () => {
    const { container } = render(
      <ExercisesPanel phrases={[]} videoFileName="" />
    )
    const topicBtn = container.querySelector('[data-testid="mode-topic"]') as HTMLButtonElement
    expect(topicBtn).not.toBeNull()
    expect(topicBtn.getAttribute('data-active')).toBe('true')
  })
})

// ── TC-112: generate disabled when topic empty ──────────────────────────────

describe('TC-112 — generate disabled when topic empty', () => {
  afterEach(() => vi.restoreAllMocks())

  it('switching to topic mode and leaving topic empty disables generate button', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)

    // switch to topic mode
    const topicModeBtn = container.querySelector('[data-testid="mode-topic"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(topicModeBtn) })

    // topic input should be empty → generate disabled
    const genBtn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
    expect(genBtn.disabled).toBe(true)
  })

  it('typing a topic enables the generate button', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)

    const topicModeBtn = container.querySelector('[data-testid="mode-topic"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(topicModeBtn) })

    const topicInput = container.querySelector('[data-testid="topic-input"]') as HTMLInputElement
    await act(async () => { fireEvent.change(topicInput, { target: { value: 'Grammar' } }) })

    const genBtn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
    expect(genBtn.disabled).toBe(false)
  })
})

// ── TC-114: PDF panel — no types selected → download disabled ───────────────

describe('TC-114 — PDF download panel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('PDF button appears when exercises are ready', async () => {
    const { container } = render(<Player />)
    await generateAndReady(container)
    expect(container.querySelector('[data-testid="btn-pdf"]')).not.toBeNull()
  })

  it('clicking PDF button opens the download panel', async () => {
    const { container } = render(<Player />)
    await generateAndReady(container)
    const pdfBtn = container.querySelector('[data-testid="btn-pdf"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(pdfBtn) })
    expect(container.querySelector('[data-testid="pdf-panel"]')).not.toBeNull()
  })

  it('TC-114: all types unchecked → confirm download button disabled', async () => {
    const { container } = render(<Player />)
    await generateAndReady(container)

    // open PDF panel
    const pdfBtn = container.querySelector('[data-testid="btn-pdf"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(pdfBtn) })

    // uncheck all types
    for (const type of ['quiz', 'cloze', 'match']) {
      const cb = container.querySelector(`[data-testid="pdf-type-${type}"]`) as HTMLInputElement
      if (cb?.checked) await act(async () => { fireEvent.click(cb) })
    }

    const confirmBtn = container.querySelector('[data-testid="btn-pdf-confirm"]') as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })
})

// ── TC-117: "both" → two separate files, no extra model call ────────────────

describe('TC-117 — PDF download: "both" → two separate files', () => {
  afterEach(() => { vi.restoreAllMocks(); mockSave.mockClear() })

  it('selecting "both" and confirming calls jsPDF.save() twice with distinct names', async () => {
    const { container } = render(<Player />)
    await generateAndReady(container)

    const pdfBtn = container.querySelector('[data-testid="btn-pdf"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(pdfBtn) })

    // select version "both"
    const bothRadio = container.querySelector('[data-testid="pdf-version-both"]') as HTMLInputElement
    await act(async () => { fireEvent.click(bothRadio) })

    // restore fetch so we can spy cleanly — no more mocked responses needed
    vi.restoreAllMocks()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const confirmBtn = container.querySelector('[data-testid="btn-pdf-confirm"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(confirmBtn); await tick(100) })

    // two saves
    expect(mockSave).toHaveBeenCalledTimes(2)
    const names = mockSave.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(names).toContain('ejercicios-alumno.pdf')
    expect(names).toContain('ejercicios-profesor.pdf')

    // no new fetch to /api/exercises
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
