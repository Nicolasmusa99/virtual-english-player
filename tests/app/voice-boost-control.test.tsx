// @vitest-environment jsdom
// "Sonido" (P2 + P3) — la sección del panel (app/VoiceBoostControl.tsx).
// El audio real se prueba en tests/lib/voiceBoost.test.ts; acá el manejador de audio
// es falso y se mira: ajustes rápidos, filtro de voz (aparte, se combina con todo),
// ajuste manual de 3 bandas, "Personalizado", que cada cambio llegue al audio del
// panel, al stage y se RECUERDE, que un ajuste recordado se aplique con el primer
// gesto, y que el aviso aparezca SOLO si algo no se pudo activar.
import React, { createRef } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { EQ_FLAT, EQ_PRESETS, EQ_STORAGE_KEY, type EqBands, type EqSetting, type VoiceBoostStatus } from '@/lib/voiceBoost'
import { StageChannel, type ChannelMsg } from '@/lib/stageChannel'

const fake = vi.hoisted(() => ({
  eq: { low: 0, mid: 0, high: 0, denoise: false } as { low: number; mid: number; high: number; denoise: boolean },
  setResult: 'active' as string,
  attachResult: 'off' as string,
  attach: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  set: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))
vi.mock('@/lib/voiceBoost', async (orig) => {
  const real = await orig<typeof import('@/lib/voiceBoost')>()
  return {
    ...real,
    sharedVoiceBoost: () => ({
      get eq() { return fake.eq },
      attach: fake.attach,
      set: fake.set,
    }),
  }
})
import VoiceBoostControl, { SOUND_TEXTS, fmtDb } from '@/app/VoiceBoostControl'

const tick = () => act(() => new Promise<void>(r => setTimeout(r, 15)))
const S = (b: EqBands, denoise = false): EqSetting => ({ low: b.low, mid: b.mid, high: b.high, denoise })
const off = (e: EqSetting) => e.low === 0 && e.mid === 0 && e.high === 0 && !e.denoise
let stage: StageChannel
let atStage: ChannelMsg[]

beforeEach(() => {
  localStorage.clear()
  fake.eq = { ...EQ_FLAT }
  fake.setResult = 'active'
  fake.attachResult = 'off'
  fake.attach = vi.fn(async () => fake.attachResult as VoiceBoostStatus)
  fake.set = vi.fn(async (e: EqSetting) => { fake.eq = e; return (off(e) ? 'off' : fake.setResult) as VoiceBoostStatus })
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
const presetBtn = (name: string) => screen.getByRole('button', { name })
const filter = () => screen.getByRole('switch', { name: new RegExp(SOUND_TEXTS.denoise) })
const state = () => screen.getByTestId('sound-state').textContent
const openManual = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: SOUND_TEXTS.manual })) }) }
const band = (name: string) => screen.getByLabelText(new RegExp('^' + name)) as HTMLInputElement
const moveBand = async (name: string, v: number) => { await act(async () => { fireEvent.change(band(name), { target: { value: String(v) } }) }) }
const choose = async (name: string) => { await act(async () => { fireEvent.click(presetBtn(name)) }) }
const toggleFilter = async () => { await act(async () => { fireEvent.click(filter()) }) }
const saved = () => JSON.parse(localStorage.getItem(EQ_STORAGE_KEY) ?? 'null')

