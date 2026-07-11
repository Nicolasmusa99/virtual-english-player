// PostHog events — Bloque G: mode toggles + auto-triggers
// autopause_toggled, autopause_triggered, practice_mode_toggled,
// practice_mode_completed, phrase_loop_changed, text_visibility_toggled
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { capture } from '@/lib/capture'
import { StageChannel } from '@/lib/stageChannel'
import { sessionKey, saveSession } from '@/lib/session'
import type { SessionData } from '@/lib/session'

vi.mock('@/lib/capture', () => ({ capture: vi.fn() }))

// ─── helpers ────────────────────────────────────────────────────────────────

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_4 = [
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n',
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n',
  '3\n00:00:07,000 --> 00:00:09,000\nPhrase three\n',
  '4\n00:00:10,000 --> 00:00:12,000\nPhrase four\n',
].join('\n')

const FILE_CONTENT = 'fake-video-data'

async function loadIntoPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_4],        'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

// p0(sel=true), p1(sel=false), p2(sel=true), p3(sel=false)
async function loadPlayerWithSelection(container: HTMLElement) {
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const sessData: SessionData = {
    phrases: [
      { start: 1,  end: 3,  text: 'Phrase one',   sel: true  },
      { start: 4,  end: 6,  text: 'Phrase two',   sel: false },
      { start: 7,  end: 9,  text: 'Phrase three', sel: true  },
      { start: 10, end: 12, text: 'Phrase four',  sel: false },
    ],
    delay: 0, speedIdx: 2, ccOn: true, filter: 'all',
  }
  saveSession(sessionKey(videoFile.name, videoFile.size), sessData)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, {
      target: { files: [videoFile, new File([SRT_4], 'test.srt', { type: 'text/plain' })] },
    })
    await tick(150)
  })
  await act(async () => {
    const restoreBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^restaurar$/i.test(b.textContent?.trim() ?? ''))
    if (restoreBtn) fireEvent.click(restoreBtn)
    await tick(50)
  })
}

function mockLocalVideo(container: HTMLElement, initialTime = 1.5) {
  const video = container.querySelector('video')!
  let t = initialTime
  Object.defineProperty(video, 'currentTime', {
    get: () => t,
    set: (v: number) => { t = v },
    configurable: true,
  })
  Object.defineProperty(video, 'duration', { get: () => 15, configurable: true })
  Object.defineProperty(video, 'paused',   { get: () => false, configurable: true })
  const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {})
  return { video, getTime: () => t, setTime: (v: number) => { t = v }, pauseSpy }
}

async function openStageWithMock(container: HTMLElement) {
  const panelCmds: Array<Record<string, unknown>> = []
  const mockStage = new StageChannel()
  mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))
  const stageBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /abrir stage/i.test(b.textContent ?? ''))
  await act(async () => { fireEvent.click(stageBtn!); await tick(50) })
  await act(async () => { mockStage.send({ type: 'ready' }); await tick(50) })
  return { mockStage, panelCmds }
}

async function sendTimeUpdate(mockStage: StageChannel, ct: number, isPlaying = true) {
  await act(async () => {
    mockStage.send({ type: 'timeupdate', currentTime: ct, duration: 15, isPlaying })
    await tick(60)
  })
}

let _mockStageRef: StageChannel | null = null

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
  vi.mocked(capture).mockClear()
})

