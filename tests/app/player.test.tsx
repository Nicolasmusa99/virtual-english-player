// TC-088: una sola fuente de audio — sin doble playback cuando el stage está abierto
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'

function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }

// Helper: lleva el Player a la pantalla player cargando video + SRT
async function loadIntoPlayerScreen(container: HTMLElement) {
  const srtContent = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond\n'
  const videoFile = new File(['fake-video-data'], 'test.mp4', { type: 'video/mp4' })
  const srtFile = new File([srtContent], 'test.srt', { type: 'text/plain' })

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')

  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

describe('Player — TC-088: sin doble playback en modo stage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // TC-088a: RED — el botón "Abrir stage" no existe todavía en app/page.tsx
  it('TC-088a: topbar del player muestra botón "Abrir stage"', async () => {
    const { container, queryByText } = render(<Player />)
    await loadIntoPlayerScreen(container)

    // Rojo: el botón no existe hasta que implementemos US-038 en app/page.tsx
    expect(queryByText(/abrir ventana para zoom/i)).not.toBeNull()
  })

  // TC-088b: RED — al hacer click en "Abrir stage", el video local pierde su src
  it('TC-088b: al abrir el stage, el video del panel queda sin src (sin doble audio)', async () => {
    const { container, queryByText } = render(<Player />)
    await loadIntoPlayerScreen(container)

    const video = container.querySelector('video')!
    const openBtn = queryByText(/abrir ventana para zoom/i)

    // Si el botón no existe (estado rojo) el test falla aquí de todos modos
    expect(openBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(openBtn!)
      await tick(50)
    })

    // El video local no debe reproducir: src debe estar vacío
    expect(video.getAttribute('src')).toBeFalsy()
  })
})

// Rediseño (fase 3): pestañas Guion / Ajustes / Ejercicios. "Sonido" vive en Ajustes y
// queda MONTADO aunque se mire otra pestaña: si se desmonta, desconecta el ecualizador
// del video (antes pasaba al ir a Ejercicios).
describe('Player — pestañas del panel (rediseño fase 3)', () => {
  beforeEach(() => { vi.spyOn(window, 'open').mockReturnValue({} as Window) })
  afterEach(() => { vi.restoreAllMocks() })

  const tab = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="tab-${id}"]`) as HTMLButtonElement
  const sound = (c: HTMLElement) => c.querySelector('[data-testid="sound-state"]')
  const visible = (el: Element | null) => !!el && !el.closest('[hidden]')

  it('Guion, Ajustes y Ejercicios; "Sonido" y el desfase están en Ajustes', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)
    expect([tab(container, 'player'), tab(container, 'settings'), tab(container, 'exercises')].map(t => t.textContent)).toEqual(['Guion', 'Ajustes', 'Ejercicios'])
    expect(tab(container, 'player')).toHaveAttribute('aria-selected', 'true')
    expect(visible(sound(container))).toBe(false)
    await act(async () => { fireEvent.click(tab(container, 'settings')); await tick(30) })
    expect(visible(sound(container))).toBe(true)
    expect(container.textContent).toContain('Desfase de subtítulos')
  })

  it('en Ejercicios, "Sonido" sigue montado (el ecualizador no se desconecta)', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayerScreen(container)
    await act(async () => { fireEvent.click(tab(container, 'exercises')); await tick(30) })
    expect(sound(container)).not.toBeNull()
    expect(visible(sound(container))).toBe(false)
    await act(async () => { fireEvent.click(tab(container, 'player')); await tick(30) })
    expect(container.querySelector('[data-testid="phrase-counter"]')).not.toBeNull()
  })
})
