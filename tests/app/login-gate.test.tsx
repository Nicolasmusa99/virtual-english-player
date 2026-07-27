// TC-090: gate de login — pantalla de bienvenida cuando el usuario no está autenticado
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { useSessionMock, signInMock } from '../setup'

function tick(ms = 100) { return new Promise<void>(r => setTimeout(r, ms)) }

const SESSION_UNAUTH = { data: null, status: 'unauthenticated' as const }
const SESSION_LOADING = { data: null, status: 'loading' as const }

describe('Player — TC-090: gate de login (unauthenticated)', () => {
  afterEach(() => {
    useSessionMock.mockReturnValue({ data: { user: { email: 'test@example.com' } }, status: 'authenticated' as const })
  })

  // TC-090a: unauthenticated → muestra botón "Iniciar sesión con Google"
  it('TC-090a: muestra botón Iniciar sesión con Google cuando no está logueado', async () => {
    useSessionMock.mockReturnValue(SESSION_UNAUTH)
    const { getByRole } = render(<Player />)
    await act(async () => { await tick(50) })
    const btn = getByRole('button', { name: /iniciar sesión con google/i })
    expect(btn).toBeTruthy()
  })

  // TC-090b: unauthenticated → NO renderiza el dropzone (input[type=file] ausente)
  it('TC-090b: no muestra input[type=file] cuando no está logueado', async () => {
    useSessionMock.mockReturnValue(SESSION_UNAUTH)
    const { container } = render(<Player />)
    await act(async () => { await tick(50) })
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  // TC-090c: loading → también muestra el gate (no el dropzone)
  it('TC-090c: tampoco muestra input[type=file] durante estado loading', async () => {
    useSessionMock.mockReturnValue(SESSION_LOADING)
    const { container } = render(<Player />)
    await act(async () => { await tick(50) })
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  // TC-090d: click en el botón dispara signIn('google')
  it('TC-090d: click en el botón dispara signIn con provider google', async () => {
    useSessionMock.mockReturnValue(SESSION_UNAUTH)
    const { getByRole } = render(<Player />)
    await act(async () => { await tick(50) })
    const btn = getByRole('button', { name: /iniciar sesión con google/i })
    await act(async () => { fireEvent.click(btn) })
    expect(signInMock).toHaveBeenCalledWith('google')
  })
})
