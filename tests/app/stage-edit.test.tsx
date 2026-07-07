// Bloque E — tests de edición avanzada de frases
// P1  TC-089: propagación de edición de texto al stage
// US-030 TC-071/072: editar timestamps inline
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

// ── US-031: botones Dividir / Unir en la fila de frase ──────────────────────
// Nota de alcance: "Dividir" parte automáticamente por Math.floor(text.length/2).
// Selección de posición de corte (cursor) queda fuera del alcance de esta iteración.

describe('US-031 — split and merge phrase buttons', () => {
  let _mockStage: StageChannel | null = null

  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    _mockStage?.close()
    _mockStage = null
    vi.restoreAllMocks()
  })

  // TC-031a: Dividir aparece en ambas frases; split de frase 0 crea 3 frases.
  // "Phrase one" (10 chars), mid=5 → A="Phras", B="e one"
  it('TC-031a: Dividir en frase 0 → lista crece de 2 a 3, textos A y B visibles', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // ROJO: title="Dividir" no existe todavía
    expect(container.querySelectorAll('[title="Dividir"]')).toHaveLength(2)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Dividir"]')[0])
      await tick(50)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(3)
    expect(container.textContent).toContain('Phras')
    expect(container.textContent).toContain('e one')
  })

  // TC-031b: Unir solo aparece en frases que no son la última; merge crea 1 frase.
  it('TC-031b: Unir frase 0 con siguiente → lista decrece de 2 a 1, texto concatenado', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // ROJO: title="Unir con siguiente" no existe todavía
    // Solo frase 0 tiene "Unir" (frase 1 es la última)
    expect(container.querySelectorAll('[title="Unir con siguiente"]')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Unir con siguiente"]')[0])
      await tick(50)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(1)
    expect(container.textContent).toContain('Phrase one Phrase two')
  })

  // TC-031c: split de frase activa con stage abierto → stage recibe subtitle de parte A
  it('TC-031c: split de frase activa con stage abierto → canal recibe subtitle de parte A', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Phrase one')!)
      await tick(50)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage
    panelCmds.length = 0

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Dividir"]')[0])
      await tick(50)
    })

    // "Phrase one" mid=5 → parte A = "Phras"
    expect(panelCmds).toContainEqual({ type: 'subtitle', text: 'Phras', visible: true })
  })

  // TC-031d: merge de frase activa con stage abierto → stage recibe subtitle del merge
  it('TC-031d: merge de frase activa con stage abierto → canal recibe subtitle del merge', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Phrase one')!)
      await tick(50)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage
    panelCmds.length = 0

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Unir con siguiente"]')[0])
      await tick(50)
    })

    expect(panelCmds).toContainEqual({ type: 'subtitle', text: 'Phrase one Phrase two', visible: true })
  })
})

// ── US-032: agregar y eliminar frases ────────────────────────────────────────
// Decisión de alcance: al borrar la última frase curIdx→-1 y el stage recibe
// {type:'subtitle', text:'', visible:false} (via el effect curIdx/ccOn/stageOpen).
// Decisión UX: "Agregar frase" está deshabilitado mientras hay una edición abierta
// (editingIdx !== null) — el profesor debe guardar o cancelar antes de agregar.

describe('US-032 — agregar y eliminar frases', () => {
  let _mockStage: StageChannel | null = null

  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    _mockStage?.close()
    _mockStage = null
    vi.restoreAllMocks()
  })

  // TC-075a: botón Eliminar aparece en cada frase; eliminar frase 0 la quita de la lista
  it('TC-075a: Eliminar frase 0 → lista pasa de 2 a 1, "Phrase one" desaparece', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // ROJO: title="Eliminar" no existe todavía
    expect(container.querySelectorAll('[title="Eliminar"]')).toHaveLength(2)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Eliminar"]')[0])
      await tick(50)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(1)
    expect(container.textContent).not.toContain('Phrase one')
    expect(container.textContent).toContain('Phrase two')
  })

  // TC-075b: eliminar la ÚLTIMA frase con stage abierto → canal recibe subtitle vacío
  // Decisión: curIdx→-1, ph=undefined → {text:'', visible:false}
  it('TC-075b: eliminar única frase con stage → canal recibe {text:"", visible:false}', async () => {
    const SRT_1 = '1\n00:00:01,000 --> 00:00:03,000\nSola\n'
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const { container } = render(<Player />)
    const videoFile = new File(['x'], 'v.mp4', { type: 'video/mp4' })
    const srtFile   = new File([SRT_1], 'v.srt', { type: 'text/plain' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
      await tick(150)
    })

    await act(async () => {
      fireEvent.click(findLeafByText(container, 'Sola')!)
      await tick(50)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage
    panelCmds.length = 0

    await act(async () => {
      fireEvent.click(container.querySelector('[title="Eliminar"]')!)
      await tick(50)
    })

    expect(panelCmds).toContainEqual({ type: 'subtitle', text: '', visible: false })
  })

  // TC-076a: botón "Agregar frase" añade una nueva frase con texto "Nueva frase"
  it('TC-076a: Agregar frase → lista pasa de 2 a 3, "Nueva frase" visible', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // ROJO: botón "Agregar frase" no existe todavía
    const addBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /agregar frase/i.test(b.textContent ?? ''))
    expect(addBtn).not.toBeUndefined()

    await act(async () => {
      fireEvent.click(addBtn!)
      await tick(50)
    })

    expect(container.querySelectorAll('[title="Editar"]')).toHaveLength(3)
    expect(container.textContent).toContain('Nueva frase')
  })

  // TC-076b: nueva frase en currentTime=0 queda ordenada antes de "Phrase one" (start=1s)
  it('TC-076b: nueva frase en currentTime=0 queda ordenada antes de "Phrase one"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const addBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /agregar frase/i.test(b.textContent ?? ''))

    await act(async () => {
      fireEvent.click(addBtn!)
      await tick(50)
    })

    // Nueva frase (t=0) debe aparecer en el DOM antes de "Phrase one" (t=1)
    const newEl = findLeafByText(container, 'Nueva frase')
    const p1El  = findLeafByText(container, 'Phrase one')
    expect(newEl).not.toBeUndefined()
    expect(p1El).not.toBeUndefined()
    // DOCUMENT_POSITION_FOLLOWING (4): p1El viene después de newEl en el DOM
    expect(newEl!.compareDocumentPosition(p1El!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // TC-076c: "Agregar frase" está deshabilitado mientras hay una edición abierta
  // Decisión UX: el profesor debe guardar/cancelar antes de agregar una frase nueva.
  it('TC-076c: "Agregar frase" está disabled mientras editingIdx !== null', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Abrir edición de frase 0
    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    const addBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /agregar frase/i.test(b.textContent ?? ''))
    expect(addBtn).not.toBeUndefined()
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)

    // Cancelar edición → botón vuelve a estar habilitado
    await act(async () => {
      const cancelBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✕')
      fireEvent.click(cancelBtn!)
      await tick(50)
    })

    expect((addBtn as HTMLButtonElement).disabled).toBe(false)
  })
})

