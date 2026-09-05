// Bloque F — US-036: validación de DURACIÓN antes de subir [Corregida 2026-09-05]
// El chequeo pasó de tamaño (MB) a duración (min): el límite real es ~15 min por el
// maxDuration=300s de /api/transcribe, no el peso del archivo.
// TC-083:  video > 15 min → aviso informativo no bloqueante con la duración detectada
// TC-083b: "Continuar de todos modos" → transcripción inicia
// TC-083c: "Cancelar" → banner desaparece, drop zone limpio (video state reseteado)
// TC-084:  video ≤ 15 min → sin aviso, flujo continúa normalmente
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

// Crea un File de video con size mockeado sin allocar memoria real.
function fakeVideoFile(name: string): File {
  const f = new File(['x'], name, { type: 'video/mp4' })
  Object.defineProperty(f, 'size', { value: 6 * 1024 * 1024 })
  return f
}

// handleFiles lee la duración con un <video> sonda (probe.src → onloadedmetadata).
// jsdom no dispara loadedmetadata ni calcula duration, así que interceptamos
// document.createElement('video') y devolvemos una sonda que resuelve la duración pedida.
function mockVideoProbe(durationSec: number) {
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
    if (tag === 'video') {
      const el: Record<string, unknown> = { preload: '', duration: durationSec, onloadedmetadata: null, onerror: null }
      let _src = ''
      Object.defineProperty(el, 'src', {
        get() { return _src },
        set(v: string) {
          _src = v
          Promise.resolve().then(() => { if (typeof el.onloadedmetadata === 'function') (el.onloadedmetadata as () => void)() })
        },
      })
      return el as unknown as HTMLElement
    }
    return orig(tag, opts)
  })
}

describe('US-036 — validación de duración antes de subir', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    // transcribe() ahora usa fetch (ya no XHR). Lo dejamos pendiente (nunca resuelve) para que,
    // tras "Continuar"/flujo corto, step quede en 'uploading' y podamos verificar la UI sin que
    // un rechazo lo resetee a 'idle' dentro del tick.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // TC-083: un video que supera el umbral (>15 min) muestra el aviso informativo.
  it('TC-083: video de 20 min → aviso visible con la duración, carga no inicia sola', async () => {
    mockVideoProbe(20 * 60)
    const { container } = render(<Player />)

    const longFile = fakeVideoFile('lecture.mp4')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [longFile] } })
      await tick(50)
    })

    const banner = container.querySelector('[data-testid="size-warn"]')
    expect(banner).not.toBeNull()

    // La duración detectada (min) debe aparecer en el texto del aviso
    expect(banner!.textContent).toMatch(/20/)
    expect(banner!.textContent).toMatch(/min/)

    // El aviso es no bloqueante: el drop zone sigue disponible (seguimos en load screen)
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  // TC-084: un video dentro del umbral (≤15 min) no muestra aviso; el flujo continúa.
  it('TC-084: video de 5 min → sin aviso, flujo continúa normalmente', async () => {
    mockVideoProbe(5 * 60)
    const { container } = render(<Player />)

    const normalFile = fakeVideoFile('short.mp4')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [normalFile] } })
      await tick(50)
    })

    // Sin aviso
    expect(container.querySelector('[data-testid="size-warn"]')).toBeNull()
    // El flujo avanzó: transcribe() puso step='uploading' → el drop zone se ocultó
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  // TC-083b: tras el aviso, "Continuar de todos modos" inicia la transcripción
  it('TC-083b: click en "Continuar de todos modos" → transcripción inicia (drop zone desaparece)', async () => {
    mockVideoProbe(20 * 60)
    const { container, queryByText } = render(<Player />)

    const longFile = fakeVideoFile('lecture.mp4')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [longFile] } })
      await tick(50)
    })

    expect(container.querySelector('[data-testid="size-warn"]')).not.toBeNull()

    const proceedBtn = queryByText(/continuar de todos modos/i)
    expect(proceedBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(proceedBtn!)
      await tick(50)
    })

    // El banner desaparece y la transcripción inicia (drop zone oculto por isTranscribing)
    expect(container.querySelector('[data-testid="size-warn"]')).toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  // TC-083c: "Cancelar" cierra el banner y resetea el estado de video.
  it('TC-083c: "Cancelar" → banner desaparece, drop zone disponible y video state limpio', async () => {
    mockVideoProbe(20 * 60)
    const { container, queryByText } = render(<Player />)

    const longFile = fakeVideoFile('lecture.mp4')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [longFile] } })
      await tick(50)
    })

    expect(container.querySelector('[data-testid="size-warn"]')).not.toBeNull()

    const cancelBtn = queryByText(/^cancelar$/i)
    expect(cancelBtn).not.toBeNull()

    await act(async () => {
      fireEvent.click(cancelBtn!)
      await tick(50)
    })

    // Banner desaparece
    expect(container.querySelector('[data-testid="size-warn"]')).toBeNull()
    // Drop zone disponible de nuevo — el file input del load screen sigue ahí
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
    // El nombre del video fue limpiado (no hay estado fantasma)
    expect(container.textContent).not.toContain('lecture.mp4')
  })
})
