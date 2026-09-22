// @vitest-environment jsdom
// F5 (login-password) — pantalla /set-password (poner contraseña desde el link).
// Lo central: el token se borra de la URL enseguida y nunca se muestra; "link
// inválido" es un único estado; la pantalla decide por `code`, y el único texto del
// servidor que se muestra es el motivo de la política (code invalid_password).
import React, { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import SetPasswordForm, { SET_PASSWORD_MESSAGES } from '@/app/set-password/SetPasswordForm'

const TOKEN = 'TOKEN-SECRETO-abc123_xyz'
const GOOD = 'caballo-correcto-bat'

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
let getHandler: Handler
let postHandler: Handler
let fetchMock: ReturnType<typeof vi.fn>

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  window.history.replaceState(null, '', `/set-password?token=${TOKEN}`)
  getHandler = () => json(200, { valid: true, purpose: 'invite' })
  postHandler = () => json(200, { ok: true })
  fetchMock = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve((init?.method === 'POST' ? postHandler : getHandler)(String(url), init)))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const getCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'POST')
const postCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')

async function mountAndSettle(ui: React.ReactElement = <SetPasswordForm />) {
  const utils = render(ui)
  await act(async () => {})
  return utils
}
function fillAndSave(pw = GOOD, repeat = pw) {
  fireEvent.change(screen.getByLabelText(/^Contraseña( nueva)?$/), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText('Repetí la contraseña'), { target: { value: repeat } })
  return act(async () => { fireEvent.click(screen.getByRole('button', { name: /^(Guardar contraseña|Guardando…)$/ })) })
}

