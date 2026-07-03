// TC-061 – TC-070: Bloque D — US-026 auto-pausa / US-027 práctica / US-028 loop / US-029 revelar
//
// Stage-open tests (TC-063, TC-066, TC-068) ejercitan el código path que recibe tiempo
// desde el BroadcastChannel — el path crítico en clase cuando el stage está abierto.
// Si la implementación solo mira el <video> local, esos tests quedan rojos en silencio.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { StageChannel } from '@/lib/stageChannel'
import { sessionKey, saveSession } from '@/lib/session'
import type { SessionData } from '@/lib/session'

// ─── helpers ────────────────────────────────────────────────────────────────

function tick(ms = 0) { return new Promise<void>(r => setTimeout(r, ms)) }

// SRT con 4 frases (1-3s, 4-6s, 7-9s, 10-12s)
const SRT_4 = [
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n',
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n',
  '3\n00:00:07,000 --> 00:00:09,000\nPhrase three\n',
  '4\n00:00:10,000 --> 00:00:12,000\nPhrase four\n',
].join('\n')

const FILE_CONTENT = 'fake-video-data'   // 15 bytes

// Carga video + SRT en el player y espera a la pantalla de player
async function loadIntoPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_4],        'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
  return videoFile
}

// Carga el player con frases pre-seleccionadas vía sesión guardada:
//   p0 (sel=true), p1 (sel=false), p2 (sel=true), p3 (sel=false)
async function loadPlayerWithSelection(container: HTMLElement) {
  const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
  const sessData: SessionData = {
    phrases: [
      { start: 1,  end: 3,  text: 'Phrase one',   sel: true  },
      { start: 4,  end: 6,  text: 'Phrase two',   sel: false },
      { start: 7,  end: 9,  text: 'Phrase three', sel: true  },
      { start: 10, end: 12, text: 'Phrase four',  sel: false },
    ],
    delay: 0, speedIdx: 2, ccOn: true, filter: 'all',
  }
  saveSession(sessionKey(videoFile.name, videoFile.size), sessData)
  await loadIntoPlayer(container)
  // Si aparece el banner de restaurar, aceptar
  await act(async () => {
    const restoreBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^restaurar$/i.test(b.textContent?.trim() ?? ''))
    if (restoreBtn) fireEvent.click(restoreBtn)
    await tick(50)
  })
}

// Abre el stage, realiza el handshake ready→load_blob y devuelve canal mock + cola de comandos
async function openStageWithMock(container: HTMLElement) {
  const panelCmds: Array<Record<string, unknown>> = []
  const mockStage = new StageChannel()
  // El panel envía load_blob/play/pause/seek/etc. — los capturamos todos
  mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))

  const stageBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /abrir stage/i.test(b.textContent ?? ''))
  await act(async () => {
    fireEvent.click(stageBtn!)
    await tick(50)
  })
  // Handshake: el stage emite 'ready', el panel responde con 'load_blob'
  await act(async () => {
    mockStage.send({ type: 'ready' })
    await tick(50)
  })
  return { mockStage, panelCmds }
}

// Envía un timeupdate del stage mock y deja que React procese
async function sendTimeUpdate(mockStage: StageChannel, ct: number, isPlaying = true) {
  await act(async () => {
    mockStage.send({ type: 'timeupdate', currentTime: ct, duration: 15, isPlaying })
    await tick(50)
  })
}

// ─── state ──────────────────────────────────────────────────────────────────
// Guardamos el mockStage de cada test para cerrarlo en afterEach y evitar fuga
let _mockStageRef: StageChannel | null = null

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
})

