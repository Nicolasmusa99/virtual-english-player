// @vitest-environment jsdom
// Vista del alumno v2 — el nombre del video (lo ven profes y alumnos):
//   · al subirlo: "Nombre del video" en el cuadro de progreso, con el del archivo limpio; lo
//     que escriba el admin mientras se transcribe se guarda al terminar (PATCH originalName).
//   · después: "Cambiar nombre" en Mi biblioteca (solo el admin).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

vi.mock('@vercel/blob/client', () => ({ upload: vi.fn(async () => ({ url: 'https://blob.example/videos/vid-1/x.mp4' })) }))

import Player from '@/app/page'
import LibraryList from '@/app/LibraryList'
import { VIDEO_NAME_TEXTS } from '@/app/VideoNameDialog'
import { VIDEO_NAME_ERROR } from '@/lib/videoName'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tick = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms))
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello there\n'

let fetchMock: ReturnType<typeof vi.fn>
const calls = (method: string, url?: string) => fetchMock.mock.calls
  .filter(([u, i]) => (i?.method ?? 'GET') === method && (!url || String(u) === url))
  .map(([, i]) => JSON.parse(String(i.body)))

// La sonda de duración de handleFiles: jsdom no lee metadatos, así que se la simula (1 min).
function mockVideoProbe() {
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
    if (tag !== 'video') return orig(tag, opts)
    const el: Record<string, unknown> = { preload: '', duration: 60, onloadedmetadata: null, onerror: null }
    Object.defineProperty(el, 'src', { set() { Promise.resolve().then(() => (el.onloadedmetadata as () => void)?.()) }, get: () => '' })
    return el as unknown as HTMLElement
  })
}

describe('al subir: "Nombre del video" mientras se transcribe', () => {
  let releaseTranscribe: () => void
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mockVideoProbe()
    const transcribed = new Promise<Response>((r) => { releaseTranscribe = () => r(json(200, { srt: SRT })) })
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'
      if (url === '/api/videos' && m === 'POST') return Promise.resolve(json(200, { id: 'vid-1' }))
      if (url === '/api/transcribe') return transcribed
      return Promise.resolve(json(200, { ok: true }))
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  async function drop(name: string) {
    const { container } = render(<Player />)
    const file = new File(['x'], name, { type: 'video/mp4' })
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
      await tick()
    })
    return screen.getByLabelText(/Nombre del video/) as HTMLInputElement
  }

  it('arranca con el nombre del archivo limpio (y así se crea el video)', async () => {
    const input = await drop('comercial_del_auto_FINAL.mp4')
    expect(input.value).toBe('Comercial del auto FINAL')
    expect(screen.getByText('El archivo era "comercial_del_auto_FINAL.mp4". El nombre se guarda al terminar.')).toBeInTheDocument()
    expect(calls('POST', '/api/videos')[0].originalName).toBe('Comercial del auto FINAL')
    await act(async () => { releaseTranscribe(); await tick(50) })
  })

  it('lo que escribe el admin se guarda al terminar', async () => {
    const input = await drop('comercial_del_auto_FINAL.mp4')
    fireEvent.change(input, { target: { value: '  Comercial   del auto ' } })
    expect(calls('PATCH', '/api/videos/vid-1').some((b) => 'originalName' in b)).toBe(false) // todavía no
    await act(async () => { releaseTranscribe(); await tick(50) })
    expect(calls('PATCH', '/api/videos/vid-1')).toContainEqual({ originalName: 'Comercial del auto' })
  })

  it('si no lo cambia (o lo deja vacío), no hace falta guardarlo de nuevo', async () => {
    const input = await drop('let-it-be.mp4')
    expect(input.value).toBe('Let it be')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByText('Si lo dejás vacío, queda el nombre del archivo.')).toBeInTheDocument()
    await act(async () => { releaseTranscribe(); await tick(50) })
    expect(calls('PATCH', '/api/videos/vid-1')).toEqual([{ storageUrl: 'https://blob.example/videos/vid-1/x.mp4' }])
  })
})

describe('Mi biblioteca: "Cambiar nombre"', () => {
  const VIDEO = { id: 'v1', originalName: 'Comercial del auto FINAL', status: 'ready', phraseCount: 6, sharedType: null, sharedLevel: null, publishedAt: null }
  beforeEach(() => {
    fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(json(200, { ok: true, originalName: JSON.parse(String(init?.body ?? '{}')).originalName })))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('el admin lo cambia: PATCH con el nombre limpio, cierra y avisa al padre', async () => {
    const onChanged = vi.fn()
    render(<LibraryList videos={[VIDEO]} role="admin" onOpen={() => {}} onDelete={() => {}} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }))
    const dlg = screen.getByRole('dialog', { name: VIDEO_NAME_TEXTS.title })
    const input = within(dlg).getByLabelText(VIDEO_NAME_TEXTS.label) as HTMLInputElement
    expect(input.value).toBe('Comercial del auto FINAL')
    fireEvent.change(input, { target: { value: ' Comercial del auto ' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: VIDEO_NAME_TEXTS.save })) })
    expect(fetchMock).toHaveBeenCalledWith('/api/videos/v1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ originalName: 'Comercial del auto' }) }))
    expect(onChanged).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('vacío → aviso, sin pedir nada', async () => {
    render(<LibraryList videos={[VIDEO]} role="admin" onOpen={() => {}} onDelete={() => {}} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre' }))
    const dlg = screen.getByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText(VIDEO_NAME_TEXTS.label), { target: { value: '  ' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: VIDEO_NAME_TEXTS.save })) })
    expect(within(dlg).getByRole('alert')).toHaveTextContent(VIDEO_NAME_ERROR)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un profe no ve "Cambiar nombre"', () => {
    render(<LibraryList videos={[VIDEO]} role="profesor" onOpen={() => {}} onDelete={() => {}} onChanged={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Cambiar nombre' })).toBeNull()
  })
})