// ─────────────────────────────────────────────────────────────────────────────
describe('el token', () => {
  it('se BORRA de la barra de direcciones apenas se monta la pantalla', async () => {
    await mountAndSettle()
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/set-password')
  })

  it('nunca aparece en la pantalla', async () => {
    const { container } = await mountAndSettle()
    expect(container.innerHTML).not.toContain(TOKEN)
  })

  it('se usa para verificar (GET) y para guardar (POST), aunque ya no esté en la URL', async () => {
    await mountAndSettle()
    expect(getCalls()[0][0]).toBe(`/api/auth/set-password?token=${encodeURIComponent(TOKEN)}`)
    await fillAndSave()
    expect(JSON.parse((postCalls()[0][1] as RequestInit).body as string)).toEqual({ token: TOKEN, password: GOOD })
  })

  it('StrictMode (doble efecto de React en desarrollo): igual llega al formulario, no a "inválido"', async () => {
    await mountAndSettle(<StrictMode><SetPasswordForm /></StrictMode>)
    await waitFor(() => expect(screen.getByText('Elegí tu contraseña')).toBeInTheDocument())
    expect(screen.queryByText('Este link ya no sirve')).toBeNull()
    for (const [url] of getCalls()) expect(String(url)).toContain(encodeURIComponent(TOKEN))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('verificación del link', () => {
  it('mientras verifica → "Verificando el link…"', async () => {
    getHandler = () => new Promise<Response>(() => {}) as unknown as Response
    render(<SetPasswordForm />)
    expect(screen.getByRole('status')).toHaveTextContent('Verificando el link…')
  })

  it('sin token en la URL → "Este link ya no sirve" SIN llamar al servidor', async () => {
    window.history.replaceState(null, '', '/set-password')
    await mountAndSettle()
    expect(screen.getByText('Este link ya no sirve')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GET 400 → "Este link ya no sirve" + botón a /forgot-password', async () => {
    getHandler = () => json(400, { valid: false, code: 'invalid_link', error: 'x' })
    await mountAndSettle()
    expect(screen.getByText('Este link ya no sirve')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir un link nuevo' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })

  it('invitación → "Elegí tu contraseña"; reset → "Elegí una contraseña nueva"', async () => {
    const { unmount } = await mountAndSettle()
    expect(screen.getByText('Elegí tu contraseña')).toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', `/set-password?token=${TOKEN}`)
    getHandler = () => json(200, { valid: true, purpose: 'reset' })
    await mountAndSettle()
    expect(screen.getByText('Elegí una contraseña nueva')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument()
  })

  it('red caída al verificar → NO dice "inválido": ofrece Reintentar, que usa el mismo token', async () => {
    getHandler = () => { throw new TypeError('Failed to fetch') }
    await mountAndSettle()
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.checkFailed)
    expect(screen.queryByText('Este link ya no sirve')).toBeNull()

    getHandler = () => json(200, { valid: true, purpose: 'invite' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })) })
    expect(screen.getByText('Elegí tu contraseña')).toBeInTheDocument()
    expect(String(getCalls().at(-1)![0])).toContain(encodeURIComponent(TOKEN))
  })

  it('respuesta rara del GET (200 sin valid:true) → inválido', async () => {
    getHandler = () => json(200, { valid: 'quizás', purpose: 'admin' })
    await mountAndSettle()
    expect(screen.getByText('Este link ya no sirve')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('chequeos antes de enviar (no llegan al servidor)', () => {
  it('vacía / < 10 caracteres / no coinciden → aviso y NINGÚN POST', async () => {
    await mountAndSettle()
    await fillAndSave('', '')
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.empty)
    await fillAndSave('corta', 'corta')
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.tooShort)
    await fillAndSave(GOOD, GOOD + 'x')
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.mismatch)
    expect(postCalls()).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('respuesta del POST: se decide por `code`', () => {
  it('code invalid_link → pasa a "Este link ya no sirve"', async () => {
    await mountAndSettle()
    postHandler = () => json(400, { code: 'invalid_link', error: 'El link no es válido o ya venció. Pedí uno nuevo.' })
    await fillAndSave()
    expect(screen.getByText('Este link ya no sirve')).toBeInTheDocument()
  })

  it('code invalid_password → muestra el motivo de la política (la ÚNICA excepción)', async () => {
    await mountAndSettle()
    postHandler = () => json(400, { code: 'invalid_password', error: 'La contraseña no puede contener tu email.' })
    await fillAndSave()
    expect(screen.getByRole('alert')).toHaveTextContent('La contraseña no puede contener tu email.')
    expect(screen.getByRole('button', { name: 'Guardar contraseña' })).not.toBeDisabled()
  })

  it('cualquier OTRO code con un texto raro → texto fijo del cliente; el del server NO aparece', async () => {
    const { container } = await mountAndSettle()
    for (const body of [
      { code: 'bad_request', error: 'DETALLE INTERNO bad_request' },
      { code: 'algo_nuevo', error: 'DETALLE INTERNO nuevo' },
      { error: 'DETALLE INTERNO sin code' },
    ]) {
      postHandler = () => json(400, body)
      await fillAndSave()
      expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.failed)
      expect(container.textContent).not.toMatch(/DETALLE INTERNO/)
    }
  })

  it('500 / red → texto fijo de falla, el formulario vuelve', async () => {
    await mountAndSettle()
    postHandler = () => json(500, { error: 'boom' })
    await fillAndSave()
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.failed)
    postHandler = () => { throw new TypeError('Failed to fetch') }
    await fillAndSave()
    expect(screen.getByRole('alert')).toHaveTextContent(SET_PASSWORD_MESSAGES.failed)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('éxito', () => {
  it('invitación → "¡Listo!" + "Ir a entrar", sin la nota de sesiones', async () => {
    await mountAndSettle()
    await fillAndSave()
    expect(screen.getByText('¡Listo!')).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent(/cerramos tu sesión/)
    expect(screen.getByRole('link', { name: 'Ir a entrar' })).toHaveAttribute('href', '/')
    expect(screen.queryByLabelText('Repetí la contraseña')).toBeNull() // el formulario se fue
  })

  it('reset → avisa que se cerraron las sesiones en todos los dispositivos', async () => {
    getHandler = () => json(200, { valid: true, purpose: 'reset' })
    await mountAndSettle()
    await fillAndSave()
    expect(screen.getByRole('status')).toHaveTextContent('Por seguridad, cerramos tu sesión en todos los dispositivos.')
  })

  it('doble envío → UN solo POST', async () => {
    await mountAndSettle()
    let resolve!: (r: Response) => void
    postHandler = () => new Promise<Response>((r) => { resolve = r }) as unknown as Response
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: GOOD } })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña'), { target: { value: GOOD } })
    const btn = screen.getByRole('button', { name: 'Guardar contraseña' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.submit(btn.closest('form')!)
    expect(postCalls()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    await act(async () => { resolve(json(200, { ok: true })) })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Mostrar / Ocultar', () => {
  it('cada campo tiene su botón y alterna su propio type', async () => {
    await mountAndSettle()
    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' })
    expect(toggles).toHaveLength(2)
    fireEvent.click(toggles[1])
    expect(screen.getByLabelText('Repetí la contraseña')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
  })

  it('campos con autocomplete new-password (el gestor sugiere/guarda) y la ayuda de 10 caracteres', async () => {
    await mountAndSettle()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Repetí la contraseña')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByText(/Al menos 10 caracteres/)).toBeInTheDocument()
  })
})
