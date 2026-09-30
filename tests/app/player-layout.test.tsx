// Player del profe (P1) — la franja de controles queda FUERA de lo que se comparte en
// Zoom, y cambiar de frase ya no scrollea el panel entero (escondía los controles).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent, screen } from '@testing-library/react'
import Player from '@/app/page'
import { DOCK_TEXTS } from '@/app/PlayerDock'

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }
const SRT =
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n' +
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n'

async function load(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [
      new File(['v'], 'test.mp4', { type: 'video/mp4' }),
      new File([SRT], 'test.srt', { type: 'text/plain' }),
    ] } })
    await tick(150)
  })
}

afterEach(() => vi.restoreAllMocks())

describe('P1 — player del profe', () => {
  it('la barra y los controles están fuera del área que ve el alumno (#ve-stage-wrap)', async () => {
    const { container } = render(<Player />)
    await load(container)
    const wrap = container.querySelector('#ve-stage-wrap')!
    expect(wrap).not.toBeNull()
    expect(wrap.querySelector('video')).not.toBeNull()
    for (const el of [
      screen.getByRole('slider', { name: DOCK_TEXTS.timeline }),
      screen.getByRole('button', { name: DOCK_TEXTS.play }),
      screen.getByRole('button', { name: DOCK_TEXTS.speed }),
      screen.getByLabelText(DOCK_TEXTS.volume),
    ]) expect(wrap.contains(el)).toBe(false)
  })

  it('el volumen de la franja cambia el del video', async () => {
    const { container } = render(<Player />)
    await load(container)
    fireEvent.change(screen.getByLabelText(DOCK_TEXTS.volume), { target: { value: '40' } })
    expect(container.querySelector('video')!.volume).toBeCloseTo(0.4, 5)
  })

  it('la velocidad de la franja cambia la del video', async () => {
    const { container } = render(<Player />)
    await load(container)
    fireEvent.click(screen.getByRole('button', { name: DOCK_TEXTS.speed }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitemradio', { name: '1.5×' })) })
    expect(container.querySelector('video')!.playbackRate).toBe(1.5)
  })

  it('cambiar de frase no usa scrollIntoView (movía el panel entero)', async () => {
    const spy = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView')
    const { container } = render(<Player />)
    await load(container)
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(30) })
    await act(async () => { fireEvent.keyDown(document.body, { key: 'ArrowRight' }); await tick(30) })
    expect(container.querySelector('[data-act="true"]')).not.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
