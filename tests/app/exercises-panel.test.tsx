import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'

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
    ok:     status >= 200 && status < 300,
    status,
    json:   async () => data,
  } as Response)
}

async function openExercisesTab(container: HTMLElement) {
  const tab = container.querySelector('[data-testid="tab-exercises"]') as HTMLButtonElement
  expect(tab).not.toBeNull()
  await act(async () => { fireEvent.click(tab); await tick(50) })
}

async function generate(container: HTMLElement) {
  const btn = container.querySelector('[data-testid="btn-generate"]') as HTMLButtonElement
  expect(btn).not.toBeNull()
  await act(async () => { fireEvent.click(btn); await tick(100) })
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

describe('Exercises tab — navigation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('player screen shows "Ejercicios" tab button', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    expect(container.querySelector('[data-testid="tab-exercises"]')).not.toBeNull()
  })

  it('tab emits exercises_tab_opened via capture on first open', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    expect(captureSpy).toHaveBeenCalledWith('exercises_tab_opened', expect.objectContaining({
      video_file_name: 'test.mp4',
      selected_count:  expect.any(Number),
    }))
    delete window.__ve_posthog
  })

  it('switching to exercises tab shows generate button (idle state)', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    expect(container.querySelector('[data-testid="btn-generate"]')).not.toBeNull()
  })

  it('"Player" tab restores player controls', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    const playerTab = container.querySelector('[data-testid="tab-player"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(playerTab); await tick(50) })
    // Player controls should be visible again
    expect(container.querySelector('[data-testid="prog-track"]')).not.toBeNull()
  })
})

// ─── Generation flow ─────────────────────────────────────────────────────────

describe('Exercises tab — generation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('scope falls back to "all" when no phrase is selected (visible indicator)', async () => {
    const { container } = render(<Player />)
    await loadPlayer(container)
    // Deselect all phrases
    const deselectBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^ninguna$/i.test((b.textContent ?? '').trim()))
    if (deselectBtn) await act(async () => { fireEvent.click(deselectBtn) })
    await openExercisesTab(container)
    // When scope=sel and no selection, UI shows fallback hint
    const scopeSelBtn = container.querySelector('[data-testid="scope-sel"]') as HTMLButtonElement
    expect(scopeSelBtn).not.toBeNull()
  })

  it('genState: idle → generating → ready after successful fetch', async () => {
    mockFetch()
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    await generate(container)
    // ready state shows sub-tabs
    expect(container.querySelector('[data-testid="tab-quiz"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="tab-cloze"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="tab-match"]')).not.toBeNull()
  })

  it('emits exercises_generated event after success', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    mockFetch()
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    await generate(container)
    expect(captureSpy).toHaveBeenCalledWith('exercises_generated', expect.objectContaining({
      quiz_count:  5,
      cloze_count: 6,
      match_count: 6,
    }))
    delete window.__ve_posthog
  })

  it('genState=error shows error box and retry button', async () => {
    mockFetch({ error: 'Server crashed' }, 500)
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    await generate(container)
    expect(container.querySelector('[data-testid="exercises-error"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="btn-retry"]')).not.toBeNull()
  })

  it('emits exercises_generation_failed on error', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    mockFetch({ error: 'overloaded' }, 529)
    const { container } = render(<Player />)
    await loadPlayer(container)
    await openExercisesTab(container)
    await generate(container)
    expect(captureSpy).toHaveBeenCalledWith('exercises_generation_failed', expect.objectContaining({
      http_status: 529,
    }))
    delete window.__ve_posthog
  })
})

// ─── Quiz sub-tab ─────────────────────────────────────────────────────────────

async function getReadyQuiz(container: HTMLElement) {
  mockFetch()
  await loadPlayer(container)
  await openExercisesTab(container)
  await generate(container)
  // quiz tab is default
}

