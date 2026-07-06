// P1 — TC-089: propagación inmediata al stage al editar la frase activa
// Rojo: saveEdit no envía al canal hoy → panelCmds no contiene el subtitle con texto nuevo.
// Verde: saveEdit emite channelRef.current.send({ type:'subtitle', text: editingText, visible: ccRef.current })
//        cuando stageOpenRef.current && idx === curIdxRef.current.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { StageChannel } from '@/lib/stageChannel'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_2 =
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n' +
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n'

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

// Abre el stage y realiza el handshake ready→load_blob.
// Devuelve el canal mock y el array de comandos que el panel envía.
async function openStageWithMock(container: HTMLElement) {
  const panelCmds: Array<Record<string, unknown>> = []
  const mockStage = new StageChannel()
  mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))

  const stageBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /abrir stage/i.test(b.textContent ?? ''))
  await act(async () => {
    fireEvent.click(stageBtn!)
    await tick(50)
  })
  await act(async () => {
    mockStage.send({ type: 'ready' })
    await tick(50)
  })
  return { mockStage, panelCmds }
}

// Halla el elemento hoja cuyo textContent coincide exactamente (para clickear la fila).
function findLeafByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('*'))
    .find(el => el.textContent?.trim() === text && el.children.length === 0) as HTMLElement | undefined
}

describe('P1 — subtitle propagation on active-phrase edit', () => {
  let _mockStage: StageChannel | null = null

  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    _mockStage?.close()
    _mockStage = null
    vi.restoreAllMocks()
  })

  // TC-089a: editar frase ACTIVA con stage abierto → canal recibe subtitle con texto nuevo
  it('TC-089a: guardar edición de frase activa → canal recibe {type:"subtitle"} con el texto nuevo', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar frase 0 (curIdx=0) ANTES de abrir el stage para que jumpTo no envíe seek
    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Phrase one')!)
      await tick(50)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage

    // Limpiar mensajes del handshake (subtitle inicial con texto original + load_blob)
    panelCmds.length = 0

    // Abrir edición de la frase 0 (primer botón con title="Editar")
    await act(async () => {
      const editBtns = container.querySelectorAll('[title="Editar"]')
      fireEvent.click(editBtns[0])
      await tick(50)
    })

    // Escribir el nuevo texto
    await act(async () => {
      const input = container.querySelector('input:not([type="range"])') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Texto editado' } })
    })

    // Guardar con ✓
    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    // ROJO: saveEdit no envía al canal → falla aquí hasta el fix
    // VERDE: saveEdit emite { type:'subtitle', text: editingText, visible: ccRef.current }
    expect(panelCmds).toContainEqual({ type: 'subtitle', text: 'Texto editado', visible: true })
  })

  // TC-089b: editar frase NO activa → canal NO recibe subtitle con ese texto
  it('TC-089b: editar frase no activa con stage abierto → canal NO recibe subtitle con ese texto', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar frase 1 (curIdx=1) — segunda frase
    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Phrase two')!)
      await tick(50)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage
    panelCmds.length = 0

    // Editar la frase 0 (no activa: curIdx=1 ≠ 0) → no debería emitir al canal
    await act(async () => {
      const editBtns = container.querySelectorAll('[title="Editar"]')
      fireEvent.click(editBtns[0])
      await tick(50)
    })

    await act(async () => {
      const input = container.querySelector('input:not([type="range"])') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'No debería enviarse' } })
    })

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    // Ningún subtitle al canal debe llevar el texto de la frase no activa
    const subtitleCmds = panelCmds.filter(m => m.type === 'subtitle')
    expect(subtitleCmds.every(m => m.text !== 'No debería enviarse')).toBe(true)
  })
})
