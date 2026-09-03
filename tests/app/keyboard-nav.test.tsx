// TC-143 – TC-151: nuevo esquema de teclas del player (2026-09-03)
// →/← navegan frases (con barrido al mantener), ↓ reinicia la frase, ↑ salta al
// inicio de la sección (grilla fija SECTION_SECONDS). A/D/R/W eliminadas; volumen
// solo por slider. Ver US-011/012/013 [Corregida] y US-056.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import type { Phrase } from '@/lib/srt'

function tick(ms = 0) { return new Promise<void>(r => setTimeout(r, ms)) }

const FILE_CONTENT = 'fake-video-data'

// 4 frases de 2s: p0 1-3, p1 4-6, p2 7-9, p3 10-12
const PHRASES_4: Phrase[] = [
  { start: 1,  end: 3,  text: 'Phrase one',   sel: false },
  { start: 4,  end: 6,  text: 'Phrase two',   sel: false },
  { start: 7,  end: 9,  text: 'Phrase three', sel: false },
  { start: 10, end: 12, text: 'Phrase four',  sel: false },
]

// 1 frase larga (0-10s) para probar el salto por sección con SECTION_SECONDS=2
const PHRASES_LONG: Phrase[] = [
  { start: 0, end: 10, text: 'Long phrase', sel: false },
]

