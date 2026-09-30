// @vitest-environment jsdom
// Player del profe (P1) — franja de abajo del video (app/PlayerDock.tsx).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PlayerDock, { DOCK_TEXTS, type DockClock } from '@/app/PlayerDock'
import type { Phrase } from '@/lib/srt'
import { SEEK_THROTTLE_MS } from '@/lib/playerTimeline'

const PHRASES: Phrase[] = [
  { start: 10, end: 20, text: 'Hey, where are we going?', sel: true },
  { start: 40, end: 50, text: "I don't know, just drive", sel: false },
  { start: 60, end: 70, text: 'This car is amazing', sel: true },
]
const frame = () => act(async () => { await new Promise(r => setTimeout(r, 40)) })

let clock: DockClock
let now: number
let h: Record<string, ReturnType<typeof vi.fn<(...a: any[]) => void>>>

function mount(over: Partial<React.ComponentProps<typeof PlayerDock>> = {}) {
  const utils = render(
    <PlayerDock phrases={PHRASES} delay={0} hideTexts={false} isPlaying={false} bufPct={0}
      speeds={[0.5, 0.75, 1, 1.25, 1.5]} speedIdx={2} vol={80} ccOn={true}
      readClock={() => clock}
      onSeek={h.onSeek} onJump={h.onJump} onTogglePlay={h.onTogglePlay} onSkip={h.onSkip}
      onPrev={h.onPrev} onNext={h.onNext} onSpeed={h.onSpeed} onVol={h.onVol} onToggleCc={h.onToggleCc}
      {...over} />,
  )
  const bar = screen.getByRole('slider', { name: DOCK_TEXTS.timeline })
  // La barra mide 400 px desde x=100: x = 100 + 400·f → f·100 s.
  bar.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 26, right: 500, bottom: 26, x: 100, y: 0, toJSON: () => ({}) })
  return { ...utils, bar }
}

beforeEach(() => {
  clock = { t: 0, d: 100, playing: false }
  now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  h = Object.fromEntries(['onSeek', 'onJump', 'onTogglePlay', 'onSkip', 'onPrev', 'onNext', 'onSpeed', 'onVol', 'onToggleCc'].map(k => [k, vi.fn<(...a: any[]) => void>()]))
})
afterEach(() => vi.restoreAllMocks())

describe('PlayerDock — barra de tiempo', () => {
  it('avanza sola leyendo el reloj en cada cuadro (sin re-render del player)', async () => {
    const { bar, container } = mount()
    clock = { t: 25, d: 100, playing: true }
    await frame()
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '0:25 de 1:40')
    expect(container.textContent).toContain('0:25')
    expect(container.textContent).toContain('1:40')
    clock = { t: 42.6, d: 100, playing: true }
    await frame()
    expect(bar).toHaveAttribute('aria-valuenow', '42')
  })

  it('tocar la barra salta a ese punto', async () => {
    const { bar } = mount()
    await frame()
    fireEvent.pointerDown(bar, { clientX: 300, pointerId: 1 })
    fireEvent.pointerUp(bar, { clientX: 300, pointerId: 1 })
    expect(h.onSeek).toHaveBeenCalledWith(50)
  })

  it('arrastrar: sigue al mouse con freno, y al soltar manda el último lugar', async () => {
    const { bar } = mount()
    await frame()
    fireEvent.pointerDown(bar, { clientX: 120, pointerId: 1 })       // 5 s
    fireEvent.pointerMove(bar, { clientX: 140, pointerId: 1 })       // 10 s, mismo instante → frenado
    now += SEEK_THROTTLE_MS
    fireEvent.pointerMove(bar, { clientX: 180, pointerId: 1 })       // 20 s → pasa
    fireEvent.pointerMove(bar, { clientX: 900, pointerId: 1 })       // afuera → final, frenado
    fireEvent.pointerUp(bar, { pointerId: 1 })
    expect(h.onSeek.mock.calls.map(c => c[0])).toEqual([5, 20, 100])
    // Suelto: mover el mouse ya no salta.
    now += 1000
    fireEvent.pointerMove(bar, { clientX: 200, pointerId: 1 })
    expect(h.onSeek).toHaveBeenCalledTimes(3)
  })

  it('pasar el mouse muestra la hora y la frase de ese punto (y si está elegida)', async () => {
    const { bar } = mount()
    await frame()
    fireEvent.pointerMove(bar, { clientX: 100 + 400 * 0.65, pointerId: 1 }) // 65 s
    const tip = screen.getByTestId('dock-tip')
    expect(tip).toHaveTextContent('1:05')
    expect(tip).toHaveTextContent('This car is amazing')
    expect(tip).toHaveTextContent(DOCK_TEXTS.sel(2))
    expect(h.onSeek).not.toHaveBeenCalled()
    fireEvent.pointerMove(bar, { clientX: 100 + 400 * 0.45, pointerId: 1 }) // 45 s, no elegida
    expect(screen.getByTestId('dock-tip')).toHaveTextContent("I don't know, just drive")
    expect(screen.getByTestId('dock-tip')).not.toHaveTextContent('sel.')
    fireEvent.pointerLeave(bar)
    expect(screen.queryByTestId('dock-tip')).toBeNull()
  })

  it('con "Ocultar" activo la vista previa muestra solo la hora', async () => {
    const { bar } = mount({ hideTexts: true })
    await frame()
    fireEvent.pointerMove(bar, { clientX: 100 + 400 * 0.65, pointerId: 1 })
    expect(screen.getByTestId('dock-tip')).toHaveTextContent('1:05')
    expect(screen.getByTestId('dock-tip')).not.toHaveTextContent('amazing')
  })

  it('las marcas de frase saltan a la frase y no mueven la barra', async () => {
    const { container } = mount()
    await frame()
    const tick = container.querySelector('[data-phrase-idx="2"]')!
    expect(tick).not.toBeNull()
    fireEvent.pointerDown(tick, { clientX: 340, pointerId: 1 })
    fireEvent.click(tick)
    expect(h.onJump).toHaveBeenCalledWith(2)
    expect(h.onSeek).not.toHaveBeenCalled()
  })

  it('sin duración conocida la barra no salta', async () => {
    clock = { t: 0, d: 0, playing: false }
    const { bar } = mount()
    await frame()
    fireEvent.pointerDown(bar, { clientX: 300, pointerId: 1 })
    expect(h.onSeek).not.toHaveBeenCalled()
  })
})