afterEach(() => {
  _mockStageRef?.close()
  _mockStageRef = null
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// US-026  AUTO-PAUSA
// ══════════════════════════════════════════════════════════════════════════════

describe('US-026 — auto-pausa', () => {

  // TC-061: el toggle auto-pausa existe en el player
  it('TC-061: existe toggle "Auto-pausa" en la pantalla de player', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    // El toggle puede ser un button, checkbox o cualquier elemento con texto "Auto-pausa"
    expect(container.textContent).toMatch(/auto.?pausa/i)
  })

  // TC-062: [local] con stage cerrado, auto-pausa llama a video.pause() al pasar el fin de la frase
  it('TC-062: [local] auto-pausa pausa el video local cuando el tiempo pasa el fin de la frase activa', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar auto-pausa
    const autoPauseToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    expect(autoPauseToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(autoPauseToggle!); await tick(30) })

    const video = container.querySelector('video')!
    let mockTime = 1.5
    Object.defineProperty(video, 'currentTime', { get: () => mockTime, set: () => {}, configurable: true })
    Object.defineProperty(video, 'duration',    { get: () => 15,       configurable: true })
    Object.defineProperty(video, 'paused',      { get: () => false,    configurable: true })
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {})

    // Primer timeupdate: entrar en frase 0 (t=1.5 dentro de start=1..end=3)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    // Segundo timeupdate: pasar el fin de frase 0 (t=3.5 > end=3)
    mockTime = 3.5
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    expect(pauseSpy).toHaveBeenCalled()
  })

  // TC-063: [stage open] auto-pausa envía 'pause' por el canal cuando el tiempo pasa el fin de la frase
  // CASO CRÍTICO: sin esta prueba la implementación podría mirar solo el <video> local y fallar en clase.
  it('TC-063: [stage open] auto-pausa manda { type: "pause" } al canal al pasar el fin de la frase activa', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar auto-pausa
    const autoPauseToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    expect(autoPauseToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(autoPauseToggle!); await tick(30) })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Stage entra en frase 0 (ct=1.5)
    await sendTimeUpdate(mockStage, 1.5)

    // Stage pasa el fin de frase 0 (ct=3.5 > end=3), todavía reproduciendo
    await sendTimeUpdate(mockStage, 3.5, true)

    expect(panelCmds.some(c => c.type === 'pause')).toBe(true)
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// US-027  MODO PRÁCTICA
// ══════════════════════════════════════════════════════════════════════════════

