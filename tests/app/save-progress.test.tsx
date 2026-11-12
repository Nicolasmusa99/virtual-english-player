// @vitest-environment jsdom
// Avance del alumno (2026-11): el player del alumno guarda dónde va (pausa y al salir),
// sin mostrarle nada nuevo.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import StudentPlayer from '@/app/StudentPlayer'

const DATA = { id: '11111111-2222-4333-8444-555555555555', originalName: 'Peli.mp4', storageUrl: 'https://x.public.blob.vercel-storage.com/v.mp4', durationSec: 600, phrases: [{ start: 1, end: 3, text: 'Hi' }], delay: 0 }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => { fetchMock = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

const puts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')

describe('StudentPlayer guarda el avance', () => {
  it('al pausar guarda el segundo, y no repite si no se movió', () => {
    const { container } = render(<StudentPlayer data={DATA} onBack={() => {}} />)
    const v = container.querySelector('video')!
    Object.defineProperty(v, 'currentTime', { value: 123.4, writable: true, configurable: true })
    fireEvent(v, new Event('pause'))
    fireEvent(v, new Event('pause'))
    expect(puts()).toHaveLength(1)
    const [url, init] = puts()[0]
    expect(url).toBe(`/api/student/material/${DATA.id}/progress`)
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ position: 123.4 })
    expect((init as RequestInit).keepalive).toBe(true)
  })

  it('al salir del player guarda dónde quedó', () => {
    const { container, unmount } = render(<StudentPlayer data={DATA} onBack={() => {}} />)
    const v = container.querySelector('video')!
    Object.defineProperty(v, 'currentTime', { value: 42, writable: true, configurable: true })
    unmount()
    expect(puts()).toHaveLength(1)
    expect(JSON.parse((puts()[0][1] as RequestInit).body as string)).toEqual({ position: 42 })
  })

  it('en el segundo 0 no guarda nada y no le muestra nada nuevo al alumno', () => {
    const { container, unmount } = render(<StudentPlayer data={DATA} onBack={() => {}} />)
    fireEvent(container.querySelector('video')!, new Event('pause'))
    expect(screen.queryByText(/Quedó|Seguir/)).toBeNull()
    unmount()
    expect(puts()).toHaveLength(0)
  })
})