describe('Exercises tab — Quiz', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders 5 quiz questions', async () => {
    const { container } = render(<Player />)
    await getReadyQuiz(container)
    // exclude option buttons (quiz-q-N-opt-M) and explanation divs
    expect(
      container.querySelectorAll('[data-testid^="quiz-q-"]:not([data-testid*="-opt-"]):not([data-testid*="-explanation"])')
    ).toHaveLength(5)
  })

  it('correct answer → data-correct=true, explanation appears, options disabled', async () => {
    const { container } = render(<Player />)
    await getReadyQuiz(container)
    // q0: correct=0 (option A = 'Learning')
    const opt0 = container.querySelector('[data-testid="quiz-q-0-opt-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(opt0) })
    expect(opt0.getAttribute('data-correct')).toBe('true')
    expect(container.querySelector('[data-testid="quiz-q-0-explanation"]')).not.toBeNull()
    // all options disabled after answering
    for (let i = 0; i < 4; i++) {
      const btn = container.querySelector(`[data-testid="quiz-q-0-opt-${i}"]`) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    }
  })

  it('wrong answer → data-correct=false, correct option gets data-answer=true', async () => {
    const { container } = render(<Player />)
    await getReadyQuiz(container)
    // q0: correct=0 → click opt-1 (wrong)
    const opt1 = container.querySelector('[data-testid="quiz-q-0-opt-1"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(opt1) })
    expect(opt1.getAttribute('data-correct')).toBe('false')
    const opt0 = container.querySelector('[data-testid="quiz-q-0-opt-0"]') as HTMLButtonElement
    expect(opt0.getAttribute('data-answer')).toBe('true')
  })

  it('emits quiz_answered with correct=true when right', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    const { container } = render(<Player />)
    await getReadyQuiz(container)
    const opt0 = container.querySelector('[data-testid="quiz-q-0-opt-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(opt0) })
    expect(captureSpy).toHaveBeenCalledWith('quiz_answered', expect.objectContaining({ question_index: 0, correct: true }))
    delete window.__ve_posthog
  })

  it('options stay blocked after answering (second click no-op)', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    const { container } = render(<Player />)
    await getReadyQuiz(container)
    const opt0 = container.querySelector('[data-testid="quiz-q-0-opt-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(opt0) })
    const callsBefore = captureSpy.mock.calls.filter(c => c[0] === 'quiz_answered').length
    await act(async () => { fireEvent.click(opt0) }) // second click
    const callsAfter = captureSpy.mock.calls.filter(c => c[0] === 'quiz_answered').length
    expect(callsAfter).toBe(callsBefore) // no new capture
    delete window.__ve_posthog
  })
})

// ─── Fill-in (Cloze) sub-tab ─────────────────────────────────────────────────

async function goToCloze(container: HTMLElement) {
  mockFetch()
  await loadPlayer(container)
  await openExercisesTab(container)
  await generate(container)
  const clozeTab = container.querySelector('[data-testid="tab-cloze"]') as HTMLButtonElement
  await act(async () => { fireEvent.click(clozeTab) })
}