// ── US-030: editar timestamps inline ────────────────────────────────────────
// Los inputs usan aria-label="inicio" / aria-label="fin".
// secToTs(s) → "M:SS,mmm". Errores: "inicio ≥ fin" | "formato inválido".

describe('US-030 — timestamp editing', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // TC-071: timestamps válidos → phrases[idx] actualizado, edición cierra
  it('TC-071: guardar start/end válidos → frase muestra nuevo inicio, edición cierra', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    // ROJO: [aria-label="inicio"] no existe todavía
    const startInput = container.querySelector('[aria-label="inicio"]') as HTMLInputElement
    const endInput   = container.querySelector('[aria-label="fin"]')   as HTMLInputElement
    expect(startInput).not.toBeNull()
    expect(endInput).not.toBeNull()

    await act(async () => {
      fireEvent.change(startInput, { target: { value: '0:05,000' } })
      fireEvent.change(endInput,   { target: { value: '0:08,000' } })
    })

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    // Edición cerrada
    expect(container.querySelector('[aria-label="inicio"]')).toBeNull()
    // Nuevo inicio visible en la lista (fmtTime(5) = "0:05")
    expect(container.textContent).toContain('0:05')
  })

  // TC-072a: start >= end → error "inicio ≥ fin", edición abierta, phrases[0].start sin cambios
  it('TC-072a: start >= end → error "inicio ≥ fin", timestamp original conservado', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    const startInput = container.querySelector('[aria-label="inicio"]') as HTMLInputElement
    const endInput   = container.querySelector('[aria-label="fin"]')   as HTMLInputElement
    if (!startInput || !endInput) { expect(startInput).not.toBeNull(); return }

    // start=4s > end=2s
    await act(async () => {
      fireEvent.change(startInput, { target: { value: '0:04,000' } })  // 4 s
      fireEvent.change(endInput,   { target: { value: '0:02,000' } })  // 2 s — start >= end
    })

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    // ROJO: sin validación, saveEdit cierra la edición aunque sea inválido
    // VERDE: edición sigue abierta, error específico visible, plT sigue mostrando "0:01"
    expect(container.querySelector('[aria-label="inicio"]')).not.toBeNull()
    expect(container.textContent).toContain('inicio ≥ fin')
    expect(container.textContent).toContain('0:01')
  })

  // TC-072b: formato inválido → error "formato inválido", phrases[0].start sin cambios
  it('TC-072b: timestamp con formato inválido → error "formato inválido", timestamp original conservado', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    await act(async () => {
      fireEvent.click(container.querySelectorAll('[title="Editar"]')[0])
      await tick(50)
    })

    const startInput = container.querySelector('[aria-label="inicio"]') as HTMLInputElement
    if (!startInput) { expect(startInput).not.toBeNull(); return }

    await act(async () => {
      fireEvent.change(startInput, { target: { value: 'no-es-tiempo' } })
    })

    await act(async () => {
      const saveBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === '✓')
      fireEvent.click(saveBtn!)
      await tick(50)
    })

    // VERDE: edición sigue abierta, error específico, plT sigue mostrando "0:01"
    expect(container.querySelector('[aria-label="inicio"]')).not.toBeNull()
    expect(container.textContent).toContain('formato inválido')
    expect(container.textContent).toContain('0:01')
  })
})
