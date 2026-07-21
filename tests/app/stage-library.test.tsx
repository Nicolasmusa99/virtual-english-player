// Fix stage + biblioteca — TC-library
// Verifies that opening the stage from a library video (videoFileRef=null, videoUrl=storageUrl)
// sends load_url (not load_blob) through the BroadcastChannel.
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { StageChannel } from '@/lib/stageChannel'

// Mock next-auth so useSession returns authenticated — needed to expose the library button.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { email: 'test@test.com' } } }),
  signIn:  vi.fn(),
  signOut: vi.fn(),
}))

const STORAGE_URL = 'https://public.blob.vercel-storage.com/test-video.mp4'

function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const s = String(url)
  if (s === '/api/videos') {
    return Promise.resolve(new Response(
      JSON.stringify({ videos: [{ id: 'vid-1', originalName: 'test.mp4', status: 'ready', phraseCount: 2 }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
  }
  if (s === '/api/videos/vid-1') {
    return Promise.resolve(new Response(
      JSON.stringify({
        video:   { id: 'vid-1', originalName: 'test.mp4', status: 'ready', storageUrl: STORAGE_URL },
        session: {
          phrases:   [{ text: 'Hello', start: 1, end: 3, sel: true }, { text: 'World', start: 4, end: 6, sel: true }],
          delay:     0, speedIdx: 2, ccOn: true, filter: 'all', srtSource: 'gemini',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }))
}

function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }

async function navigateToPlayerViaLibrary(container: HTMLElement) {
  const libBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /biblioteca/i.test(b.textContent ?? ''))
  expect(libBtn).not.toBeUndefined()
  await act(async () => { fireEvent.click(libBtn!); await tick(150) })

  const abrirBtn = Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Abrir')
  expect(abrirBtn).not.toBeUndefined()
  await act(async () => { fireEvent.click(abrirBtn!); await tick(150) })
}

describe('Fix stage + biblioteca', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  // TC-lib-01: panel manda load_url (no load_blob) cuando el video viene de biblioteca
  it('TC-lib-01: biblioteca → panel manda load_url con storageUrl al recibir ready', async () => {
    const { container } = render(<Player />)
    await navigateToPlayerViaLibrary(container)

    const panelCmds: Array<Record<string, unknown>> = []
    const mockStage = new StageChannel()
    mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))

    const stageBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /abrir stage/i.test(b.textContent ?? ''))
    expect(stageBtn).not.toBeUndefined()

    await act(async () => { fireEvent.click(stageBtn!); await tick(50) })
    await act(async () => { mockStage.send({ type: 'ready' }); await tick(100) })

    const loadCmd = panelCmds.find(m => m.type === 'load_url' || m.type === 'load_blob')
    expect(loadCmd?.type).toBe('load_url')
    expect(loadCmd?.url).toBe(STORAGE_URL)
    expect(loadCmd?.fileName).toBe('test.mp4')
    expect(typeof loadCmd?.currentTime).toBe('number')
    expect(typeof loadCmd?.playbackRate).toBe('number')

    mockStage.close()
  })

  // TC-lib-02: botón "Abrir stage" no está deshabilitado cuando hay storageUrl
  it('TC-lib-02: botón Abrir stage habilitado con video de biblioteca (no silent fail)', async () => {
    const { container } = render(<Player />)
    await navigateToPlayerViaLibrary(container)

    const stageBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /abrir stage/i.test(b.textContent ?? ''))
    expect(stageBtn).not.toBeUndefined()
    expect((stageBtn as HTMLButtonElement).disabled).toBe(false)
  })

  // TC-lib-03: flujo local intacto — drag-and-drop sigue mandando load_blob
  it('TC-lib-03: drag-and-drop sigue mandando load_blob (flujo local no roto)', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const { container } = render(<Player />)

    const videoFile = new File(['v'], 'local.mp4', { type: 'video/mp4' })
    const srtFile   = new File(['1\n00:00:01,000 --> 00:00:03,000\nHi\n'], 'local.srt')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
      await tick(150)
    })

    const panelCmds: Array<Record<string, unknown>> = []
    const mockStage = new StageChannel()
    mockStage.onMessage(msg => panelCmds.push(msg as Record<string, unknown>))

    const stageBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /abrir stage/i.test(b.textContent ?? ''))
    await act(async () => { fireEvent.click(stageBtn!); await tick(50) })
    await act(async () => { mockStage.send({ type: 'ready' }); await tick(100) })

    const loadCmd = panelCmds.find(m => m.type === 'load_url' || m.type === 'load_blob')
    expect(loadCmd?.type).toBe('load_blob')

    mockStage.close()
  })
})
