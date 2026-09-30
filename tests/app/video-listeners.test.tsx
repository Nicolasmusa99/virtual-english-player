// Regression test for bug introduced in ea36c81 (initial commit):
// useEffect(..., []) ran at mount with screen='load' and vidRef.current=null,
// so onTU was never attached. Progress bar, timer, and phrase-list scroll were
// silently broken from the start. Fixed by changing [] → [screen].
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nHello\n'

describe('video listeners — regression ea36c81', () => {
  it('onTU is attached after screen→player: la frase actual y la barra de tiempo siguen al video', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const { container } = render(<Player />)

    // Load into player screen
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const videoFile = new File(['fake'], 'clip.mp4', { type: 'video/mp4' })
    const srtFile   = new File([SRT],   'clip.srt', { type: 'text/plain' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
      await new Promise<void>(r => setTimeout(r, 150))
    })

    const video = container.querySelector('video')!
    Object.defineProperty(video, 'currentTime', { get: () => 2.0,  configurable: true })
    Object.defineProperty(video, 'duration',    { get: () => 15.0, configurable: true })
    Object.defineProperty(video, 'paused',      { get: () => false, configurable: true })

    await act(async () => {
      fireEvent(video, new Event('timeupdate'))
      await new Promise<void>(r => setTimeout(r, 60))
    })

    // onTU enganchado: la frase actual pasa a "Hello" (el contador sale de "— / —").
    expect(container.querySelector('[class*="phCtr"]')!.textContent).toBe('1 / 1')

    // P1: la barra de tiempo (PlayerDock) lee el video en cada cuadro → muestra 0:02.
    expect(container.textContent).toContain('0:02')
    const bar = container.querySelector('[data-testid="prog-track"]') as HTMLElement
    expect(bar.getAttribute('aria-valuenow')).toBe('2')

    vi.restoreAllMocks()
  })
})
