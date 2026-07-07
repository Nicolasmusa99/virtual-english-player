// Bloque F — US-035: salto directo desde tick del progress bar
// TC-081: click en tick[idx] → jumpTo(idx) → seek al stage con time = phrase.start + 0.05
// TC-082: click en el track fuera de ticks → scrub proporcional intacto (comportamiento actual)
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { StageChannel } from '@/lib/stageChannel'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

// SRT con phrase 0 en t=1s y phrase 1 en t=4s — facilita cálculos exactos de seek time
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

describe('US-035 — salto directo desde tick del progress bar', () => {
  let _mockStage: StageChannel | null = null

  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
  })
  afterEach(() => {
    _mockStage?.close()
    _mockStage = null
    vi.restoreAllMocks()
  })

  // TC-081: el tick del phrase[0] es clickeable; click → jumpTo(0) → canal recibe seek
  // con time = phrase.start + 0.05 = 1.05.
  // ROJO: los ticks actualmente no tienen onClick ni data-phrase-idx.
  it('TC-081: click en tick de phrase[0] → seek al stage con time 1.05', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage
    panelCmds.length = 0

    // ROJO: data-phrase-idx no existe todavía en los ticks
    const tick0 = container.querySelector('[data-phrase-idx="0"]')
    expect(tick0).not.toBeNull()

    await act(async () => {
      fireEvent.click(tick0!)
      await tick(50)
    })

    // jumpTo(0) envía seek con phrase.start (1.0) + 0.05 = 1.05
    expect(panelCmds).toContainEqual({ type: 'seek', time: 1.05 })
  })

  // TC-082: click en el progTrack (fuera de cualquier tick) → scrub proporcional sigue
  // funcionando: el handler del track no fue interferido por los onClick de los ticks.
  // ROJO: data-testid="prog-track" no existe todavía.
  it('TC-082: click en progTrack fuera de ticks → scrub envía seek proporcional al stage', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)

    const { mockStage, panelCmds } = await openStageWithMock(container)
    _mockStage = mockStage

    // Notificar duración al panel para que stageDurationRef quede en 200s
    await act(async () => {
      mockStage.send({ type: 'timeupdate', currentTime: 0, duration: 200, isPlaying: false })
      await tick(50)
    })

    panelCmds.length = 0

    // ROJO: data-testid="prog-track" no existe todavía
    const track = container.querySelector('[data-testid="prog-track"]') as HTMLElement | null
    expect(track).not.toBeNull()

    // Mockear getBoundingClientRect: track de 400px desde x=0
    track!.getBoundingClientRect = () => ({
      left: 0, right: 400, width: 400, top: 0, bottom: 3, height: 3,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    // Click en el centro del track (clientX=200, fuera de los ticks de phrase 0 y 1)
    // pct = 200/400 = 0.5 → seek time = 0.5 * 200 = 100
    await act(async () => {
      fireEvent.click(track!, { clientX: 200 })
      await tick(50)
    })

    expect(panelCmds).toContainEqual({ type: 'seek', time: 100 })
  })
})
