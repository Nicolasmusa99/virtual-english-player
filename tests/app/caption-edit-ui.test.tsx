// @vitest-environment jsdom
// 2026-11 — player del profe: tocar el subtítulo en el video lo edita (texto en su lugar) y
// abajo aparece el panel fino (tiempos al milisegundo, dividir con el cursor y la milésima).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import Player from '@/app/page'
import { CAPTION_TEXTS as C } from '@/app/CaptionEditor'

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
  return { ...r, ref, video }
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
  it('tocarlo pausa, lo vuelve editable con su texto y abre el panel fino debajo', async () => {
    const { video } = await openPlayer()
    const box = await editOnVideo()
    expect(video.pause).toHaveBeenCalled()
    expect(box.value).toBe('Hey, where are we going?')
    const panel = screen.getByTestId('caption-editor')
    expect(panel).toHaveTextContent(C.of(1, 2))
    expect(within(panel).getByLabelText(C.start)).toHaveValue('0:01,000')
    expect(within(panel).getByLabelText(C.end)).toHaveValue('0:03,000')
    // el panel va FUERA de lo que se comparte en Zoom
    expect(document.getElementById('ve-stage-wrap')!.contains(panel)).toBe(false)
  })

  it('Enter guarda el texto nuevo en la frase (y en la lista)', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: 'Hey, where are you going?' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    expect(screen.queryByTestId('caption-editor')).toBeNull()
    expect(listTexts(container)[0]).toBe('Hey, where are you going?')
  })

  it('Escape cancela sin tocar nada', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    fireEvent.change(box, { target: { value: 'otra cosa' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Escape' }) })
    expect(screen.queryByTestId('caption-editor')).toBeNull()
    expect(listTexts(container)[0]).toBe('Hey, where are we going?')
  })

  it('inicio y final al milisegundo: correr de a 0,01 s, escribirlo, o tomarlo del video', async () => {
    const { container, ref } = await openPlayer()
    await editOnVideo()
    const panel = screen.getByTestId('caption-editor')
    fireEvent.click(within(panel).getByRole('button', { name: `${C.start}: 0,01 segundos después` }))
    expect(within(panel).getByLabelText(C.start)).toHaveValue('0:01,010')
    const end = within(panel).getByLabelText(C.end)
    fireEvent.change(end, { target: { value: '0:02,987' } })
    fireEvent.keyDown(end, { key: 'Enter' })
    expect(end).toHaveValue('0:02,987')
    ref.t = 1.234
    fireEvent.click(within(panel).getByRole('button', { name: `${C.start}: usar el momento del video` }))
    expect(within(panel).getByLabelText(C.start)).toHaveValue('0:01,234')
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: C.save })) })
    // la frase quedó con esos tiempos: se ve en la edición de la lista
    expect(listTexts(container)[0]).toBe('Hey, where are we going?')
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]) })
    expect(screen.getByLabelText('inicio')).toHaveValue('0:01,234')
    expect(screen.getByLabelText('fin')).toHaveValue('0:02,987')
  })

  it('un tiempo mal escrito avisa y no se toma', async () => {
    await openPlayer()
    await editOnVideo()
    const panel = screen.getByTestId('caption-editor')
    const start = within(panel).getByLabelText(C.start)
    fireEvent.change(start, { target: { value: 'uno' } })
    fireEvent.blur(start)
    expect(panel).toHaveTextContent(C.badTime)
  })

  it('dividir: el texto corta en el cursor y el tiempo en la milésima elegida', async () => {
    const { container } = await openPlayer()
    const box = await editOnVideo()
    box.setSelectionRange(15, 15)
    fireEvent.select(box)
    const panel = screen.getByTestId('caption-editor')
    expect(panel).toHaveTextContent('Primera parte: Hey, where are')
    expect(panel).toHaveTextContent('Segunda parte: we going?')
    const cut = within(panel).getByLabelText(C.cut)
    fireEvent.change(cut, { target: { value: '0:02,345' } })
    fireEvent.keyDown(cut, { key: 'Enter' })
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: C.doSplit })) })
    expect(screen.queryByTestId('caption-editor')).toBeNull()
    expect(listTexts(container).slice(0, 3)).toEqual(['Hey, where are', 'we going?', 'I do not know'])
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]) })
    expect(screen.getByLabelText('inicio')).toHaveValue('0:02,345')
    expect(screen.getByLabelText('fin')).toHaveValue('0:03,000')
  })

  it('dividir sin poner el cursor en el medio avisa qué hacer', async () => {
    await openPlayer()
    await editOnVideo() // el cursor arranca al final del texto
    const panel = screen.getByTestId('caption-editor')
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: C.doSplit })) })
    expect(within(panel).getByRole('alert')).toHaveTextContent('Poné el cursor en el texto')
  })

  it('con el foco en el panel, las flechas no cambian de frase', async () => {
    await openPlayer()
    await editOnVideo()
    const panel = screen.getByTestId('caption-editor')
    const btn = within(panel).getByRole('button', { name: C.listen })
    await act(async () => { fireEvent.keyDown(btn, { key: 'ArrowRight' }); fireEvent.keyUp(btn, { key: 'ArrowRight' }); await tick(30) })
    expect(screen.getByTestId('caption-editor')).toHaveTextContent(C.of(1, 2))
    expect((screen.getByLabelText('Texto del subtítulo') as HTMLTextAreaElement).value).toBe('Hey, where are we going?')
  })
})
