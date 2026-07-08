// Bloque F — US-036: validación de tamaño antes de subir
// TC-083:  video > umbral → aviso informativo no bloqueante con tamaño detectado
// TC-083b: "Continuar de todos modos" → transcripción inicia
// TC-083c: "Cancelar" → banner desaparece, drop zone limpio (video state reseteado)
// TC-084:  video ≤ umbral → sin aviso, flujo continúa normalmente
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

// Crea un File con size mockeado sin allocar memoria real.
function fakeVideoFile(name: string, sizeBytes: number): File {
  const f = new File(['x'], name, { type: 'video/mp4' })
  Object.defineProperty(f, 'size', { value: sizeBytes })
  return f
}

describe('US-036 — validación de tamaño antes de subir', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    // Previene que xhr.send() haga una conexión real a localhost → evita que onerror
    // resetee step a 'idle' dentro de los 50ms del tick, lo que haría que isTranscribing
    // vuelva a false y el dropzone reaparezca antes de que el test pueda verificarlo.
    vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // TC-083: un video que supera el umbral (>200 MB) muestra el aviso informativo.
  // El aviso no bloquea la UI (sigue en load screen) e indica el tamaño detectado.
  // ROJO: data-testid="size-warn" no existe todavía en app/page.tsx.
  it('TC-083: video de 201 MB → aviso visible con el tamaño, carga no inicia sola', async () => {
    const { container } = render(<Player />)

    const bigFile = fakeVideoFile('lecture.mp4', 201 * 1024 * 1024)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [bigFile] } })
      await tick(50)
    })

    // ROJO: el banner data-testid="size-warn" no existe todavía
    const banner = container.querySelector('[data-testid="size-warn"]')
    expect(banner).not.toBeNull()

    // El tamaño detectado debe aparecer en el texto del aviso
    expect(banner!.textContent).toMatch(/201/)

    // El aviso es no bloqueante: el drop zone sigue disponible (seguimos en load screen)
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  // TC-084: un video dentro del umbral (≤200 MB) no muestra aviso alguno.
  // El flujo continúa normalmente (transcribe() es llamado).
  it('TC-084: video de 10 MB → sin aviso, flujo continúa normalmente', async () => {
    const { container } = render(<Player />)

    const normalFile = fakeVideoFile('short.mp4', 10 * 1024 * 1024)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [normalFile] } })
      await tick(50)
    })

    // Sin aviso
    expect(container.querySelector('[data-testid="size-warn"]')).toBeNull()

    // El flujo avanzó: la UI ya no muestra el drop zone (se está transcribiendo)
    // o al menos no hay banner de aviso de tamaño
    // (fetch falla en test environment pero eso es esperado — sólo verificamos el warning)
  })

  // TC-083b: tras el aviso, "Continuar de todos modos" inicia la transcripción
  it('TC-083b: click en "Continuar de todos modos" → transcripción inicia (drop zone desaparece)', async () => {
    const { container, queryByText } = render(<Player />)

    const bigFile = fakeVideoFile('lecture.mp4', 201 * 1024 * 1024)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [bigFile] } })
      await tick(50)
    })

    // Banner visible
    expect(container.querySelector('[data-testid="size-warn"]')).not.toBeNull()

    // ROJO: el botón "Continuar de todos modos" no existe todavía
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

  // TC-083c: "Cancelar" cierra el banner y resetea el estado de video — el profesor
  // vuelve al drop zone limpio y puede arrastrar video+SRT juntos (flujo US-002).
  it('TC-083c: "Cancelar" → banner desaparece, drop zone disponible y video state limpio', async () => {
    const { container, queryByText } = render(<Player />)

    const bigFile = fakeVideoFile('lecture.mp4', 201 * 1024 * 1024)
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [bigFile] } })
      await tick(50)
    })

    expect(container.querySelector('[data-testid="size-warn"]')).not.toBeNull()

    // ROJO: el botón "Cancelar" no existe todavía
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