describe('estado inicial', () => {
  it('Original, filtro apagado, ajuste manual cerrado, sin aviso; engancha (no fuerza) el video del panel', async () => {
    const { video } = mount()
    await tick()
    expect(screen.getByText(SOUND_TEXTS.title)).toBeInTheDocument()
    expect(state()).toBe('Original')
    expect(presetBtn('Original')).toHaveAttribute('aria-pressed', 'true')
    expect(presetBtn('Voces claras')).toHaveAttribute('aria-pressed', 'false')
    expect(filter()).toHaveAttribute('aria-checked', 'false')
    expect(filter()).toHaveTextContent(SOUND_TEXTS.denoiseDesc)
    expect(screen.getByRole('button', { name: SOUND_TEXTS.manual })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(fake.attach).toHaveBeenCalledWith(video)
    expect(fake.set).not.toHaveBeenCalled() // sin tocar nada no se toca el audio
  })

  it('volver al player conserva el ajuste del momento (con filtro)', () => {
    fake.eq = S(EQ_PRESETS.veryClear, true)
    mount()
    expect(state()).toBe('Voces muy claras' + SOUND_TEXTS.withDenoise)
    expect(presetBtn('Voces muy claras')).toHaveAttribute('aria-pressed', 'true')
    expect(filter()).toHaveAttribute('aria-checked', 'true')
  })
})

describe('ajustes rápidos', () => {
  it('elegir uno lo aplica en el panel, lo manda al stage y lo recuerda', async () => {
    mount()
    await choose('Voces claras')
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.clear))
    expect(state()).toBe('Voces claras')
    expect(presetBtn('Voces claras')).toHaveAttribute('aria-pressed', 'true')
    expect(saved()).toEqual(S(EQ_PRESETS.clear))
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', eq: S(EQ_PRESETS.clear) })
  })

  it('Original (sin filtro) vuelve a apagado y borra lo recordado', async () => {
    mount()
    await choose('Voces muy claras')
    await choose('Original')
    expect(fake.set).toHaveBeenLastCalledWith(EQ_FLAT)
    expect(localStorage.getItem(EQ_STORAGE_KEY)).toBeNull()
    await tick()
    expect(atStage.at(-1)).toEqual({ type: 'voice_boost', eq: EQ_FLAT })
  })

  it('elegir un ajuste rápido cierra el ajuste manual (deja lugar a la lista de frases)', async () => {
    mount()
    await openManual()
    expect(screen.getAllByRole('slider')).toHaveLength(3)
    await choose('Voces claras')
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

describe('filtro de voz (P3)', () => {
  it('prenderlo: se aplica con el ajuste que haya, va al stage, se recuerda y se nombra', async () => {
    mount()
    await choose('Voces muy claras')
    await toggleFilter()
    const e = S(EQ_PRESETS.veryClear, true)
    expect(fake.set).toHaveBeenLastCalledWith(e)
    expect(filter()).toHaveAttribute('aria-checked', 'true')
    expect(state()).toBe('Voces muy claras + filtro')
    expect(saved()).toEqual(e)
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', eq: e })
  })

  it('es aparte: cambiar de ajuste rápido lo deja prendido', async () => {
    mount()
    await toggleFilter()
    await choose('Voces claras')
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.clear, true))
    expect(filter()).toHaveAttribute('aria-checked', 'true')
  })

  it('solo el filtro (Original + filtro) cuenta como prendido y se recuerda', async () => {
    mount()
    await toggleFilter()
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.original, true))
    expect(state()).toBe('Original + filtro')
    expect(saved()).toEqual(S(EQ_PRESETS.original, true))
  })

  it('con el ajuste manual también: mover una barra conserva el filtro', async () => {
    fake.eq = S(EQ_PRESETS.clear, true)
    mount()
    await openManual()
    await moveBand('Agudos', -3)
    expect(fake.set).toHaveBeenLastCalledWith({ ...S(EQ_PRESETS.clear, true), high: -3 })
    expect(state()).toBe('Personalizado + filtro')
  })

  it('apagarlo vuelve al ajuste solo', async () => {
    fake.eq = S(EQ_PRESETS.veryClear, true)
    mount()
    await toggleFilter()
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.veryClear))
    expect(state()).toBe('Voces muy claras')
  })

  it('si el navegador no puede usar el filtro (partial) → aviso claro; el resto sigue', async () => {
    fake.setResult = 'partial'
    mount()
    await toggleFilter()
    expect(screen.getByRole('status')).toHaveTextContent(SOUND_TEXTS.denoiseUnavailable)
  })

  it('stage: si el stage no pudo usar el filtro → el mismo aviso', async () => {
    const { rerenderOpen } = mount(false)
    await toggleFilter()
    rerenderOpen(true)
    stage.send({ type: 'voice_boost_status', status: 'partial' })
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent(SOUND_TEXTS.denoiseUnavailable)
  })
})

