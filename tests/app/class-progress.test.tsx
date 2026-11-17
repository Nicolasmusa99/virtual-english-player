// @vitest-environment jsdom
// Avance en clase (2026-11): useClassProgress guarda dónde van el profe y el alumno.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useClassProgress } from '@/app/useClassProgress'

const VID = '11111111-2222-4333-8444-555555555555'
const S1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const S2 = 'aaaaaaaa-0000-4000-8000-000000000002'
let fetchMock: ReturnType<typeof vi.fn>
let pos = 0

function Probe(p: { videoId: string | null; studentId: string | null; playing: boolean }) {
  useClassProgress({ ...p, getPosition: () => pos })
  return null
}
const puts = () => fetchMock.mock.calls.map(([url, init]) => ({ url, body: JSON.parse((init as RequestInit).body as string) }))

beforeEach(() => { vi.useFakeTimers(); fetchMock = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', fetchMock); pos = 0 })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useClassProgress', () => {
  it('cada 10 s mientras reproduce y al pausar, para el alumno de la clase', () => {
    const { rerender } = render(<Probe videoId={VID} studentId={S1} playing />)
    pos = 30
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(puts()).toEqual([{ url: `/api/videos/${VID}/class-progress`, body: { studentId: S1, position: 30 } }])
    pos = 34.5
    rerender(<Probe videoId={VID} studentId={S1} playing={false} />)
    expect(puts()[1].body).toEqual({ studentId: S1, position: 34.5 })
  })

  it('al cambiar de alumno guarda lo del anterior, y al salir recuerda la última posición buena', () => {
    const { rerender, unmount } = render(<Probe videoId={VID} studentId={S1} playing />)
    pos = 12
    act(() => { vi.advanceTimersByTime(2000) })
    rerender(<Probe videoId={VID} studentId={S2} playing />)
    expect(puts()).toEqual([{ url: `/api/videos/${VID}/class-progress`, body: { studentId: S1, position: 12 } }])
    pos = 40
    act(() => { vi.advanceTimersByTime(2000) })
    pos = 0 // al salir del player el video vuelve a 0
    unmount()
    expect(puts()[1].body).toEqual({ studentId: S2, position: 40 })
  })

  it('sin alumno o sin video no guarda nada', () => {
    const { rerender, unmount } = render(<Probe videoId={VID} studentId={null} playing />)
    pos = 50
    act(() => { vi.advanceTimersByTime(20_000) })
    rerender(<Probe videoId={null} studentId={S1} playing />)
    act(() => { vi.advanceTimersByTime(20_000) })
    unmount()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