describe('US-027 — modo práctica', () => {

  // TC-064: el toggle práctica existe en el player
  it('TC-064: existe toggle "Práctica" en la pantalla de player', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    expect(container.textContent).toMatch(/pr[aá]ctica/i)
  })

  // TC-065: [local] en modo práctica, nextPhrase salta a la próxima frase seleccionada
  it('TC-065: [local] práctica — nextPhrase desde p0(sel) salta a p2(sel), saltando p1(no-sel)', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)
    // p0 sel=true, p1 sel=false, p2 sel=true, p3 sel=false

    // Activar modo práctica
    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    expect(practiceToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const video = container.querySelector('video')!
    let mockTime = 1.5
    Object.defineProperty(video, 'currentTime', { get: () => mockTime, set: (v) => { mockTime = v }, configurable: true })
    Object.defineProperty(video, 'duration', { get: () => 15, configurable: true })

    // Entrar en frase 0 (t=1.5)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    // "Siguiente frase" — en práctica debe ir a p2 (start=7), no a p1 (start=4)
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'D' })
      await tick(60)
    })

    // En modo práctica, video.currentTime debe haberse fijado cerca de p2.start (7)
    // No a p1.start (4) como haría la navegación normal
    expect(mockTime).toBeGreaterThanOrEqual(7)
    expect(mockTime).toBeLessThan(8)
  })

  // TC-066: [stage open] práctica — nextPhrase envía seek a la próxima frase seleccionada
  // CASO CRÍTICO: con stage abierto jumpTo debe enviar seek al canal, no tocar el <video> local.
  it('TC-066: [stage open] práctica — nextPhrase manda seek a p2(sel=true) saltando p1(sel=false)', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)
    // p0 sel=true, p1 sel=false, p2 sel=true, p3 sel=false

    // Activar modo práctica
    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    expect(practiceToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Posicionarse en frase 0 via timeupdate del stage
    await sendTimeUpdate(mockStage, 1.5)

    // "Siguiente frase" con teclado 'D'
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'D' })
      await tick(60)
    })

    // En práctica, el seek debe apuntar a p2.start (+0.05) = 7.05
    // Si la navegación es normal (no práctica), apuntaría a p1.start = 4.05
    const seekCmds = panelCmds.filter(c => c.type === 'seek')
    const seekTimes = seekCmds.map(c => c.time as number)
    expect(seekTimes.some(t => t >= 7 && t < 8)).toBe(true)
  })

  // TC-064b: práctica deshabilitada cuando no hay selecciones
  it('TC-064b: botón "Práctica" está disabled cuando no hay frases seleccionadas', async () => {
    // Cargar una sesión con todas las frases sin selección (sel: false)
    const videoFile = new File([FILE_CONTENT], 'test.mp4', { type: 'video/mp4' })
    const sessData: SessionData = {
      phrases: [
        { start: 1,  end: 3,  text: 'Phrase one',   sel: false },
        { start: 4,  end: 6,  text: 'Phrase two',   sel: false },
        { start: 7,  end: 9,  text: 'Phrase three', sel: false },
        { start: 10, end: 12, text: 'Phrase four',  sel: false },
      ],
      delay: 0, speedIdx: 2, ccOn: true, filter: 'all',
    }
    saveSession(sessionKey(videoFile.name, videoFile.size), sessData)
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    // Aceptar el banner de restaurar
    await act(async () => {
      const restoreBtn = Array.from(container.querySelectorAll('button'))
        .find(b => /^restaurar$/i.test(b.textContent?.trim() ?? ''))
      if (restoreBtn) fireEvent.click(restoreBtn)
      await tick(50)
    })

    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    expect(practiceToggle).not.toBeUndefined()
    expect((practiceToggle as HTMLButtonElement).disabled).toBe(true)
  })

  // TC-065b: [local] auto-avance al fin de frase seleccionada salta a la siguiente seleccionada
  it('TC-065b: [local] práctica — al pasar el fin de p0(sel), avanza a p2(sel)', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const video = container.querySelector('video')!
    let mockTime = 1.5
    Object.defineProperty(video, 'currentTime', { get: () => mockTime, set: (v: number) => { mockTime = v }, configurable: true })
    Object.defineProperty(video, 'duration',    { get: () => 15,       configurable: true })
    Object.defineProperty(video, 'paused',      { get: () => false,    configurable: true })

    // Entrar en p0 (t=1.5, sel=true, end=3)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    // Pasar el fin de p0 (t=3.5 > end=3) → debe saltar a p2.start=7
    mockTime = 3.5
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    expect(mockTime).toBeGreaterThanOrEqual(7)
    expect(mockTime).toBeLessThan(8)
  })

  // TC-065c: [local] al pasar el fin de la última frase seleccionada, pausa
  it('TC-065c: [local] práctica — al pasar el fin de p2 (última sel), pausa el video', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const video = container.querySelector('video')!
    let mockTime = 7.5
    Object.defineProperty(video, 'currentTime', { get: () => mockTime, set: (v: number) => { mockTime = v }, configurable: true })
    Object.defineProperty(video, 'duration',    { get: () => 15,       configurable: true })
    Object.defineProperty(video, 'paused',      { get: () => false,    configurable: true })
    const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {})

    // Entrar en p2 (t=7.5, sel=true, end=9)
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
    // Pasar el fin de p2 (t=9.5 > end=9) — p2 es la última seleccionada → debe pausar
    mockTime = 9.5
    await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })

    expect(pauseSpy).toHaveBeenCalled()
  })

  // TC-066b: [stage] auto-avance al fin de p0(sel) envía seek hacia p2 via canal
  it('TC-066b: [stage] práctica — al pasar el fin de p0(sel), manda seek a p2 por canal', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Entrar en p0 (ct=1.5)
    await sendTimeUpdate(mockStage, 1.5)
    // Pasar el fin de p0 (ct=3.5 > end=3) → seek a p2.start≈7
    await sendTimeUpdate(mockStage, 3.5, true)

    const seekTimes = panelCmds.filter(c => c.type === 'seek').map(c => c.time as number)
    expect(seekTimes.some(t => t >= 7 && t < 8)).toBe(true)
  })

  // TC-066c: [stage] al pasar el fin de p2 (última sel), manda pause al canal
  it('TC-066c: [stage] práctica — al pasar el fin de p2 (última sel), manda pause al canal', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(practiceToggle!); await tick(30) })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Entrar en p2 (ct=7.5, sel=true, end=9)
    await sendTimeUpdate(mockStage, 7.5)
    // Pasar el fin de p2 (ct=9.5 > end=9) — última seleccionada → pause
    await sendTimeUpdate(mockStage, 9.5, true)

    expect(panelCmds.some(c => c.type === 'pause')).toBe(true)
  })

  // TC-067b: práctica tiene precedencia sobre auto-pausa: avanza a p2 y NO pausa
  it('TC-067b: práctica + auto-pausa — práctica gana: avanza a p2, NO pausa en p0', async () => {
    const { container } = render(<Player />)
    await loadPlayerWithSelection(container)

    // Activar ambos modos
    const autoPauseToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    const practiceToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /pr[aá]ctica/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(autoPauseToggle!); fireEvent.click(practiceToggle!)
      await tick(30)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Entrar en p0 y pasar su fin
    await sendTimeUpdate(mockStage, 1.5)
    await sendTimeUpdate(mockStage, 3.5, true)

    // Debe haber un seek a p2 (≥7 <8)
    const seekTimes = panelCmds.filter(c => c.type === 'seek').map(c => c.time as number)
    expect(seekTimes.some(t => t >= 7 && t < 8)).toBe(true)
    // No debe haber un pause (práctica ganó, no auto-pausa)
    expect(panelCmds.some(c => c.type === 'pause')).toBe(false)
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// US-028  LOOP
// ══════════════════════════════════════════════════════════════════════════════

describe('US-028 — loop de frase', () => {

  // TC-067: el toggle loop existe en el player
  it('TC-067: existe toggle "Loop" en la pantalla de player', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    expect(container.textContent).toMatch(/loop/i)
  })

  // TC-068: [stage open] loop — el panel envía seek al inicio de la frase al pasar su fin
  it('TC-068: [stage open] loop manda seek al inicio de la frase al pasar su fin', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar loop
    const loopToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /loop/i.test(b.textContent ?? ''))
    expect(loopToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(loopToggle!); await tick(30) })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Entrar en frase 0 (ct=1.5, start=1..end=3)
    await sendTimeUpdate(mockStage, 1.5)

    // Pasar el fin de frase 0 (ct=3.5 > end=3)
    await sendTimeUpdate(mockStage, 3.5, true)

    // Con loop, el panel debe mandar seek de vuelta al inicio de la frase (≈ start=1)
    const seekCmds = panelCmds.filter(c => c.type === 'seek')
    const seekTimes = seekCmds.map(c => c.time as number)
    expect(seekTimes.some(t => t >= 1.0 && t < 2.0)).toBe(true)
  })

  // TC-068b: loop + auto-pausa — loop tiene precedencia: hace seek, NO pausa
  it('TC-068b: loop + auto-pausa — loop gana: hace seek al inicio, NO manda pause', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar ambos modos
    const loopToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /loop/i.test(b.textContent ?? ''))
    const autoPauseToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /auto.?pausa/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(loopToggle!); fireEvent.click(autoPauseToggle!)
      await tick(30)
    })

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStageRef = mockStage

    // Entrar en frase 0 (ct=1.5) y pasar su fin (ct=3.5)
    await sendTimeUpdate(mockStage, 1.5)
    await sendTimeUpdate(mockStage, 3.5, true)

    // Loop gana: seek al inicio de la frase (≈ start=1), sin pause
    const seekTimes = panelCmds.filter(c => c.type === 'seek').map(c => c.time as number)
    expect(seekTimes.some(t => t >= 1.0 && t < 2.0)).toBe(true)
    expect(panelCmds.some(c => c.type === 'pause')).toBe(false)
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// US-029  REVELAR
// ══════════════════════════════════════════════════════════════════════════════

describe('US-029 — revelar', () => {

  // TC-069: el toggle revelar existe en el player
  it('TC-069: existe toggle "Revelar" en la pantalla de player', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    expect(container.textContent).toMatch(/revelar/i)
  })

  // TC-070: cuando el toggle de ocultar textos está activo, los textos de las frases no se muestran
  it('TC-070: con textos ocultos, el contenido de las frases no es legible en la lista', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    // Activar modo "ocultar textos" (se espera un botón/toggle que active esta función)
    const revealToggle = Array.from(container.querySelectorAll('button'))
      .find(b => /revelar/i.test(b.textContent ?? ''))
    expect(revealToggle).not.toBeUndefined()
    await act(async () => { fireEvent.click(revealToggle!); await tick(30) })

    // Con los textos ocultos, las frases del SRT no deben aparecer en el DOM
    expect(container.textContent).not.toContain('Phrase one')
    expect(container.textContent).not.toContain('Phrase two')
  })

})
