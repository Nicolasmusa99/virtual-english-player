// @vitest-environment jsdom
// F5 (login-password) — WelcomeScreen: los dos caminos de entrada.
//
// El corazón de estos tests es el INVARIANTE DE SEGURIDAD de la pantalla: el
// mensaje de error sale SOLO del status HTTP. Se simulan respuestas cuyo cuerpo
// "revela" cosas (que la cuenta existe, que no tiene rol…) y se afirma que nada de
// eso llega al DOM, y que todos los 401 dejan la pantalla idéntica.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import WelcomeScreen, { LOGIN_MESSAGES, loginErrorFor } from '@/app/WelcomeScreen'
import { useSessionMock, signInMock } from '../setup'

const updateMock = vi.fn()
let fetchMock: ReturnType<typeof vi.fn>

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  updateMock.mockReset().mockResolvedValue({ user: { id: 'u-1', role: 'alumno' }, expires: 'x' })
  const session = { data: null, status: 'unauthenticated', update: updateMock }
  useSessionMock.mockReturnValue(session)
  signInMock.mockReset()
  fetchMock = vi.fn(() => Promise.resolve(respond(200, { ok: true })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useSessionMock.mockReturnValue({ data: { user: { email: 'test@example.com', role: 'admin' } }, status: 'authenticated' })
})

const emailInput = () => screen.getByLabelText('Email') as HTMLInputElement
const passwordInput = () => screen.getByLabelText('Contraseña') as HTMLInputElement
const submitBtn = () => screen.getByRole('button', { name: /^(Entrar|Entrando…)$/ })

function fill(email = 'ana@mail.com', password = 'una-clave-larga') {
  fireEvent.change(emailInput(), { target: { value: email } })
  fireEvent.change(passwordInput(), { target: { value: password } })
}
async function submitAndSettle() {
  await act(async () => { fireEvent.click(submitBtn()) })
}