afterEach(() => {
  _mockStageRef?.close()
  _mockStageRef = null
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// autopause_toggled
// ══════════════════════════════════════════════════════════════════════════════

describe('autopause_toggled', () => {
  it('fires { new_state: "on" } on first click', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('autopause_toggled', { new_state: 'on' })
  })

  it('fires { new_state: "off" } on second click', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })
    vi.mocked(capture).mockClear()
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('autopause_toggled', { new_state: 'off' })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// autopause_triggered
// ══════════════════════════════════════════════════════════════════════════════

describe('autopause_triggered', () => {
  it('fires { phrase_index: 0 } when auto-pausa triggers at end of phrase 0', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const apBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(apBtn!); await tick(30) })
    vi.mocked(capture).mockClear()

    const { video, setTime } = mockLocalVideo(container, 1.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    setTime(3.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('autopause_triggered', { phrase_index: 0 })
  })

  it('does NOT fire when loop has precedence', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const loopBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^loop$/i.test(b.textContent ?? ''))
    const apBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(loopBtn!); fireEvent.click(apBtn!)
      await tick(30)
    })
    vi.mocked(capture).mockClear()

    const { video, setTime } = mockLocalVideo(container, 1.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    setTime(3.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    const names = vi.mocked(capture).mock.calls.map(c => c[0])
    expect(names).not.toContain('autopause_triggered')
  })

  it('does NOT fire when practice mode has precedence', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    const apBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    const prBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(apBtn!); fireEvent.click(prBtn!)
      await tick(30)
    })
    vi.mocked(capture).mockClear()

    const { video, setTime } = mockLocalVideo(container, 1.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    setTime(3.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    const names = vi.mocked(capture).mock.calls.map(c => c[0])
    expect(names).not.toContain('autopause_triggered')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// practice_mode_toggled
// ══════════════════════════════════════════════════════════════════════════════

describe('practice_mode_toggled', () => {
  it('fires { new_state: "on", selected_count: 4 } on first click (SRT_4, all selected)', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('practice_mode_toggled', {
      new_state: 'on', selected_count: 4,
    })
  })

  it('fires { new_state: "off", selected_count: 4 } on second click', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })
    vi.mocked(capture).mockClear()
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('practice_mode_toggled', {
      new_state: 'off', selected_count: 4,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// practice_mode_completed
// ══════════════════════════════════════════════════════════════════════════════

describe('practice_mode_completed', () => {
  it('fires { selected_count: 2 } when last selected phrase ends', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)
    // p0(sel=T), p1(sel=F), p2(sel=T, start=7, end=9), p3(sel=F) — 2 selected

    const prBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(prBtn!); await tick(30) })
    vi.mocked(capture).mockClear()

    const { video, setTime } = mockLocalVideo(container, 7.5)
    // enter p2 (start=7, end=9)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    // pass end of p2 — p2 is last selected → pause + completed
    setTime(9.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('practice_mode_completed', { selected_count: 2 })
  })

  it('does NOT fire when there is a next selected phrase after the current one', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)
    // p0(sel=T, start=1, end=3) → next selected is p2 → no completion

    const prBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(prBtn!); await tick(30) })
    vi.mocked(capture).mockClear()

    const { video, setTime } = mockLocalVideo(container, 1.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    setTime(3.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    const names = vi.mocked(capture).mock.calls.map(c => c[0])
    expect(names).not.toContain('practice_mode_completed')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// phrase_loop_changed
// ══════════════════════════════════════════════════════════════════════════════

describe('phrase_loop_changed', () => {
  it('fires { enabled: true } on first click', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /^loop$/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_loop_changed', { enabled: true })
  })

  it('fires { enabled: false } on second click', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /^loop$/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })
    vi.mocked(capture).mockClear()
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('phrase_loop_changed', { enabled: false })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// text_visibility_toggled
// ══════════════════════════════════════════════════════════════════════════════

describe('text_visibility_toggled', () => {
  it('fires { hidden: true } on first click (texts become hidden)', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    vi.mocked(capture).mockClear()

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /^ocultar$/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('text_visibility_toggled', { hidden: true })
  })

  it('fires { hidden: false } on second click (texts revealed)', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const btn = Array.from(container.querySelectorAll('button'))
      .find(b => /^ocultar$/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(btn!); await tick(30) })
    vi.mocked(capture).mockClear()
    await act(async () => { fireEvent.click(btn!); await tick(30) })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('text_visibility_toggled', { hidden: false })
  })
})
