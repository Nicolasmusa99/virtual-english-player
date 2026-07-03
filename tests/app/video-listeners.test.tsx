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
  it('onTU is attached after screen→player: timeCur and progPct update on timeupdate', async () => {
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

    // timeCur should now show "0:02", not the initial "0:00"
    expect(container.textContent).toContain('0:02')

    // progress fill should have a non-zero width (progPct = 2/15*100 ≈ 13.3%)
    const fill = container.querySelector('[class*="pFill"]') as HTMLElement
    expect(fill).not.toBeNull()
    expect(fill.style.width).not.toBe('0%')
    expect(fill.style.width).not.toBe('')

    vi.restoreAllMocks()
  })
})