// ─────────────────────────────────────────────────────────────────────────────
describe('los dos caminos, a la vista', () => {
  it('muestra el botón de Google Y el formulario de email + contraseña', () => {
    render(<WelcomeScreen accessDenied={false} />)
    expect(screen.getByRole('button', { name: /iniciar sesión con google/i })).toBeInTheDocument()
    expect(emailInput()).toBeInTheDocument()
    expect(passwordInput()).toBeInTheDocument()
    expect(submitBtn()).toBeInTheDocument()
    expect(screen.getByText('o con tu email')).toBeInTheDocument()
  })

  it('Google sigue igual: llama a signIn("google") y no toca el formulario', () => {
    render(<WelcomeScreen accessDenied={false} />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión con google/i }))
    expect(signInMock).toHaveBeenCalledWith('google')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('el aviso de cuenta no habilitada (allowlist de Google) aparece solo con accessDenied', () => {
    const { rerender } = render(<WelcomeScreen accessDenied={false} />)
    expect(screen.queryByText(/no está habilitada/)).toBeNull()
    rerender(<WelcomeScreen accessDenied />)
    expect(screen.getByText(/Tu cuenta no está habilitada/)).toBeInTheDocument()
  })

  it('el link de "olvidé mi contraseña" lleva a /forgot-password', () => {
    render(<WelcomeScreen accessDenied={false} />)
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('campos con etiqueta visible y autocomplete correcto (gestores de contraseñas)', () => {
    render(<WelcomeScreen accessDenied={false} />)
    expect(emailInput()).toHaveAttribute('autocomplete', 'username')
    expect(emailInput()).toHaveAttribute('type', 'email')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
    expect(passwordInput()).toHaveAttribute('type', 'password')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('INVARIANTE: el mensaje sale SOLO del status, nunca del cuerpo', () => {
  it('loginErrorFor: 401 → invalid, 429 → locked, todo lo demás → failed', () => {
    expect(loginErrorFor(401)).toBe(LOGIN_MESSAGES.invalid)
    expect(loginErrorFor(429)).toBe(LOGIN_MESSAGES.locked)
    for (const s of [400, 403, 404, 500, 502, 503]) expect(loginErrorFor(s)).toBe(LOGIN_MESSAGES.failed)
  })

  it('un 401 con un cuerpo "revelador" → solo el texto fijo; el cuerpo NO aparece en el DOM', async () => {
    fetchMock.mockResolvedValue(respond(401, { error: 'La cuenta ana@mail.com EXISTE pero no tiene rol asignado' }))
    const { container } = render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.invalid)
    expect(container.textContent).not.toMatch(/EXISTE|no tiene rol|asignado/)
  })

  it('los 4 tipos de 401 (cuerpos distintos) dejan la pantalla IDÉNTICA', async () => {
    const bodies = [
      { error: 'no existe' },
      { error: 'no tiene contraseña, usa Google' },
      { error: 'contraseña incorrecta' },
      { error: 'sin rol' },
    ]
    const snapshots: string[] = []
    for (const body of bodies) {
      fetchMock.mockResolvedValue(respond(401, body))
      const { container, unmount } = render(<WelcomeScreen accessDenied={false} />)
      fill()
      await submitAndSettle()
      snapshots.push(container.innerHTML)
      unmount()
    }
    expect(new Set(snapshots).size).toBe(1)
  })

  it('el código nunca lee el cuerpo: una respuesta cuyo json() explota igual muestra el texto fijo', async () => {
    const res = respond(401)
    const jsonSpy = vi.spyOn(res, 'json').mockRejectedValue(new Error('no deberían leerme'))
    fetchMock.mockResolvedValue(res)
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.invalid)
  })

  it('429 → "Demasiados intentos…"', async () => {
    fetchMock.mockResolvedValue(respond(429, { error: 'bloqueada hasta las 15:32' }))
    const { container } = render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.locked)
    expect(container.textContent).not.toMatch(/15:32/)
  })

  it('500 / 403 → mensaje genérico de falla', async () => {
    for (const status of [500, 403]) {
      fetchMock.mockResolvedValue(respond(status, { error: 'detalle interno ' + status }))
      const { container, unmount } = render(<WelcomeScreen accessDenied={false} />)
      fill()
      await submitAndSettle()
      expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.failed)
      expect(container.textContent).not.toMatch(/detalle interno/)
      unmount()
    }
  })

  it('error de red → mensaje genérico de falla', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.failed)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('flujo para alguien no técnico', () => {
  it('tras un 401: se borra la contraseña, queda el email y el foco vuelve a la contraseña', async () => {
    fetchMock.mockResolvedValue(respond(401))
    render(<WelcomeScreen accessDenied={false} />)
    fill('ana@mail.com', 'mal-mal-mal-mal')
    await submitAndSettle()
    expect(passwordInput().value).toBe('')
    expect(emailInput().value).toBe('ana@mail.com')
    expect(document.activeElement).toBe(passwordInput())
  })

  it('error de red: NO se borra la contraseña (puede reintentar sin reescribirla)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<WelcomeScreen accessDenied={false} />)
    fill('ana@mail.com', 'una-clave-larga')
    await submitAndSettle()
    expect(passwordInput().value).toBe('una-clave-larga')
  })

  it('campos vacíos → aviso y NO se llama al servidor', async () => {
    render(<WelcomeScreen accessDenied={false} />)
    await submitAndSettle()
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.empty)
    fill('ana@mail.com', '')
    await submitAndSettle()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('manda el email sin espacios y la contraseña tal cual', async () => {
    render(<WelcomeScreen accessDenied={false} />)
    fill('  ana@mail.com  ', ' con espacios ')
    await submitAndSettle()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/password-login')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'ana@mail.com', password: ' con espacios ' })
  })

  it('doble click → UN solo pedido (botón deshabilitado mientras entra)', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolve = r }))
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    fireEvent.click(submitBtn())
    fireEvent.click(submitBtn())
    fireEvent.submit(submitBtn().closest('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submitBtn()).toBeDisabled()
    expect(submitBtn()).toHaveTextContent('Entrando…')
    await act(async () => { resolve(respond(401)) })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('éxito', () => {
  it('200 → pide la sesión de nuevo con update() (la app aparece sola, sin recargar)', async () => {
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('200 pero la sesión no aparece → avisa y reactiva el botón (no queda trabado)', async () => {
    updateMock.mockResolvedValue(null)
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    await submitAndSettle()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_MESSAGES.failed))
    expect(submitBtn()).not.toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Mostrar / Ocultar contraseña', () => {
  it('alterna el type y el texto del botón', () => {
    render(<WelcomeScreen accessDenied={false} />)
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' })
    expect(toggle).toHaveTextContent('Mostrar')
    fireEvent.click(toggle)
    expect(passwordInput()).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveTextContent('Ocultar')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(passwordInput()).toHaveAttribute('type', 'password')
  })

  it('apretarlo NUNCA envía el formulario', () => {
    render(<WelcomeScreen accessDenied={false} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
