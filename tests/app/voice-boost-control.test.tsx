// @vitest-environment jsdom
// "Voces más claras" — la barra del player (app/VoiceBoostControl.tsx).
// El audio real se prueba en tests/lib/voiceBoost.test.ts; acá el manejador de audio
// es falso y se mira: nombre + descripción visibles y SIN palabras de nivel (el nivel
// se ve en la barra), que cada movimiento llegue al audio del panel Y al stage, y
// que el aviso aparezca SOLO si algo no se pudo activar.
import React, { createRef } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { VoiceBoostStatus } from '@/lib/voiceBoost'
import { StageChannel, type ChannelMsg } from '@/lib/stageChannel'

const fake = vi.hoisted(() => ({
  amount: 0,
  setResult: 'active' as VoiceBoostStatus,
  attach: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  set: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))
vi.mock('@/lib/voiceBoost', async (orig) => {
  const real = await orig<typeof import('@/lib/voiceBoost')>()
  return {
    ...real,
    sharedVoiceBoost: () => ({
      get amount() { return fake.amount },
      attach: fake.attach,
      set: fake.set,
    }),
  }
})
import VoiceBoostControl, { VOICE_BOOST_TEXTS } from '@/app/VoiceBoostControl'

const tick = () => act(() => new Promise<void>(r => setTimeout(r, 15)))
let stage: StageChannel
let atStage: ChannelMsg[]

beforeEach(() => {
  fake.amount = 0
  fake.setResult = 'active'
  fake.attach = vi.fn(async () => 'off' as VoiceBoostStatus)
  fake.set = vi.fn(async (a: number) => { fake.amount = a; return a === 0 ? 'off' : fake.setResult })
  stage = new StageChannel()
  atStage = []
  stage.onMessage(m => atStage.push(m))
})
afterEach(() => { stage.close() })

function mount(stageOpen = false) {
  const videoRef = createRef<HTMLVideoElement>()
  const video = document.createElement('video')
  ;(videoRef as { current: HTMLVideoElement | null }).current = video
  const r = render(<VoiceBoostControl videoRef={videoRef} stageOpen={stageOpen} />)
  return { ...r, video, rerenderOpen: (open: boolean) => r.rerender(<VoiceBoostControl videoRef={videoRef} stageOpen={open} />) }
}
const slider = () => screen.getByRole('slider', { name: VOICE_BOOST_TEXTS.label }) as HTMLInputElement
const LEVEL_WORDS = /Apagado|Suave|Medio|Fuerte/
const offBtn = () => screen.getByText(VOICE_BOOST_TEXTS.off).closest('button') as HTMLButtonElement
const move = async (v: number) => { await act(async () => { fireEvent.change(slider(), { target: { value: String(v) } }) }) }

describe('estado inicial', () => {
  it('nombre + descripción visibles, barra en 0, "apagar" oculto, sin aviso; engancha (no fuerza) el video del panel', async () => {
    const { video, container } = mount()
    await tick()
    expect(screen.getByText(VOICE_BOOST_TEXTS.label)).toBeInTheDocument()
    expect(screen.getByText('Resalta los diálogos sobre la música')).toBeInTheDocument()
    expect(slider().value).toBe('0')
    expect(slider().style.getPropertyValue('--pct')).toBe('0%')
    // "apagar" ocupa su lugar (la tarjeta no cambia de alto) pero no se ve ni se enfoca
    expect(offBtn()).toHaveAttribute('aria-hidden', 'true')
    expect(offBtn()).toHaveAttribute('tabindex', '-1')
    expect(screen.queryByRole('button', { name: VOICE_BOOST_TEXTS.off })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.textContent).not.toMatch(LEVEL_WORDS)
    expect(fake.attach).toHaveBeenCalledWith(video)
    expect(fake.set).not.toHaveBeenCalled() // sin tocar la barra no se toca el audio
  })

  it('volver al player conserva el valor del momento', () => {
    fake.amount = 70
    mount()
    expect(slider().value).toBe('70')
    expect(slider().style.getPropertyValue('--pct')).toBe('70%')
  })

  it('tiene el tooltip que explica qué hace (y que no es otro volumen)', () => {
    mount()
    expect(slider().closest('[title]')).toHaveAttribute('title', VOICE_BOOST_TEXTS.tooltip)
    expect(VOICE_BOOST_TEXTS.tooltip).toMatch(/No es otro volumen/)
  })

  it('con la barra arriba, "apagar" se ve y se puede enfocar', async () => {
    mount()
    await move(30)
    const b = screen.getByRole('button', { name: VOICE_BOOST_TEXTS.off })
    expect(b).not.toHaveAttribute('aria-hidden', 'true')
    expect(b).toHaveAttribute('tabindex', '0')
  })
})

describe('mover la barra', () => {
  it('aplica en el panel, lo manda al stage; el nivel se ve en la barra, NO en palabras', async () => {
    const { container } = mount()
    await move(50)
    expect(fake.set).toHaveBeenLastCalledWith(50)
    expect(slider().style.getPropertyValue('--pct')).toBe('50%')
    expect(container.textContent).not.toMatch(LEVEL_WORDS)
    // en palabras solo para lectores de pantalla
    expect(slider()).toHaveAttribute('aria-valuetext', 'Medio')
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', amount: 50 })
  })

  it('"apagar" vuelve a 0 (panel y stage) y desaparece', async () => {
    mount()
    await move(80)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: VOICE_BOOST_TEXTS.off })) })
    expect(fake.set).toHaveBeenLastCalledWith(0)
    expect(slider().value).toBe('0')
    expect(slider().style.getPropertyValue('--pct')).toBe('0%')
    expect(screen.queryByRole('button', { name: VOICE_BOOST_TEXTS.off })).toBeNull()
    await tick()
    expect(atStage.at(-1)).toEqual({ type: 'voice_boost', amount: 0 })
  })
})

describe('aviso: SOLO si algo no se pudo activar', () => {
  it('panel: si no se pudo → aviso; con la barra en 0 no hay aviso', async () => {
    fake.setResult = 'unavailable'
    mount()
    await move(40)
    expect(screen.getByRole('status')).toHaveTextContent(VOICE_BOOST_TEXTS.unavailable)
    await move(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('panel: si se activó, no hay aviso', async () => {
    mount()
    await move(40)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stage: al abrirse recibe el valor actual; si contesta unavailable → "Hacé un clic en la ventana del stage"', async () => {
    const { rerenderOpen } = mount(false)
    await move(60)
    rerenderOpen(true)
    atStage = []
    stage.send({ type: 'ready' })
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', amount: 60 })

    stage.send({ type: 'voice_boost_status', status: 'unavailable' })
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent(VOICE_BOOST_TEXTS.stageUnavailable)

    stage.send({ type: 'voice_boost_status', status: 'active' })
    await tick()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stage: al cerrarse se olvida su aviso', async () => {
    const { rerenderOpen } = mount(true)
    await move(60)
    stage.send({ type: 'voice_boost_status', status: 'unavailable' })
    await tick()
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerenderOpen(false)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
