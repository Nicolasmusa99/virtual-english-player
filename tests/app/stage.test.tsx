// TC-087: acciones del panel se reflejan en el stage
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import Stage from '@/app/stage/page'
import { StageChannel } from '@/lib/stageChannel'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

describe('Stage — TC-087', () => {
  let panel: StageChannel

  afterEach(() => { panel?.close() })

  // TC-087a: RED — stage todavía no emite 'ready' al montar
  it('TC-087a: emite ready al montar (señal para que el panel envíe load_blob)', async () => {
    panel = new StageChannel()
    const received: string[] = []
    panel.onMessage(msg => received.push(msg.type))

    await act(async () => {
      render(<Stage />)
      await tick(50)
    })

    expect(received).toContain('ready')
  })

  // TC-087b-e: GREEN — el stage ya maneja estos comandos
  it('TC-087b: comando play llama video.play()', async () => {
    panel = new StageChannel()
    let playCalled = false
    const { container } = render(<Stage />)
    const video = container.querySelector('video')!
    video.play = vi.fn().mockImplementation(() => { playCalled = true; return Promise.resolve() })

    await act(async () => {
      panel.send({ type: 'play' })
      await tick(50)
    })

    expect(playCalled).toBe(true)
  })

  it('TC-087c: comando seek actualiza currentTime del video', async () => {
    panel = new StageChannel()
    const { container } = render(<Stage />)
    const video = container.querySelector('video')!

    await act(async () => {
      panel.send({ type: 'seek', time: 45.5 })
      await tick(50)
    })

    expect(video.currentTime).toBe(45.5)
  })

  it('TC-087d: comando speed actualiza playbackRate', async () => {
    panel = new StageChannel()
    const { container } = render(<Stage />)
    const video = container.querySelector('video')!

    await act(async () => {
      panel.send({ type: 'speed', rate: 1.5 })
      await tick(50)
    })

    expect(video.playbackRate).toBe(1.5)
  })

  it('TC-087e: comando subtitle muestra texto en el overlay', async () => {
    panel = new StageChannel()
    const { container } = render(<Stage />)

    await act(async () => {
      panel.send({ type: 'subtitle', text: 'Hello world', visible: true })
      await tick(50)
    })

    expect(container.textContent).toContain('Hello world')
  })
})
