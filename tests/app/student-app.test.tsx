// @vitest-environment jsdom
// Vista del alumno (E3) — StudentApp (inicio + material) y StudentPlayer (player recortado),
// y el desvío en page.tsx: un alumno ve SU vista y NADA del profe.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { useSessionMock, signOutMock } from '../setup'
import Player from '@/app/page'
import StudentApp, { STUDENT_TEXTS } from '@/app/StudentApp'
import StudentPlayer, { PLAYER_TEXTS, type StudentVideoData } from '@/app/StudentPlayer'

const VID_A = '11111111-2222-4333-8444-555555555555'
const VID_B = '66666666-2222-4333-8444-555555555555'
const today = new Date().toISOString()
const MATERIAL = [
  { videoId: VID_A, originalName: 'Frozen (demo).mp4', sharedType: 'pelicula', sharedLevel: 'medium', durationSec: 185, assignedAt: today },
  { videoId: VID_B, originalName: 'Let it Go.webm', sharedType: 'cancion', sharedLevel: 'beginner', durationSec: null, assignedAt: today },
]
const DETAIL = {
  video: { id: VID_A, originalName: 'Frozen (demo).mp4', storageUrl: 'https://blob.example/frozen.mp4', durationSec: 185 },
  captions: { phrases: [{ start: 1, end: 3, text: 'Hello there' }, { start: 4, end: 6, text: 'Second line' }], delay: 0 },
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>
let listResponse: () => Response
let detailResponse: () => Response | Promise<Response>

beforeEach(() => {
  listResponse = () => json(200, { material: MATERIAL })
  detailResponse = () => json(200, DETAIL)
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/student/classes')) return Promise.resolve(json(200, { classes: [] })) // calendario (C3)
    if (url === '/api/student/material') return Promise.resolve(listResponse())
    if (url.startsWith('/api/student/material/')) return Promise.resolve(detailResponse())
    return Promise.resolve(json(403, { error: 'No autorizado' }))
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('requestAnimationFrame', () => 1) // el loop se maneja a mano con eventos
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  useSessionMock.mockReturnValue({ data: { user: { email: 'test@example.com', role: 'admin' } }, status: 'authenticated' })
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const calledUrls = () => fetchMock.mock.calls.map(([u]) => String(u))

// <video> falso: jsdom no reproduce. play/pause cambian `paused` y disparan los eventos.
function fakeVideo(video: HTMLVideoElement) {
  const st = { t: 0, paused: true }
  Object.defineProperty(video, 'currentTime', { get: () => st.t, set: (v: number) => { st.t = v; video.dispatchEvent(new Event('seeked')) }, configurable: true })
  Object.defineProperty(video, 'paused', { get: () => st.paused, configurable: true })
  Object.defineProperty(video, 'ended', { get: () => false, configurable: true })
  Object.defineProperty(video, 'duration', { get: () => 185, configurable: true })
  video.play = vi.fn(() => { st.paused = false; video.dispatchEvent(new Event('play')); return Promise.resolve() })
  video.pause = vi.fn(() => { st.paused = true; video.dispatchEvent(new Event('pause')) })
  return st
}

// ─────────────────────────────────────────────────────────────────────────────
describe('page.tsx: el alumno entra a SU vista y a nada del profe', () => {
  it('rol alumno → "Hola, Martina" y ninguna herramienta del profe; solo se llama a /api/student/**', async () => {
    useSessionMock.mockReturnValue({ data: { user: { name: 'Martina López', email: 'm@x.com', role: 'alumno' } }, status: 'authenticated' })
    const { container } = render(<Player />)
    await flush()
    expect(screen.getByRole('heading', { name: 'Hola, Martina' })).toBeInTheDocument()
    for (const teacherThing of [/Armar ejercicios/, /Mi biblioteca/, /Biblioteca compartida/, /Usuarios/, /Arrastrá el video/, /Mis alumnos/, /Tus clases de hoy/, /Subir video/]) {
      expect(container.textContent).not.toMatch(teacherThing)
    }
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(calledUrls().length).toBeGreaterThan(0)
    expect(calledUrls().every((u) => u.startsWith('/api/student/'))).toBe(true)
  })

  it('rol profesor → sigue viendo SU inicio (el desvío no lo afecta)', async () => {
    useSessionMock.mockReturnValue({ data: { user: { name: 'Profe', email: 'p@x.com', role: 'profesor' } }, status: 'authenticated' })
    const { container } = render(<Player />)
    await flush()
    expect(container.textContent).toMatch(/Tus clases de hoy/) // rediseño: el inicio del profe es "Hoy"
    expect(screen.queryByRole('heading', { name: /^Hola/ })).toBeNull()
    expect(calledUrls().some((u) => u.startsWith('/api/student/'))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('StudentApp — inicio', () => {
  it('lista completa: nombre sin extensión, tipo, nivel, duración y "asignado"', async () => {
    render(<StudentApp name="Martina López" email="m@x.com" />)
    await flush()
    expect(screen.getByText(STUDENT_TEXTS.intro)).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /Frozen \(demo\)/ })
    expect(card).not.toHaveTextContent('.mp4')
    for (const t of ['Película', 'Intermedio', '3 min', 'Asignado hoy']) expect(card).toHaveTextContent(t)
    const card2 = screen.getByRole('button', { name: /Let it Go/ })
    expect(card2).toHaveTextContent('Canción')
    expect(card2).not.toHaveTextContent('min') // sin duración → sin etiqueta
  })

  it('sin nombre → saluda con la parte local del email', async () => {
    render(<StudentApp name={null} email="lucia@x.com" />)
    await flush()
    expect(screen.getByRole('heading', { name: 'Hola, lucia' })).toBeInTheDocument()
  })

  it('sin material → "Todavía no tenés material"', async () => {
    listResponse = () => json(200, { material: [] })
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    expect(screen.getByText(STUDENT_TEXTS.emptyTitle)).toBeInTheDocument()
    expect(screen.getByText(STUDENT_TEXTS.introEmpty)).toBeInTheDocument()
  })

  it('error al cargar → mensaje + Reintentar (que vuelve a pedir)', async () => {
    listResponse = () => json(500, {})
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    expect(screen.getByText(STUDENT_TEXTS.listErrorTitle)).toBeInTheDocument()
    listResponse = () => json(200, { material: MATERIAL })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: STUDENT_TEXTS.retry })) })
    await flush()
    expect(screen.getByRole('button', { name: /Frozen/ })).toBeInTheDocument()
  })

  it('"Salir" cierra la sesión', async () => {
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: STUDENT_TEXTS.signOut }))
    expect(signOutMock).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('StudentApp — abrir un video', () => {
  it('tocar la tarjeta pide ESE video y abre el player', async () => {
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    expect(calledUrls()).toContain(`/api/student/material/${VID_A}`)
    expect(screen.getByRole('button', { name: PLAYER_TEXTS.play })).toBeInTheDocument()
  })

  it('404 (lo quitaron) → aviso y la lista se refresca', async () => {
    detailResponse = () => json(404, { error: 'Material no encontrado' })
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    listResponse = () => json(200, { material: [MATERIAL[1]] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent(STUDENT_TEXTS.videoGone)
    expect(screen.queryByRole('button', { name: /Frozen/ })).toBeNull()
  })

  it('tras el 404, la lista se refresca SIN parpadear "Cargando…" (la actual queda hasta que llega la nueva)', async () => {
    detailResponse = () => json(404, { error: 'Material no encontrado' })
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    let release!: () => void
    const pending = new Promise<Response>((r) => { release = () => r(json(200, { material: [MATERIAL[1]] })) })
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/student/material') return pending
      return Promise.resolve(detailResponse())
    })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    // refresco en curso: la lista de antes sigue en pantalla, sin "Cargando…"
    expect(screen.queryByText(STUDENT_TEXTS.loading)).toBeNull()
    expect(screen.getByRole('button', { name: /Let it Go/ })).toBeInTheDocument()
    await act(async () => { release() })
    await flush()
    expect(screen.queryByRole('button', { name: /Frozen/ })).toBeNull()
  })

  it('si ese refresco silencioso falla, se conserva la lista (sin pantalla de error)', async () => {
    detailResponse = () => json(404, { error: 'Material no encontrado' })
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    listResponse = () => json(500, {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    expect(screen.queryByText(STUDENT_TEXTS.listErrorTitle)).toBeNull()
    expect(screen.getByRole('button', { name: /Let it Go/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(STUDENT_TEXTS.videoGone)
  })

  it('respuesta con forma inválida o error → aviso genérico, no abre nada', async () => {
    detailResponse = () => json(200, { video: { id: VID_A } }) // sin storageUrl
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent(STUDENT_TEXTS.videoError)
    expect(screen.queryByRole('button', { name: PLAYER_TEXTS.play })).toBeNull()
  })

  it('doble toque mientras abre → UN solo pedido', async () => {
    let release!: () => void
    detailResponse = () => new Promise<Response>((r) => { release = () => r(json(200, DETAIL)) })
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    const card = screen.getByRole('button', { name: /Frozen/ })
    fireEvent.click(card)
    fireEvent.click(card)
    fireEvent.click(screen.getByRole('button', { name: /Let it Go/ }))
    expect(calledUrls().filter((u) => u.startsWith('/api/student/material/'))).toHaveLength(1)
    await act(async () => { release() })
    await flush()
  })

  it('"← Mi material" vuelve a la lista', async () => {
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Frozen/ })) })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.back }))
    expect(screen.getByRole('heading', { name: 'Hola, Martina' })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('StudentPlayer — play/pausa, stop, volumen, barra de tiempo y CC', () => {
  const DATA: StudentVideoData = {
    id: VID_A, originalName: 'Frozen (demo).mp4', storageUrl: 'https://blob.example/frozen.mp4',
    durationSec: 185, phrases: DETAIL.captions.phrases, delay: 0,
  }
  function mountPlayer(data: StudentVideoData = DATA) {
    const onBack = vi.fn()
    const r = render(<StudentPlayer data={data} onBack={onBack} />)
    const video = r.container.querySelector('video') as HTMLVideoElement
    const st = fakeVideo(video)
    return { ...r, video, st, onBack }
  }

  it('los ÚNICOS botones son: volver, play, stop, bajar y subir volumen, CC (sin herramientas del profe)', () => {
    mountPlayer()
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual([PLAYER_TEXTS.back, PLAYER_TEXTS.play, PLAYER_TEXTS.stop, PLAYER_TEXTS.volDown, PLAYER_TEXTS.volUp, PLAYER_TEXTS.cc])
    expect(document.querySelector('input')).toBeNull() // ni sliders ni campos editables
  })

  it('el video usa la URL del material, sin controles nativos, y playsInline (iPhone)', () => {
    const { video } = mountPlayer()
    expect(video.getAttribute('src')).toBe(DATA.storageUrl)
    expect(video.hasAttribute('controls')).toBe(false)
    expect(video.hasAttribute('playsinline')).toBe(true)
  })

  it('play ↔ pausa', async () => {
    const { video } = mountPlayer()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.play })) })
    expect(video.play).toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.pause })) })
    expect(video.pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: PLAYER_TEXTS.play })).toBeInTheDocument()
  })

  it('stop = pausa y vuelve al principio', async () => {
    const { video, st } = mountPlayer()
    st.t = 50
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.play })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.stop })) })
    expect(video.pause).toHaveBeenCalled()
    expect(st.t).toBe(0)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('volumen −/+ en pasos del 10%, con tope en 0 y 100 (los botones se desactivan)', async () => {
    const { video } = mountPlayer()
    const up = screen.getByRole('button', { name: PLAYER_TEXTS.volUp })
    const down = screen.getByRole('button', { name: PLAYER_TEXTS.volDown })
    expect(up).toBeDisabled() // arranca en 100%
    fireEvent.click(down)
    expect(video.volume).toBeCloseTo(0.9, 5)
    expect(screen.getByRole('meter', { name: PLAYER_TEXTS.volume })).toHaveAttribute('aria-valuenow', '90')
    for (let i = 0; i < 12; i++) fireEvent.click(down)
    expect(video.volume).toBe(0)
    expect(down).toBeDisabled()
    fireEvent.click(up)
    expect(video.volume).toBeCloseTo(0.1, 5)
  })

  it('subtítulos del profe visibles en su momento (arrancan prendidos)', async () => {
    const { st, video } = mountPlayer()
    expect(screen.getByRole('button', { name: PLAYER_TEXTS.cc })).toHaveAttribute('aria-pressed', 'true')
    st.t = 2
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.getByTestId('student-sub')).toHaveTextContent('Hello there')
    st.t = 5
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.getByTestId('student-sub')).toHaveTextContent('Second line')
  })

  it('CC apaga y prende los subtítulos (sin tocar el video)', async () => {
    const { st, video } = mountPlayer()
    st.t = 2
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    const cc = screen.getByRole('button', { name: PLAYER_TEXTS.cc })
    fireEvent.click(cc)
    expect(cc).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(PLAYER_TEXTS.ccOff)).toBeInTheDocument()
    expect(screen.queryByTestId('student-sub')).toBeNull()
    st.t = 5 // sigue apagado aunque cambie la frase
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.queryByTestId('student-sub')).toBeNull()
    expect(video.play).not.toHaveBeenCalled()
    expect(video.pause).not.toHaveBeenCalled()
    expect(st.t).toBe(5)
    fireEvent.click(cc)
    expect(cc).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(PLAYER_TEXTS.ccOn)).toBeInTheDocument()
    expect(screen.getByTestId('student-sub')).toHaveTextContent('Second line')
  })

  it('respeta el delay del profe', async () => {
    const { st, video } = mountPlayer({ ...DATA, delay: 1 })
    st.t = 1.5 // con +1 s, "Hello there" empieza en 2
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.queryByTestId('student-sub')).toBeNull()
    st.t = 3.5
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.getByTestId('student-sub')).toHaveTextContent('Hello there')
  })

  // La barra mide 400 px desde x=100: tocar en x = 100 + 400·f lleva a f·185 s.
  function mockBarRect() {
    const bar = screen.getByRole('slider', { name: PLAYER_TEXTS.time })
    bar.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 28, right: 500, bottom: 28, x: 100, y: 0, toJSON: () => ({}) })
    return bar
  }

  it('barra de tiempo: avanza con el video', async () => {
    const { st, video } = mountPlayer()
    st.t = 92.5
    await act(async () => { video.dispatchEvent(new Event('seeked')) })
    const bar = screen.getByRole('slider', { name: PLAYER_TEXTS.time })
    expect(bar).toHaveAttribute('aria-valuenow', '93')
    expect(bar).toHaveAttribute('aria-valuemax', '185')
    expect(bar).toHaveAttribute('aria-valuetext', '1:32 de 3:05')
    expect(screen.getByText('1:32')).toBeInTheDocument()
    expect(screen.getByText('3:05')).toBeInTheDocument()
  })

  it('tocar la barra lleva el video a ese momento (y el subtítulo sigue al nuevo tiempo)', async () => {
    const { st } = mountPlayer()
    const bar = mockBarRect()
    await act(async () => { fireEvent.pointerDown(bar, { clientX: 300, pointerId: 1 }) }) // mitad
    fireEvent.pointerUp(bar, { pointerId: 1 })
    expect(st.t).toBeCloseTo(92.5, 5)
    expect(screen.getByText('1:32')).toBeInTheDocument()
    await act(async () => { fireEvent.pointerDown(bar, { clientX: 100 + 400 * (2 / 185), pointerId: 1 }) }) // segundo 2
    fireEvent.pointerUp(bar, { pointerId: 1 })
    expect(st.t).toBeCloseTo(2, 5)
    expect(screen.getByTestId('student-sub')).toHaveTextContent('Hello there')
  })

  it('arrastrar sobre la barra va siguiendo el dedo; al soltar, moverse ya no salta', async () => {
    const { st } = mountPlayer()
    const bar = mockBarRect()
    await act(async () => { fireEvent.pointerDown(bar, { clientX: 140, pointerId: 1 }) })
    await act(async () => { fireEvent.pointerMove(bar, { clientX: 400, pointerId: 1 }) })
    expect(st.t).toBeCloseTo(138.75, 5)
    await act(async () => { fireEvent.pointerMove(bar, { clientX: 900, pointerId: 1 }) }) // fuera → el final
    expect(st.t).toBeCloseTo(185, 5)
    fireEvent.pointerUp(bar, { pointerId: 1 })
    await act(async () => { fireEvent.pointerMove(bar, { clientX: 200, pointerId: 1 }) })
    expect(st.t).toBeCloseTo(185, 5)
  })

  it('tocar la barra mientras reproduce: salta y SIGUE reproduciendo', async () => {
    const { st, video } = mountPlayer()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.play })) })
    const bar = mockBarRect()
    await act(async () => { fireEvent.pointerDown(bar, { clientX: 300, pointerId: 1 }) })
    fireEvent.pointerUp(bar, { pointerId: 1 })
    expect(st.t).toBeCloseTo(92.5, 5)
    expect(video.pause).not.toHaveBeenCalled()
    expect(st.paused).toBe(false)
  })

  it('con el teclado: → / ← mueven 5 s, Inicio / Fin van a las puntas', async () => {
    const { st } = mountPlayer()
    const bar = screen.getByRole('slider', { name: PLAYER_TEXTS.time })
    st.t = 10
    await act(async () => { fireEvent.keyDown(bar, { key: 'ArrowRight' }) })
    expect(st.t).toBe(15)
    await act(async () => { fireEvent.keyDown(bar, { key: 'ArrowLeft' }) })
    await act(async () => { fireEvent.keyDown(bar, { key: 'ArrowLeft' }) })
    expect(st.t).toBe(5)
    await act(async () => { fireEvent.keyDown(bar, { key: 'End' }) })
    expect(st.t).toBe(185)
    await act(async () => { fireEvent.keyDown(bar, { key: 'Home' }) })
    expect(st.t).toBe(0)
  })

  it('sin duración conocida la barra no salta', async () => {
    const { st, video } = mountPlayer({ ...DATA, durationSec: null })
    Object.defineProperty(video, 'duration', { get: () => NaN, configurable: true })
    const bar = mockBarRect()
    st.t = 7
    await act(async () => { fireEvent.pointerDown(bar, { clientX: 300, pointerId: 1 }) })
    await act(async () => { fireEvent.keyDown(bar, { key: 'ArrowRight' }) })
    expect(st.t).toBe(7)
  })

  it('si el video no carga → aviso', async () => {
    const { video } = mountPlayer()
    await act(async () => { video.dispatchEvent(new Event('error')) })
    expect(screen.getByRole('alert')).toHaveTextContent(PLAYER_TEXTS.videoError)
  })

  it('"← Mi material" llama a volver', () => {
    const { onBack } = mountPlayer()
    fireEvent.click(screen.getByRole('button', { name: PLAYER_TEXTS.back }))
    expect(onBack).toHaveBeenCalled()
    expect(within(document.body).queryByText('Hola')).toBeNull()
  })
})