// segundos → "HH:MM:SS,mmm"
function ts(sec: number): string {
  const ms = Math.round((sec % 1) * 1000)
  const s = Math.floor(sec) % 60
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

function srtFromPhrases(phrases: Phrase[]): string {
  return phrases.map((p, i) => `${i + 1}\n${ts(p.start)} --> ${ts(p.end)}\n${p.text}\n`).join('\n')
}

// Carga video + SRT (las frases salen del SRT, US-002) y espera la pantalla de player
async function loadWithPhrases(container: HTMLElement, phrases: Phrase[]) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([srtFromPhrases(phrases)], 'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

// Mockea video.currentTime. `ref.t` = tiempo simulado; `ref.sets` = nº de escrituras
// vía el setter (cada seek de jumpTo/repeat/section incrementa el contador).
// Asignar ref.t directamente (posicionamiento) NO cuenta como escritura.
function mockVideoTime(container: HTMLElement, initial: number) {
  const video = container.querySelector('video')!
  const ref = { t: initial, sets: 0 }
  Object.defineProperty(video, 'currentTime', { get: () => ref.t, set: (v: number) => { ref.t = v; ref.sets++ }, configurable: true })
  Object.defineProperty(video, 'duration', { get: () => 15, configurable: true })
  Object.defineProperty(video, 'paused', { get: () => true, configurable: true })
  return { video, ref }
}

// Posiciona la frase activa enviando un timeupdate en el tiempo dado
async function positionAt(video: HTMLVideoElement, ref: { t: number }, t: number) {
  ref.t = t
  await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
}

// Lee el contador "N / M" del panel de frase actual
function phraseCounter(container: HTMLElement): string {
  const el = container.querySelector('[class*="phCtr"]')
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
})
afterEach(() => { vi.restoreAllMocks() })

describe('Esquema de teclas por flechas (US-011/012/013 + US-056)', () => {

  // TC-143: → avanza una frase (pulsación simple)
  it('TC-143: ArrowRight avanza una frase', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 1.5)
    await positionAt(video, ref, 1.5)
    expect(phraseCounter(container)).toBe('1 / 4')

    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(30) })
    expect(phraseCounter(container)).toBe('2 / 4')
    expect(ref.t).toBeGreaterThanOrEqual(4); expect(ref.t).toBeLessThan(5)
  })

  // TC-144: ← retrocede una frase (pulsación simple)
  it('TC-144: ArrowLeft retrocede una frase', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 4.5)
    await positionAt(video, ref, 4.5)
    expect(phraseCounter(container)).toBe('2 / 4')

    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowLeft' }); await tick(30) })
    expect(phraseCounter(container)).toBe('1 / 4')
  })

  // TC-145: mantener → dispara la navegación repetidamente (~NAV_HOLD_MS) y frena al soltar.
  // Nota: en jsdom el índice visible no progresa dentro de un mismo bloque de timers
  // (el ref de curIdx se refresca al re-render); por eso medimos las invocaciones al
  // seek (setter de currentTime), que prueban el auto-repeat y su corte en keyup.
  it('TC-145: mantener ArrowRight repite el paso y se detiene al soltar', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 1.5)
    await positionAt(video, ref, 1.5)
    ref.sets = 0

    // keydown sin keyup: paso inmediato + intervalo cada NAV_HOLD_MS (450ms)
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(1000) })
    expect(ref.sets).toBeGreaterThanOrEqual(2)   // inmediato + ≥1 tick del intervalo

    await act(async () => { fireEvent.keyUp(document.body, { key: 'ArrowRight' }); await tick(30) })
    const afterUp = ref.sets
    await act(async () => { await tick(1000) })
    expect(ref.sets).toBe(afterUp)               // sin keyup no habría parado; ya frenó
  })

  // TC-146: mantener ← repite el paso en reversa y frena al soltar
  it('TC-146: mantener ArrowLeft repite el paso en reversa y se detiene al soltar', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 10.5)
    await positionAt(video, ref, 10.5)
    ref.sets = 0

    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowLeft' }); await tick(1000) })
    expect(ref.sets).toBeGreaterThanOrEqual(2)

    await act(async () => { fireEvent.keyUp(document.body, { key: 'ArrowLeft' }); await tick(30) })
    const afterUp = ref.sets
    await act(async () => { await tick(1000) })
    expect(ref.sets).toBe(afterUp)
  })

  // TC-152: en los extremos, mantener la flecha NO arranca el barrido (frena en el borde)
  it('TC-152: mantener → en la última frase (y ← en la primera) no dispara auto-repeat', async () => {
    // → en la última frase
    const a = render(<Player />)
    await loadWithPhrases(a.container, PHRASES_4)
    const va = mockVideoTime(a.container, 10.5)
    await positionAt(va.video, va.ref, 10.5)     // última frase
    va.ref.sets = 0
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(1000) })
    expect(va.ref.sets).toBeLessThanOrEqual(1)   // a lo sumo el re-seek inmediato; sin intervalo
    await act(async () => { fireEvent.keyUp(document.body, { key: 'ArrowRight' }); await tick(10) })
    a.unmount()

    // ← en la primera frase
    const b = render(<Player />)
    await loadWithPhrases(b.container, PHRASES_4)
    const vb = mockVideoTime(b.container, 1.5)
    await positionAt(vb.video, vb.ref, 1.5)      // primera frase
    vb.ref.sets = 0
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowLeft' }); await tick(1000) })
    expect(vb.ref.sets).toBeLessThanOrEqual(1)
    await act(async () => { fireEvent.keyUp(document.body, { key: 'ArrowLeft' }); await tick(10) })
    b.unmount()
  })

  // TC-147: ↓ reinicia la frase actual desde phrase.start
  it('TC-147: ArrowDown reinicia la frase actual', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 4.5)
    await positionAt(video, ref, 4.5)     // frase 1 (4-6)
    ref.t = 5.6                            // avanzado dentro de la frase

    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowDown' }); await tick(30) })
    expect(ref.t).toBeGreaterThanOrEqual(4)   // volvió a p1.start (+0.05)
    expect(ref.t).toBeLessThan(4.2)
  })

  // TC-148: ↑ salta al inicio de la sección; si ya está en el primer tramo, a phrase.start
  it('TC-148: ArrowUp salta al inicio de la sección actual (grilla de 2s)', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_LONG)
    const { video, ref } = mockVideoTime(container, 0.5)
    await positionAt(video, ref, 0.5)

    // en la sección [4,6): 5.3 → inicio de sección = 4
    ref.t = 5.3
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowUp' }); await tick(30) })
    expect(ref.t).toBe(4)

    // primer tramo [0,2): 1.2 → vuelve a phrase.start = 0
    ref.t = 1.2
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowUp' }); await tick(30) })
    expect(ref.t).toBe(0)
  })

  // TC-149: A, D, R, W son no-op (teclas eliminadas)
  it('TC-149: A/D/R/W no navegan ni cambian el tiempo', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 4.5)
    await positionAt(video, ref, 4.5)
    expect(phraseCounter(container)).toBe('2 / 4')
    ref.t = 5.0

    for (const key of ['a', 'A', 'd', 'D', 'r', 'R', 'w', 'W']) {
      await act(async () => { fireEvent.keyDown(document.body, { key }); await tick(10) })
    }
    expect(phraseCounter(container)).toBe('2 / 4')
    expect(ref.t).toBe(5.0)
  })

  // TC-150: los atajos son no-op con el foco en un <input>
  it('TC-150: con foco en un input, las flechas no navegan', async () => {
    const { container } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 4.5)
    await positionAt(video, ref, 4.5)
    expect(phraseCounter(container)).toBe('2 / 4')

    const input = container.querySelector('input[type="range"], input') as HTMLInputElement
    expect(input).not.toBeNull()
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowRight' }); await tick(30) })
    expect(phraseCounter(container)).toBe('2 / 4')
  })

  // TC-151: al desmontar el player no queda ningún intervalo de barrido activo
  it('TC-151: al desmontar se limpia el intervalo de auto-repeat', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { container, unmount } = render(<Player />)
    await loadWithPhrases(container, PHRASES_4)
    const { video, ref } = mockVideoTime(container, 1.5)
    await positionAt(video, ref, 1.5)

    // mantener → arranca el intervalo (sin keyup)
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(30) })
    const before = clearSpy.mock.calls.length
    unmount()
    expect(clearSpy.mock.calls.length).toBeGreaterThan(before)
  })
})
