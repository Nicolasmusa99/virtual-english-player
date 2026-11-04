// @vitest-environment jsdom
// 2026-11 — player del profe: tocar el subtítulo en el video edita SOLO su texto, ahí mismo.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))
const SRT = '1\n00:00:01,000 --> 00:00:03,000\nHey, where are we going?\n\n2\n00:00:04,000 --> 00:00:06,000\nI do not know\n'

async function openPlayer() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  const r = render(<Player />)
  const input = r.container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['v'], 'test.mp4', { type: 'video/mp4' }), new File([SRT], 'test.srt', { type: 'text/plain' })] } })
    await tick(150)
  })
  const video = r.container.querySelector('video')!
  const ref = { t: 1.5 }
  Object.defineProperty(video, 'currentTime', { get: () => ref.t, set: (v: number) => { ref.t = v }, configurable: true })
  Object.defineProperty(video, 'duration', { get: () => 10, configurable: true })
  Object.defineProperty(video, 'paused', { get: () => true, configurable: true })
  video.pause = vi.fn()
  video.play = vi.fn(() => Promise.resolve())
  await act(async () => { fireEvent(video, new Event('timeupdate')); await tick(60) })
  return { ...r, video }
}
const listTexts = (c: HTMLElement) => Array.from(c.querySelectorAll('[class*="plTx"]'))
  .filter((e) => /(^|\s)_?plTx_/.test(e.className)).map((e) => e.textContent).filter(Boolean)
const editOnVideo = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Editar este subtítulo' })) })
  return screen.getByLabelText('Texto del subtítulo') as HTMLTextAreaElement
}

beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'open').mockReturnValue({} as Window) })
afterEach(() => { vi.restoreAllMocks() })

describe('editar el subtítulo en el video', () => {
  it('tocarlo pausa y lo vuelve editable con su texto, sin ningún panel extra', async () => {
    const { video } = await openPlayer()
    const box = await editOnVideo()
    expect(video.pause).toHaveBeenCalled()
    expect(box.value).toBe('Hey, where are we going?')
    expect(screen.queryByTestId('caption-editor')).toBeNull()
    expect(screen.queryByLabelText('Empieza')).toBeNull()
  })

  it('Enter guarda el texto nuevo en la frase (y en la lista), sin tocar los tiempos', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: 'Hey, where are you going?' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(screen.queryByLabelText('Texto del subtítulo')).toBeNull()
    expect(listTexts(container)[0]).toBe('Hey, where are you going?')
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]) })
    expect(screen.getByLabelText('inicio')).toHaveValue('0:01,000')
    expect(screen.getByLabelText('fin')).toHaveValue('0:03,000')
  })

  it('salir del campo también guarda', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: 'Where are we going?' } })
    await act(async () => { fireEvent.blur(box) })
    expect(listTexts(container)[0]).toBe('Where are we going?')
  })

  it('Escape cancela sin tocar nada', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: 'otra cosa' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Escape' }) })
    expect(screen.queryByLabelText('Texto del subtítulo')).toBeNull()
    expect(listTexts(container)[0]).toBe('Hey, where are we going?')
  })

  it('dejarlo vacío no borra la frase', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: '   ' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(listTexts(container)[0]).toBe('Hey, where are we going?')
  })
})
