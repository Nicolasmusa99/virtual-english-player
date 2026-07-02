// TC-054–TC-060: Bloque C — persistencia de sesión (US-023/024/025)
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent, waitFor } from '@testing-library/react'
import Player from '@/app/page'
import { sessionKey, saveSession } from '@/lib/session'
import type { SessionData } from '@/lib/session'

// ─── helpers ──────────────────────────────────────────────────────────────
function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_2 = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond phrase\n'
const FILE_CONTENT = 'fake-video-data'  // size = 15 bytes

async function loadIntoPlayerScreen(container: HTMLElement) {
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_2],       'test.srt', { type: 'text/plain' })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
  return videoFile
}

function makeSession(override: Partial<SessionData> = {}): SessionData {
  return {
    phrases: [
      { start: 1, end: 3, text: 'Saved phrase 1', sel: true },
      { start: 4, end: 6, text: 'Saved phrase 2', sel: false },
    ],
    delay: 0.5,
    speedIdx: 3,
    ccOn: false,
    filter: 'sel',
    ...override,
  }
}

// ─── suite ────────────────────────────────────────────────────────────────
describe('Player — Bloque C persistencia', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => { vi.restoreAllMocks() })

  // ── US-023 ──────────────────────────────────────────────────────────────

  // TC-054: autosave persiste a localStorage después del debounce (500 ms)
  it('TC-054: autosave persiste a localStorage después del debounce', async () => {
    const { container } = render(<Player />)
    const videoFile = await loadIntoPlayerScreen(container)
    const key = sessionKey(videoFile.name, videoFile.size)

    // Nada guardado aún (debounce no expiró)
    expect(localStorage.getItem(key)).toBeNull()

    // waitFor espera hasta que el debounce dispare (máx 1.5 s)
    await waitFor(() => {
      expect(localStorage.getItem(key)).not.toBeNull()
    }, { timeout: 1500 })

    const saved = JSON.parse(localStorage.getItem(key)!)
    expect(saved.phrases).toHaveLength(2)
    expect(saved.ccOn).toBe(true)
  })

  // TC-055: la clave de sesión incluye fileName y fileSize
  it('TC-055: la clave incluye fileName y fileSize exactos', async () => {
    const { container } = render(<Player />)
    const videoFile = await loadIntoPlayerScreen(container)
    const expectedKey = `ve-session:${videoFile.name}:${videoFile.size}`

    await waitFor(() => {
      expect(localStorage.getItem(expectedKey)).not.toBeNull()
    }, { timeout: 1500 })
  })

  // ── US-024 ──────────────────────────────────────────────────────────────

  // TC-056: banner de restaurar aparece cuando hay sesión con mismo conteo de frases
  it('TC-056: muestra banner "Restaurar" cuando hay sesión guardada con mismo phrase count', async () => {
    const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
    const key = sessionKey(videoFile.name, videoFile.size)
    saveSession(key, makeSession())   // 2 phrases = mismo count que el SRT

    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    // El banner de restaurar debe ser visible
    expect(container.textContent).toMatch(/restaurar/i)
  })

  // TC-057: click en "Restaurar" aplica estado guardado
  it('TC-057: al restaurar, el estado guardado reemplaza el actual', async () => {
    const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
    const key = sessionKey(videoFile.name, videoFile.size)
    saveSession(key, makeSession({ phrases: [
      { start: 1, end: 3, text: 'Edited text saved', sel: true },
      { start: 4, end: 6, text: 'Second saved',      sel: false },
    ]}))

    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const restoreBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^restaurar$/i.test(b.textContent?.trim() ?? ''))
    expect(restoreBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(restoreBtn!)
      await tick(50)
    })

    expect(container.textContent).toContain('Edited text saved')
  })

  // TC-058: click en "Descartar" ignora la sesión y mantiene frases originales
  it('TC-058: al descartar, se mantienen las frases originales del SRT', async () => {
    const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
    const key = sessionKey(videoFile.name, videoFile.size)
    saveSession(key, makeSession())

    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const discardBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^descartar$/i.test(b.textContent?.trim() ?? ''))
    expect(discardBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(discardBtn!)
      await tick(50)
    })

    // Prompt desaparece y se muestran las frases originales del SRT
    expect(container.textContent).not.toMatch(/^restaurar$/i)
    expect(container.textContent).toContain('Hello world')
  })

  // ── US-025 ──────────────────────────────────────────────────────────────

  // TC-059: con cambios sin guardar, "← Cargar otro" muestra diálogo de confirmación
  it('TC-059: dirty + "← Cargar otro" muestra diálogo con opción "Salir sin guardar"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    // Hacer un cambio que setea dirty: click en delay "+"
    const plusBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === '+')
    expect(plusBtn).not.toBeNull()
    await act(async () => { fireEvent.click(plusBtn!); await tick(30) })

    // Click "← Cargar otro"
    const backBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /cargar otro/i.test(b.textContent ?? ''))
    expect(backBtn).not.toBeNull()
    await act(async () => { fireEvent.click(backBtn!); await tick(30) })

    // El diálogo de salida debe estar visible
    expect(container.textContent).toMatch(/salir sin guardar/i)
  })

  // TC-060: sin cambios, "← Cargar otro" vuelve directamente a la load screen
  it('TC-060a: sin dirty, "← Cargar otro" vuelve directo a la load screen', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const backBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /cargar otro/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(backBtn!); await tick(50) })

    expect(container.textContent).toMatch(/arrastrá el video/i)
  })

  // TC-060b: "Salir sin guardar" cierra el diálogo y vuelve a load screen
  it('TC-060b: "Salir sin guardar" vuelve a la load screen', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const plusBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === '+')
    await act(async () => { fireEvent.click(plusBtn!); await tick(30) })

    const backBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /cargar otro/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(backBtn!); await tick(30) })

    const exitBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /salir sin guardar/i.test(b.textContent ?? ''))
    expect(exitBtn).not.toBeNull()
    await act(async () => { fireEvent.click(exitBtn!); await tick(50) })

    expect(container.textContent).toMatch(/arrastrá el video/i)
  })

  // TC-060c: "Cancelar" en el diálogo mantiene la pantalla de player
  it('TC-060c: "Cancelar" en el diálogo mantiene al usuario en el player', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const plusBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === '+')
    await act(async () => { fireEvent.click(plusBtn!); await tick(30) })

    const backBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /cargar otro/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(backBtn!); await tick(30) })

    const cancelBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^cancelar$/i.test(b.textContent?.trim() ?? ''))
    expect(cancelBtn).not.toBeNull()
    await act(async () => { fireEvent.click(cancelBtn!); await tick(50) })

    // Sigue en player: el diálogo cierra y las frases siguen visibles
    expect(container.textContent).toMatch(/hello world/i)
    expect(container.textContent).not.toMatch(/arrastrá el video/i)
  })
})
