// @vitest-environment jsdom
// La bienvenida (2026-11): entrar o crear cuenta.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { signInMock } from '../setup'
import WelcomeAuth, { WELCOME_TEXTS as W } from '@/app/WelcomeAuth'
import { LOGIN_TEXTS as L } from '@/app/PasswordLogin'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  signInMock.mockReset()
  document.cookie = 've-signup=; Max-Age=0; Path=/'
  fetchMock = vi.fn(() => Promise.resolve(json(201, { ok: true })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('WelcomeAuth', () => {
  it('entrar: Google, usuario y contraseña, y el link a crear cuenta', () => {
    render(<WelcomeAuth googleClassName="g" />)
    fireEvent.click(screen.getByRole('button', { name: W.googleIn }))
    expect(signInMock).toHaveBeenCalledWith('google')
    expect(document.cookie).not.toContain('ve-signup=1')
    expect(screen.getByRole('button', { name: L.open })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: W.create })).toBeInTheDocument()
  })

  it('crear cuenta con Google deja la intención y va a Google', () => {
    render(<WelcomeAuth googleClassName="g" />)
    fireEvent.click(screen.getByRole('button', { name: W.create }))
    expect(screen.getByRole('heading', { name: W.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: W.googleUp }))
    expect(document.cookie).toContain('ve-signup=1')
    expect(signInMock).toHaveBeenCalledWith('google')
  })

  it('crear cuenta: nombre y apellido, mail y contraseña, y entra', async () => {
    const onSignedIn = vi.fn()
    render(<WelcomeAuth googleClassName="g" onSignedIn={onSignedIn} />)
    fireEvent.click(screen.getByRole('button', { name: W.create }))
    expect(screen.queryByLabelText(/Usuario/)).toBeNull()
    fireEvent.change(screen.getByLabelText(W.name), { target: { value: 'Sofía Gómez' } })
    fireEvent.change(screen.getByLabelText(W.email), { target: { value: ' Sofi@Gmail.com ' } })
    fireEvent.change(screen.getByLabelText(W.password), { target: { value: 'clave-segura-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: W.submit })) })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/signup')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ name: 'Sofía Gómez', email: 'sofi@gmail.com', password: 'clave-segura-1' })
    expect(onSignedIn).toHaveBeenCalled()
  })

  it('sin mail, o con la contraseña corta: avisa sin llamar al servidor; mail tomado: muestra el error', async () => {
    render(<WelcomeAuth googleClassName="g" onSignedIn={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: W.create }))
    fireEvent.change(screen.getByLabelText(W.name), { target: { value: 'Sofía Gómez' } })
    fireEvent.change(screen.getByLabelText(W.password), { target: { value: 'clave-segura-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: W.submit })) })
    expect(screen.getByRole('alert')).toHaveTextContent('mail válido')
    fireEvent.change(screen.getByLabelText(W.email), { target: { value: 'sofi@gmail.com' } })
    fireEvent.change(screen.getByLabelText(W.password), { target: { value: 'corta' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: W.submit })) })
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8')
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue(json(409, { error: 'Ya hay una cuenta con ese mail. Entrá con ella.' }))
    fireEvent.change(screen.getByLabelText(W.password), { target: { value: 'clave-segura-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: W.submit })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Ya hay una cuenta con ese mail')
  })

  it('si volvió de Google sin cuenta, ofrece crearla', () => {
    render(<WelcomeAuth googleClassName="g" accessDenied />)
    expect(screen.getByRole('alert')).toHaveTextContent(W.denied)
    fireEvent.click(screen.getAllByRole('button', { name: W.create })[0])
    expect(screen.getByRole('heading', { name: W.title })).toBeInTheDocument()
  })
})
