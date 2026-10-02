// TC-089: load screen navigation — autenticado permanece en load, no auto-redirect a library
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent, within, screen } from '@testing-library/react'
import Player from '@/app/page'
import { useSessionMock } from '../setup'

function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }
// La barra lateral (la primera navegación "Secciones"; la segunda son las pestañas del celular).
const getAllByRoleNav = () => screen.getAllByRole('navigation', { name: 'Secciones' })

const SESSION_AUTH = { data: { user: { email: 'x@x.com', role: 'admin' } }, status: 'authenticated' as const }

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

  // TC-089e: el PROFE no ve el dropzone de subir. Rediseño (fase 2): su inicio es
  // "Hoy" y navega con la barra lateral: Hoy, Agenda, Alumnos, Biblioteca, Ejercicios.
  it('TC-089e: profesor no ve dropzone de subir; inicio "Hoy" y barra lateral del profe', async () => {
    useSessionMock.mockReturnValue({ data: { user: { email: 'p@x.com', role: 'profesor' } }, status: 'authenticated' as const })
    const { container, getByRole } = render(<Player />)
    await act(async () => { await tick(150) })
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(getByRole('heading', { level: 1, name: /^Hoy, / })).toBeTruthy()
    const rail = within(getAllByRoleNav()[0])
    expect(rail.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Hoy', 'Agenda', 'Alumnos', 'Biblioteca', 'Ejercicios'])
    expect(rail.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page')
  })

  // TC-089g: la barra lateral lleva a cada sección (y marca dónde estás)
  it('TC-089g: profesor: "Alumnos" abre sus alumnos y "Biblioteca" la compartida', async () => {
    useSessionMock.mockReturnValue({ data: { user: { email: 'p@x.com', role: 'profesor' } }, status: 'authenticated' as const })
    const { getByRole } = render(<Player />)
    await act(async () => { await tick(150) })
    const rail = within(getAllByRoleNav()[0])
    await act(async () => { fireEvent.click(rail.getByRole('button', { name: 'Alumnos' })); await tick(150) })
    expect(getByRole('heading', { level: 1, name: 'Alumnos' })).toBeTruthy()
    expect(global.fetch).toHaveBeenCalledWith('/api/users')
    expect(rail.getByRole('button', { name: 'Alumnos' })).toHaveAttribute('aria-current', 'page')
    await act(async () => { fireEvent.click(rail.getByRole('button', { name: 'Biblioteca' })); await tick(150) })
    expect(getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeTruthy()
  })

  // TC-089h: el admin tiene sus propias secciones (sin Hoy ni Agenda)
  it('TC-089h: admin: Subir video, Mi biblioteca, Biblioteca compartida, Usuarios, Ejercicios', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    render(<Player />)
    await act(async () => { await tick(150) })
    const rail = within(getAllByRoleNav()[0])
    expect(rail.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Subir video', 'Mi biblioteca', 'Biblioteca compartida', 'Usuarios', 'Ejercicios'])
    expect(rail.queryByTestId('zoom-status')).toBeNull() // "Mi sala de Zoom" es solo del profe
  })

  // TC-089f: el ADMIN sí ve el dropzone de subir
  it('TC-089f: admin ve el dropzone de subir', async () => {
    useSessionMock.mockReturnValue(SESSION_AUTH)
    const { container } = render(<Player />)
    await act(async () => { await tick(150) })
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })
})
