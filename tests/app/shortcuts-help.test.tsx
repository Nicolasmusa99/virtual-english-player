// @vitest-environment jsdom
// Paso 5 — player del profe: el Tooltip de los modos, la sección "Atajos de teclado", y que
// los atajos no se disparen con el foco en la ayuda (pero sí después de tocar un modo).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import Tooltip from '@/app/Tooltip'
import ShortcutsHelp, { SHORTCUTS_HELP_TEXTS } from '@/app/ShortcutsHelp'
import Player from '@/app/page'
import { MODE_HELP, PRACTICE_NEEDS_SELECTION, SHORTCUTS, SHORTCUTS_NOTE } from '@/lib/shortcuts'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))
const isOpen = (el: HTMLElement) => /(^|\s)_?open_/.test(el.className) || el.className.split(/\s+/).includes('open')

describe('Tooltip', () => {
  it('el botón se describe con el texto (aria-describedby → role="tooltip")', () => {
    render(<Tooltip text="Explica el botón"><button>Loop</button></Tooltip>)
    const btn = screen.getByRole('button', { name: 'Loop' })
    const tip = document.getElementById(btn.getAttribute('aria-describedby')!)!
    expect(tip).toHaveAttribute('role', 'tooltip')
    expect(tip).toHaveTextContent('Explica el botón')
    expect(btn).toHaveAccessibleDescription('Explica el botón')
  })
  it('se muestra con el mouse y con el foco (teclado), y se cierra al salir o con Escape', () => {
    render(<Tooltip text="Explica el botón"><button>Loop</button></Tooltip>)
    const btn = screen.getByRole('button', { name: 'Loop' })
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(isOpen(tip)).toBe(false)
    fireEvent.mouseEnter(btn.parentElement!)
    expect(isOpen(tip)).toBe(true)
    fireEvent.mouseLeave(btn.parentElement!)
    expect(isOpen(tip)).toBe(false)
    fireEvent.focus(btn)
    expect(isOpen(tip)).toBe(true)
    fireEvent.keyDown(btn, { key: 'Escape' })
    expect(isOpen(tip)).toBe(false)
  })
})

describe('ShortcutsHelp — "Atajos de teclado"', () => {
  it('cerrada al empezar; el botón la abre y la cierra (aria-expanded)', () => {
    render(<ShortcutsHelp />)
    const btn = screen.getByRole('button', { name: SHORTCUTS_HELP_TEXTS.toggle })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: SHORTCUTS_HELP_TEXTS.toggle })).toBeNull()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByRole('region', { name: SHORTCUTS_HELP_TEXTS.toggle })
    expect(btn).toHaveAttribute('aria-controls', region.id)
    for (const s of SHORTCUTS) {
      expect(within(region).getByText(s.what)).toBeInTheDocument()
      expect(within(region).getByText(s.help)).toBeInTheDocument()
    }
    expect(within(region).getByLabelText('Flecha derecha')).toHaveTextContent('→')
    expect(region).toHaveTextContent(SHORTCUTS_NOTE)
    fireEvent.click(btn)
    expect(screen.queryByRole('region', { name: SHORTCUTS_HELP_TEXTS.toggle })).toBeNull()
  })
  it('Escape la cierra y el foco vuelve al botón', () => {
    render(<ShortcutsHelp />)
    const btn = screen.getByRole('button', { name: SHORTCUTS_HELP_TEXTS.toggle })
    fireEvent.click(btn)
    const region = screen.getByRole('region', { name: SHORTCUTS_HELP_TEXTS.toggle })
    fireEvent.keyDown(within(region).getByText(SHORTCUTS[0].what), { key: 'Escape' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(btn)
  })
})

// ── En el player del profe ──
const SRT = '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n\n3\n00:00:07,000 --> 00:00:09,000\nPhrase three\n'
async function openPlayer() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const r = render(<Player />)
  const input = r.container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['v'], 'test.mp4', { type: 'video/mp4' }), new File([SRT], 'test.srt', { type: 'text/plain' })] } })
    await tick(150)
  })
  const video = r.container.querySelector('video')!
  const ref = { t: 1.5 }
  Object.defineProperty(video, 'currentTime', { get: () => ref.t, set: (v: number) => { ref.t = v }, configurable: true })
  Object.defineProperty(video, 'duration', { get: () => 10, configurable: true })
  Object.defineProperty(video, 'paused', { get: () => true, configurable: true })
  await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
  return { ...r, ref }
}
const counter = () => (document.querySelector('[data-testid="phrase-counter"]')?.textContent ?? '').trim()
const press = (target: Element, key: string) => act(async () => { fireEvent.keyDown(target, { key }); fireEvent.keyUp(target, { key }); await tick(30) })

describe('player del profe', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'open').mockReturnValue({} as Window) })
  afterEach(() => { vi.restoreAllMocks() })

  it('cada modo explica qué hace (y Práctica, por qué está apagado)', async () => {
    await openPlayer()
    expect(screen.getByRole('button', { name: 'Auto-pausa' })).toHaveAccessibleDescription(MODE_HELP.autoPause)
    expect(screen.getByRole('button', { name: 'Loop' })).toHaveAccessibleDescription(MODE_HELP.loop)
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAccessibleDescription(MODE_HELP.hide)
    const practice = screen.getByRole('button', { name: 'Práctica' })
    expect(practice).toHaveAccessibleDescription(MODE_HELP.practice) // las frases del SRT arrancan tildadas
    fireEvent.click(screen.getByRole('button', { name: 'Ninguna' }))
    expect(practice).toBeDisabled()
    expect(practice).toHaveAccessibleDescription(`${MODE_HELP.practice} ${PRACTICE_NEEDS_SELECTION}`)
  })

  it('con el foco en "Atajos de teclado" las flechas no mueven el video; Escape cierra la ayuda sin disparar nada', async () => {
    const { ref } = await openPlayer()
    expect(counter()).toBe('Frase 1 de 3')
    const help = screen.getByRole('button', { name: SHORTCUTS_HELP_TEXTS.toggle })
    help.focus()
    fireEvent.click(help)
    await press(help, 'ArrowRight')
    await press(help, ' ')
    expect(ref.t).toBe(1.5)
    expect(counter()).toBe('Frase 1 de 3')
    await press(help, 'Escape')
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(ref.t).toBe(1.5)
  })

  it('después de tocar un modo (foco en el botón), las flechas siguen andando', async () => {
    const { ref } = await openPlayer()
    const loop = screen.getByRole('button', { name: 'Loop' })
    loop.focus()
    fireEvent.click(loop)
    fireEvent.click(loop) // lo vuelve a apagar, el foco queda ahí
    await press(loop, 'ArrowRight')
    expect(counter()).toBe('Frase 2 de 3')
    expect(ref.t).toBeGreaterThanOrEqual(4)
  })
})
