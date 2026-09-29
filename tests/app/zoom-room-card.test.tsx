// @vitest-environment jsdom
// Calendario (G0) — tarjeta "Mi sala de Zoom" del inicio del profe.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ZoomRoomCard, { ZOOM_TEXTS } from '@/app/ZoomRoomCard'

const ROOM = 'https://us02web.zoom.us/j/8412345678'
let fetchMock: ReturnType<typeof vi.fn>
let putResponse: () => Response
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  putResponse = () => json(200, { zoomUrl: ROOM })
  fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(init?.method === 'PUT' ? putResponse() : json(200, { zoomUrl: null })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('ZoomRoomCard', () => {
  it('carga la sala guardada', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(200, { zoomUrl: ROOM })))
    render(<ZoomRoomCard />)
    await flush()
    expect(screen.getByLabelText(ZOOM_TEXTS.label)).toHaveValue(ROOM)
    expect(fetchMock).toHaveBeenCalledWith('/api/me/zoom')
  })

  it('guardar: PUT con el link y confirma', async () => {
    render(<ZoomRoomCard />)
    await flush()
    fireEvent.change(screen.getByLabelText(ZOOM_TEXTS.label), { target: { value: ` ${ROOM} ` } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ZOOM_TEXTS.save })) })
    await flush()
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect([url, init.method, JSON.parse(init.body)]).toEqual(['/api/me/zoom', 'PUT', { zoomUrl: ROOM }])
    expect(screen.getByRole('status')).toHaveTextContent(ZOOM_TEXTS.saved)
  })

  it('vaciar y guardar = quitar la sala', async () => {
    putResponse = () => json(200, { zoomUrl: null })
    render(<ZoomRoomCard />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ZOOM_TEXTS.save })) })
    await flush()
    expect(screen.getByRole('status')).toHaveTextContent(ZOOM_TEXTS.removed)
  })

  it('el error del servidor se muestra', async () => {
    putResponse = () => json(400, { error: 'Tiene que ser un link de Zoom (https://…zoom.us/…)' })
    render(<ZoomRoomCard />)
    await flush()
    fireEvent.change(screen.getByLabelText(ZOOM_TEXTS.label), { target: { value: 'https://meet.google.com/x' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: ZOOM_TEXTS.save })) })
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Tiene que ser un link de Zoom')
  })
})
