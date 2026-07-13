// TC-089: load screen navigation — autenticado permanece en load, no auto-redirect a library
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { useSessionMock } from '../setup'

function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }

const SESSION_AUTH = { data: { user: { email: 'x@x.com' } }, status: 'authenticated' as const }

describe('Player — TC-089: load screen navigation con auth', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ videos: [] }),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useSessionMock.mockReturnValue({ data: null, status: 'unauthenticated' as const })
  })

  // TC-089a: autenticarse no redirige automáticamente a 'library'
  it('TC-089a: al estar autenticado, screen permanece en load — no auto-redirect', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    const { getByText } = render(<Player />)
    await act(async () => { await tick(150) })
    expect(getByText(/arrastrá el video aquí/i)).toBeTruthy()
  })

  // TC-089b: load screen muestra botones Mi biblioteca y Salir cuando autenticado
  it('TC-089b: load screen muestra botones Mi biblioteca y Salir cuando autenticado', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    const { getAllByRole } = render(<Player />)
    await act(async () => { await tick(150) })
    const btns = getAllByRole('button').map(b => b.textContent?.toLowerCase() ?? '')
    expect(btns.some(t => t.includes('mi biblioteca'))).toBe(true)
    expect(btns.some(t => t.includes('salir'))).toBe(true)
  })

  // TC-089c: click en "Mi biblioteca" navega a pantalla library
  it('TC-089c: click en Mi biblioteca navega a pantalla library', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    const { getAllByRole, getByText } = render(<Player />)
    await act(async () => { await tick(150) })
    const btn = getAllByRole('button').find(b => /mi biblioteca/i.test(b.textContent ?? ''))
    expect(btn).toBeTruthy()
    await act(async () => { fireEvent.click(btn!); await tick(150) })
    expect(getByText(/todavía no guardaste ningún video/i)).toBeTruthy()
  })

  // TC-089d: click en "Mi biblioteca" dispara fetchLibrary (GET /api/videos)
  it('TC-089d: click en Mi biblioteca llama fetch a /api/videos', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    const { getAllByRole } = render(<Player />)
    await act(async () => { await tick(150) })
    const btn = getAllByRole('button').find(b => /mi biblioteca/i.test(b.textContent ?? ''))
    expect(btn).toBeTruthy()
    await act(async () => { fireEvent.click(btn!); await tick(150) })
    expect(global.fetch).toHaveBeenCalledWith('/api/videos')
  })
})