describe('ajuste manual', () => {
  it('3 barras (Graves / Medios / Agudos) de −24 a +12 con el valor del ajuste', async () => {
    fake.eq = S(EQ_PRESETS.clear)
    mount()
    await openManual()
    const eq = screen.getByRole('button', { name: SOUND_TEXTS.manual }).getAttribute('aria-controls')!
    const box = document.getElementById(eq)!
    const sliders = within(box).getAllByRole('slider') as HTMLInputElement[]
    expect(sliders).toHaveLength(3)
    for (const s of sliders) expect([s.min, s.max, s.step]).toEqual(['-24', '12', '1'])
    expect([band('Graves').value, band('Medios').value, band('Agudos').value]).toEqual(['-10', '3', '-7'])
    expect(band('Graves')).toHaveAttribute('aria-valuetext', '−10 dB')
    expect(box).toHaveTextContent('+3 dB')
    expect(box).toHaveTextContent(SOUND_TEXTS.limiter)
  })

  it('mover una barra → Personalizado; se aplica, va al stage y se recuerda', async () => {
    fake.eq = S(EQ_PRESETS.clear)
    mount()
    await openManual()
    await moveBand('Graves', 4)
    const e = { ...S(EQ_PRESETS.clear), low: 4 }
    expect(fake.set).toHaveBeenLastCalledWith(e)
    expect(state()).toBe(SOUND_TEXTS.custom)
    for (const n of ['Original', 'Voces claras', 'Voces muy claras']) expect(presetBtn(n)).toHaveAttribute('aria-pressed', 'false')
    expect(saved()).toEqual(e)
    expect(band('Graves')).toHaveAttribute('aria-valuetext', '+4 dB')
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', eq: e })
  })

  it('volver a un valor de ajuste rápido lo reconoce otra vez', async () => {
    fake.eq = { ...S(EQ_PRESETS.clear), low: 4 }
    mount()
    await openManual()
    await moveBand('Graves', -10)
    expect(state()).toBe('Voces claras')
  })

  it('"Volver a Original" deja las bandas planas (el filtro, como estaba) y cierra el manual', async () => {
    fake.eq = { low: 4, mid: 2, high: -3, denoise: true }
    mount()
    await openManual()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: SOUND_TEXTS.reset })) })
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.original, true))
    expect(state()).toBe('Original + filtro')
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('fmtDb: signo menos tipográfico, + para subir, 0 sin signo', () => {
    expect([fmtDb(-10), fmtDb(3), fmtDb(0)]).toEqual(['−10 dB', '+3 dB', '0 dB'])
  })
})

describe('ajuste recordado (de otra vez)', () => {
  it('espera el primer gesto (clic o tecla en cualquier parte) y ahí lo aplica', async () => {
    fake.eq = S(EQ_PRESETS.clear, true)
    fake.attachResult = 'pending'
    mount()
    await tick()
    expect(state()).toBe('Voces claras + filtro')
    expect(fake.set).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull() // esperar un gesto no es un error
    await act(async () => { fireEvent.pointerDown(document.body) })
    expect(fake.set).toHaveBeenCalledTimes(1)
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.clear, true))
    await tick()
    await act(async () => { fireEvent.pointerDown(document.body) }) // ya aplicado: no insiste
    expect(fake.set).toHaveBeenCalledTimes(1)
  })

  it('una tecla (p. ej. espacio para dar play) también sirve de gesto', async () => {
    fake.eq = S(EQ_PRESETS.veryClear)
    fake.attachResult = 'pending'
    mount()
    await tick()
    await act(async () => { fireEvent.keyDown(window, { key: ' ' }) })
    expect(fake.set).toHaveBeenLastCalledWith(S(EQ_PRESETS.veryClear))
  })
})

describe('aviso: SOLO si algo no se pudo activar', () => {
  it('panel: si no se pudo → aviso; apagado no hay aviso', async () => {
    fake.setResult = 'unavailable'
    mount()
    await choose('Voces claras')
    expect(screen.getByRole('status')).toHaveTextContent(SOUND_TEXTS.unavailable)
    await choose('Original')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('panel: si se activó, no hay aviso', async () => {
    mount()
    await choose('Voces claras')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stage: al abrirse recibe el ajuste actual; si contesta unavailable → "Hacé un clic en la ventana del stage"', async () => {
    const { rerenderOpen } = mount(false)
    await choose('Voces muy claras')
    rerenderOpen(true)
    atStage = []
    stage.send({ type: 'ready' })
    await tick()
    expect(atStage).toContainEqual({ type: 'voice_boost', eq: S(EQ_PRESETS.veryClear) })

    stage.send({ type: 'voice_boost_status', status: 'unavailable' })
    await tick()
    expect(screen.getByRole('status')).toHaveTextContent(SOUND_TEXTS.stageUnavailable)

    stage.send({ type: 'voice_boost_status', status: 'active' })
    await tick()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stage: al cerrarse se olvida su aviso', async () => {
    const { rerenderOpen } = mount(true)
    await choose('Voces claras')
    stage.send({ type: 'voice_boost_status', status: 'unavailable' })
    await tick()
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerenderOpen(false)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