describe('PlayerDock — controles', () => {
  it('botones: −10 s, frase anterior, play, siguiente, +10 s', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.back10 }))
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.prev }))
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.play }))
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.next }))
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.fwd10 }))
    expect(h.onSkip.mock.calls).toEqual([[-10], [10]])
    expect(h.onPrev).toHaveBeenCalledTimes(1)
    expect(h.onTogglePlay).toHaveBeenCalledTimes(1)
    expect(h.onNext).toHaveBeenCalledTimes(1)
  })

  it('reproduciendo, el botón dice Pausar', () => {
    mount({ isPlaying: true })
    expect(screen.getByRole('button', { name: DOCK_TEXTS.pause })).toBeInTheDocument()
  })

  it('volumen', () => {
    mount()
    fireEvent.change(screen.getByLabelText(DOCK_TEXTS.volume), { target: { value: '35' } })
    expect(h.onVol).toHaveBeenCalledWith(35)
  })

  it('velocidad: menú con las 5 opciones, marca la actual y se cierra al elegir', () => {
    mount()
    const btn = screen.getByRole('button', { name: DOCK_TEXTS.speed })
    expect(btn).toHaveTextContent('1×')
    fireEvent.click(btn)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map(i => i.textContent)).toEqual(['0.5×', '0.75×', '1×', '1.25×', '1.5×'])
    expect(items[2]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(items[3])
    expect(h.onSpeed).toHaveBeenCalledWith(3)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('velocidad: Escape o tocar afuera cierra el menú sin cambiar nada', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.speed }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.speed }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(h.onSpeed).not.toHaveBeenCalled()
  })

  it('CC prende y apaga los subtítulos', () => {
    const { rerender } = mount()
    const cc = screen.getByRole('button', { name: DOCK_TEXTS.cc })
    expect(cc).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(cc)
    expect(h.onToggleCc).toHaveBeenCalledTimes(1)
    rerender(<PlayerDock phrases={PHRASES} delay={0} hideTexts={false} isPlaying={false} bufPct={0}
      speeds={[0.5, 0.75, 1, 1.25, 1.5]} speedIdx={2} vol={80} ccOn={false} readClock={() => clock}
      onSeek={h.onSeek} onJump={h.onJump} onTogglePlay={h.onTogglePlay} onSkip={h.onSkip}
      onPrev={h.onPrev} onNext={h.onNext} onSpeed={h.onSpeed} onVol={h.onVol} onToggleCc={h.onToggleCc} />)
    expect(screen.getByRole('button', { name: DOCK_TEXTS.cc })).toHaveAttribute('aria-pressed', 'false')
  })
})