describe('Exercises tab — Fill-in', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders 6 cloze inputs', async () => {
    const { container } = render(<Player />)
    await goToCloze(container)
    expect(container.querySelectorAll('[data-testid^="cloze-input-"]')).toHaveLength(6)
  })

  it('correct answer (exact) → data-correct=true', async () => {
    const { container } = render(<Player />)
    await goToCloze(container)
    // item 0 answer = 'world'
    const input = container.querySelector('[data-testid="cloze-input-0"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'world' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(input.getAttribute('data-correct')).toBe('true')
  })

  it('correct answer is case-insensitive and trims spaces', async () => {
    const { container } = render(<Player />)
    await goToCloze(container)
    const input = container.querySelector('[data-testid="cloze-input-0"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '  WORLD  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(input.getAttribute('data-correct')).toBe('true')
  })

  it('wrong answer → data-correct=false and reveals answer', async () => {
    const { container } = render(<Player />)
    await goToCloze(container)
    const input = container.querySelector('[data-testid="cloze-input-0"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'wrong' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(input.getAttribute('data-correct')).toBe('false')
    expect(container.querySelector('[data-testid="cloze-reveal-0"]')).not.toBeNull()
  })

  it('player keyboard shortcuts are no-op while cloze input is focused', async () => {
    const { container } = render(<Player />)
    await goToCloze(container)
    const input = container.querySelector('[data-testid="cloze-input-0"]') as HTMLInputElement
    const video = container.querySelector('video')!
    const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)
    fireEvent.focus(input)
    // Space key on the INPUT element should not propagate to player shortcuts
    // (the keyboard handler guards: if target.tagName === 'INPUT' return)
    fireEvent.keyDown(input, { key: ' ' })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('emits cloze_answered with correct flag', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    const { container } = render(<Player />)
    await goToCloze(container)
    const input = container.querySelector('[data-testid="cloze-input-0"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'world' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(captureSpy).toHaveBeenCalledWith('cloze_answered', expect.objectContaining({ item_index: 0, correct: true }))
    delete window.__ve_posthog
  })
})

// ─── Match sub-tab ────────────────────────────────────────────────────────────

async function goToMatch(container: HTMLElement) {
  mockFetch()
  await loadPlayer(container)
  await openExercisesTab(container)
  await generate(container)
  const matchTab = container.querySelector('[data-testid="tab-match"]') as HTMLButtonElement
  await act(async () => { fireEvent.click(matchTab) })
}

describe('Exercises tab — Match', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders 6 terms and 6 definitions', async () => {
    const { container } = render(<Player />)
    await goToMatch(container)
    expect(container.querySelectorAll('[data-testid^="match-term-"]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-testid^="match-def-"]')).toHaveLength(6)
  })

  it('all original definitions are rendered (possibly shuffled)', async () => {
    const { container } = render(<Player />)
    await goToMatch(container)
    const defTexts = Array.from(container.querySelectorAll('[data-testid^="match-def-"]'))
      .map(d => d.textContent ?? '')
    const expected = FAKE_EXERCISES.match.map(m => m.definition).sort()
    expect(defTexts.sort()).toEqual(expected)
  })

  it('correct match: clicking term then its correct definition marks term as matched', async () => {
    const { container } = render(<Player />)
    await goToMatch(container)
    // Find which display position has the definition for term-0
    const term0Def = FAKE_EXERCISES.match[0].definition // 'a greeting'
    const correctDefBtn = Array.from(container.querySelectorAll('[data-testid^="match-def-"]'))
      .find(d => d.textContent === term0Def) as HTMLButtonElement
    expect(correctDefBtn).toBeTruthy()

    const term0 = container.querySelector('[data-testid="match-term-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(term0) })
    await act(async () => { fireEvent.click(correctDefBtn) })

    expect(term0.getAttribute('data-matched')).toBe('true')
  })

  it('wrong match: term is NOT marked matched and gets deselected after flash', async () => {
    const { container } = render(<Player />)
    await goToMatch(container)
    const term0Def    = FAKE_EXERCISES.match[0].definition
    const wrongDefBtn = Array.from(container.querySelectorAll('[data-testid^="match-def-"]'))
      .find(d => d.textContent !== term0Def) as HTMLButtonElement

    const term0 = container.querySelector('[data-testid="match-term-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(term0) })

    if (wrongDefBtn) {
      await act(async () => {
        fireEvent.click(wrongDefBtn)
        await tick(500) // wait for flash timeout
      })
      expect(term0.getAttribute('data-matched')).not.toBe('true')
      // term deselected after flash
      expect(term0.getAttribute('data-selected')).not.toBe('true')
    }
  })

  it('emits match_pair_attempted with correct=true on correct match', async () => {
    const captureSpy = vi.fn()
    window.__ve_posthog = { capture: captureSpy }
    const { container } = render(<Player />)
    await goToMatch(container)
    const term0Def = FAKE_EXERCISES.match[0].definition
    const defBtn   = Array.from(container.querySelectorAll('[data-testid^="match-def-"]'))
      .find(d => d.textContent === term0Def) as HTMLButtonElement
    const term0    = container.querySelector('[data-testid="match-term-0"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(term0) })
    await act(async () => { fireEvent.click(defBtn) })
    expect(captureSpy).toHaveBeenCalledWith('match_pair_attempted', expect.objectContaining({ correct: true }))
    delete window.__ve_posthog
  })
})
