// Bloque F — US-034: Cargar SRT sobre video ya abierto
// TC-079:  SRT válido reemplaza phrases sin interrumpir playback
// TC-079b: dirty=true + intento de carga → exitDialog de US-025 (no window.confirm)
//          Confirmar "Salir sin guardar" aplica el nuevo SRT
// TC-079c: stage abierto + SRT reemplazado → canal recibe subtitle vacío (curIdx=-1)
// TC-080:  SRT inválido (0 frases) → error inline, phrases originales intactas
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { StageChannel } from '@/lib/stageChannel'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_2 =
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n' +
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n'

const SRT_3 =
  '1\n00:00:01,000 --> 00:00:02,000\nAlpha\n\n' +
  '2\n00:00:03,000 --> 00:00:04,000\nBeta\n\n' +
  '3\n00:00:05,000 --> 00:00:06,000\nGamma\n'

async function loadIntoPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File(['fake-video-data'], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_2], 'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

// Obtiene el input oculto de recarga de SRT.
function getSrtReloadInput(container: HTMLElement) {
  return container.querySelector('[data-testid="srt-reload-input"]') as HTMLInputElement | null
}

// Abre el stage y realiza el handshake ready→load_blob.
async function openStageWithMock(container: HTMLElement) {
  const panelCmds: Array<Record<string, unknown>> = []
  const mockStage = new StageChannel()
  mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))
  const stageBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /abrir stage/i.test(b.textContent ?? ''))
  await act(async () => { fireEvent.click(stageBtn!); await tick(50) })
  await act(async () => { mockStage.send({ type: 'ready' }); await tick(50) })
  return { mockStage, panelCmds }
}

// Halla el elemento hoja cuyo textContent coincide exactamente.
function findLeafByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('*'))
    .find(el => el.textContent?.trim() === text && el.children.length === 0) as HTMLElement | undefined
}

describe('US-034 — cargar SRT sobre video abierto', () => {
  let _mockStage: StageChannel | null = null

  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    _mockStage?.close()
    _mockStage = null
    vi.restoreAllMocks()
  })

  // TC-079: SRT válido reemplaza las phrases originales; el botón y el input oculto existen.
  it('TC-079: SRT válido (3 frases) reemplaza las 2 frases originales', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(2)

    // ROJO: el botón "Cargar SRT" no existe todavía en app/page.tsx
    const loadSrtBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /cargar srt/i.test(b.textContent ?? ''))
    expect(loadSrtBtn).toBeDefined()

    // ROJO: el input data-testid="srt-reload-input" no existe todavía
    const srtInput = getSrtReloadInput(container)
    expect(srtInput).not.toBeNull()

    const newSrtFile = new File([SRT_3], 'nuevo.srt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(srtInput!, { target: { files: [newSrtFile] } })
      await tick(100)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(3)
    expect(container.textContent).toContain('Alpha')
    expect(container.textContent).toContain('Beta')
    expect(container.textContent).toContain('Gamma')
    expect(container.textContent).not.toContain('Phrase one')
    expect(container.textContent).not.toContain('Phrase two')
  })

  // TC-079b: con isDirty=true, el intento de carga muestra el exitDialog de US-025
  // (no window.confirm). Confirmar "Salir sin guardar" aplica el nuevo SRT.
  it('TC-079b: dirty=true → exitDialog de US-025; confirmar aplica el nuevo SRT', async () => {
    const { container, queryByText } = render(<Player />)
    await loadIntoPlayer(container)

    // Hacer dirty: "Ninguna ☐" deselecciona todas las frases y setIsDirty(true)
    await act(async () => {
      fireEvent.click(queryByText(/ninguna/i)!)
      await tick(50)
    })

    const srtInput = getSrtReloadInput(container)
    // ROJO: el input no existe todavía; cuando exista, el test continúa
    expect(srtInput).not.toBeNull()

    const newSrtFile = new File([SRT_3], 'nuevo.srt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(srtInput!, { target: { files: [newSrtFile] } })
      await tick(100)
    })

    // ROJO: actualmente no hay React exitDialog para este caso (usa window.confirm).
    // Tras la implementación, el exitDialog de US-025 debe aparecer.
    expect(queryByText(/salir con cambios sin guardar/i)).not.toBeNull()
    // Las phrases originales no se reemplazan mientras el dialog está abierto
    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(2)

    // Confirmar: "Salir sin guardar" debe aplicar el nuevo SRT
    await act(async () => {
      fireEvent.click(queryByText(/salir sin guardar/i)!)
      await tick(100)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(3)
    expect(container.textContent).toContain('Alpha')
  })

  // TC-079c: con stage abierto y una frase activa, reemplazar el SRT hace que
  // curIdx se resetee a -1 → el canal recibe subtitle vacío (mismo patrón que US-032).
  it('TC-079c: stage abierto + SRT reemplazado → canal recibe {subtitle, text:"", visible:false}', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage

    // Activar frase 0 clickeando su texto en la lista
    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Phrase one')!)
      await tick(50)
    })

    // Limpiar comandos anteriores al handshake y al click
    panelCmds.length = 0

    const srtInput = getSrtReloadInput(container)
    // ROJO: el input no existe todavía
    expect(srtInput).not.toBeNull()

    const newSrtFile = new File([SRT_3], 'nuevo.srt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(srtInput!, { target: { files: [newSrtFile] } })
      await tick(100)
    })

    // Al resetear curIdx a -1, el effect subtitle envía texto vacío al stage
    expect(panelCmds).toContainEqual({ type: 'subtitle', text: '', visible: false })
  })

  // TC-080: SRT inválido (0 frases) → error inline visible, phrases originales intactas.
  it('TC-080: SRT inválido (0 frases) → error visible, phrases originales sin cambios', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(2)

    // ROJO: el input no existe todavía
    const srtInput = getSrtReloadInput(container)
    expect(srtInput).not.toBeNull()

    const badFile = new File(['esto no es un srt válido'], 'bad.srt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(srtInput!, { target: { files: [badFile] } })
      await tick(100)
    })

    // Error inline visible
    expect(container.textContent).toMatch(/no contiene frases|sin frases|inválido|no se pudo/i)
    // Phrases originales intactas
    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(2)
    expect(container.textContent).toContain('Phrase one')
    expect(container.textContent).toContain('Phrase two')
  })
})
