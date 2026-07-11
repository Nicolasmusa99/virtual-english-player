// PostHog events — Bloque G: phrase mutation events + bulk selection
// phrase_timestamps_edited, phrase_split, phrase_merged, phrase_added,
// phrase_deleted, phrases_bulk_selection
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { capture } from '@/lib/capture'

vi.mock('@/lib/capture', () => ({ capture: vi.fn() }))

// ─── helpers ────────────────────────────────────────────────────────────────

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_2 =
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n' +
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n'

async function loadIntoPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File(['fake-video-data'], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_2], 'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

function findLeafByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('*'))
    .find(el => el.textContent?.trim() === text && el.children.length === 0) as HTMLElement | undefined
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
  vi.mocked(capture).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_timestamps_edited
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_timestamps_edited', () => {
  it('fires with phrase_index + deltas when start and end change', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Open edit for phrase 0 (start=1s, end=3s)
    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    const startInput = container.querySelector('[aria-label="inicio"]') as HTMLInputElement
    const endInput   = container.querySelector('[aria-label="fin"]')   as HTMLInputElement
    // Change start 1s → 5s, end 3s → 8s: delta_start=+4, delta_end=+5
    await act(async () => {
      fireEvent.change(startInput, { target: { value: '0:05,000' } })
      fireEvent.change(endInput,   { target: { value: '0:08,000' } })
    })

    vi.mocked(capture).mockClear()

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_timestamps_edited', {
      phrase_index:  0,
      start_delta_s: 4,
      end_delta_s:   5,
    })
  })

  it('does NOT fire when only text is edited (timestamps unchanged)', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    // Change only the text — leave start/end inputs untouched
    const textInput = container.querySelector(
      'input:not([type="range"]):not([aria-label])'
    ) as HTMLInputElement
    await act(async () => {
      fireEvent.change(textInput, { target: { value: 'Texto nuevo' } })
    })

    vi.mocked(capture).mockClear()

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    const names = vi.mocked(capture).mock.calls.map(c => c[0])
    expect(names).not.toContain('phrase_timestamps_edited')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_split
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_split', () => {
  it('fires { phrase_index: 0, new_total: 3 } when splitting phrase 0 of 2', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Dividir"]')[0])
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_split', {
      phrase_index: 0,
      new_total:    3,
    })
  })

  it('fires { phrase_index: 1, new_total: 3 } when splitting phrase 1 of 2', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Dividir"]')[1])
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_split', {
      phrase_index: 1,
      new_total:    3,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_merged
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_merged', () => {
  it('fires { phrase_index: 0, new_total: 1 } when merging phrase 0 with next', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Unir con siguiente"]')[0])
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_merged', {
      phrase_index: 0,
      new_total:    1,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_added
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_added', () => {
  it('fires { at_time_s: 0, new_total: 3 } when adding a phrase at time=0', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    const addBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /agregar frase/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(addBtn!)
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_added', {
      at_time_s: 0,
      new_total:  3,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_deleted
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_deleted', () => {
  it('fires { phrase_index: 0, new_total: 1 } when deleting phrase 0 of 2', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Eliminar"]')[0])
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_deleted', {
      phrase_index: 0,
      new_total:    1,
    })
  })

  it('fires { phrase_index: 1, new_total: 1 } when deleting phrase 1 of 2', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Eliminar"]')[1])
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_deleted', {
      phrase_index: 1,
      new_total:    1,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrases_bulk_selection
// ══════════════════════════════════════════════════════════════════════════════

describe('phrases_bulk_selection', () => {
  function btn(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined
  }

  it('fires { action: "select_all", total: 2 } when clicking "Todas ✓"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    // Deselect first so select_all is meaningful
    await act(async () => { fireEvent.click(btn(container, 'Ninguna')!); await tick(30) })
    vi.mocked(capture).mockClear()

    await act(async () => { fireEvent.click(btn(container, 'Todas ✓')!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrases_bulk_selection', {
      action: 'select_all',
      total:  2,
    })
  })

  it('fires { action: "deselect_all", total: 2 } when clicking "Ninguna"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    await act(async () => { fireEvent.click(btn(container, 'Ninguna')!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrases_bulk_selection', {
      action: 'deselect_all',
      total:  2,
    })
  })
})
