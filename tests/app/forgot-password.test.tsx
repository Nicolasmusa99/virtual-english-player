// @vitest-environment jsdom
// F5 (login-password) — pantalla "Olvidé mi contraseña" (/forgot-password).
// INVARIANTE: cualquier respuesta OK deja la pantalla con el MISMO texto fijo; el
// cuerpo de la respuesta no se lee nunca, así que no puede delatar cuentas.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ForgotPasswordForm, { FORGOT_MESSAGES } from '@/app/forgot-password/ForgotPasswordForm'

let fetchMock: ReturnType<typeof vi.fn>
const respond = (status: number, body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(respond(200)))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const emailInput = () => screen.getByLabelText('Email') as HTMLInputElement
const sendBtn = () => screen.getByRole('button', { name: /^(Mandame el link|Enviando…)$/ })
async function ask(email = 'ana@mail.com') {
  fireEvent.change(emailInput(), { target: { value: email } })
  await act(async () => { fireEvent.click(sendBtn()) })
}

describe('INVARIANTE: el mensaje de "enviado" es fijo y no delata cuentas', () => {
  it('un 200 con un cuerpo "revelador" → solo el texto fijo; el cuerpo NO aparece en el DOM', async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true, exists: true, note: 'CUENTA ENCONTRADA' }))
    const { container } = render(<ForgotPasswordForm />)
    await ask()
    expect(screen.getByRole('status')).toHaveTextContent(FORGOT_MESSAGES.sent)
    expect(container.textContent).not.toMatch(/CUENTA ENCONTRADA|exists/)
  })

  it('tres respuestas 200 con cuerpos distintos → pantalla IDÉNTICA', async () => {
    const bodies = [{ ok: true }, { ok: true, exists: false }, { ok: true, exists: true, role: 'alumno' }]
    const snaps: string[] = []
    for (const body of bodies) {
      fetchMock.mockResolvedValue(respond(200, body))
      const { container, unmount } = render(<ForgotPasswordForm />)
      await ask('ana@mail.com')
      snaps.push(container.innerHTML)
      unmount()
    }
    expect(new Set(snaps).size).toBe(1)
  })

  it('el código nunca lee el cuerpo (json() espiado y saboteado)', async () => {
    const res = respond(200)
    const jsonSpy = vi.spyOn(res, 'json').mockRejectedValue(new Error('no deberían leerme'))
    fetchMock.mockResolvedValue(res)
    render(<ForgotPasswordForm />)
    await ask()
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(FORGOT_MESSAGES.sent)
  })

  it('el mensaje de "enviado" no repite el email escrito', async () => {
    const { container } = render(<ForgotPasswordForm />)
    await ask('ana@mail.com')
    expect(container.textContent).not.toContain('ana@mail.com')
  })
})

describe('validación y errores (fijos, no hablan de ninguna cuenta)', () => {
  it('email mal formado → aviso y NO se llama al servidor', async () => {
    render(<ForgotPasswordForm />)
    for (const bad of ['', 'ana', 'ana@', 'ana@mail', 'con espacio@mail.com']) {
      await ask(bad)
      expect(screen.getByRole('alert')).toHaveTextContent(FORGOT_MESSAGES.invalidEmail)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('403 / 500 → texto genérico de falla, el formulario vuelve y el cuerpo no se muestra', async () => {
    for (const status of [403, 500]) {
      fetchMock.mockResolvedValue(respond(status, { error: 'detalle interno ' + status }))
      const { container, unmount } = render(<ForgotPasswordForm />)
      await ask()
      expect(screen.getByRole('alert')).toHaveTextContent(FORGOT_MESSAGES.failed)
      expect(sendBtn()).not.toBeDisabled()
      expect(container.textContent).not.toMatch(/detalle interno/)
      unmount()
    }
  })

  it('error de red → texto genérico de falla', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ForgotPasswordForm />)
    await ask()
    expect(screen.getByRole('alert')).toHaveTextContent(FORGOT_MESSAGES.failed)
  })
})

describe('envío', () => {
  it('manda el email sin espacios a /api/auth/forgot-password', async () => {
    render(<ForgotPasswordForm />)
    await ask('  ana@mail.com  ')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/forgot-password')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'ana@mail.com' })
  })

  it('doble envío → UN solo pedido (botón deshabilitado mientras envía)', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolve = r }))
    render(<ForgotPasswordForm />)
    fireEvent.change(emailInput(), { target: { value: 'ana@mail.com' } })
    fireEvent.click(sendBtn())
    fireEvent.click(sendBtn())
    fireEvent.submit(sendBtn().closest('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sendBtn()).toBeDisabled()
    expect(sendBtn()).toHaveTextContent('Enviando…')
    await act(async () => { resolve(respond(200)) })
  })
})

describe('navegación', () => {
  it('"Probar con otro email" vuelve al formulario con el email conservado', async () => {
    render(<ForgotPasswordForm />)
    await ask('ana@mial.com') // tipeo
    fireEvent.click(screen.getByRole('button', { name: 'Probar con otro email' }))
    expect(emailInput().value).toBe('ana@mial.com')
    expect(sendBtn()).toBeInTheDocument()
  })

  it('"Volver al inicio" lleva a / (en el formulario y en "enviado")', async () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
    await ask()
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })

  it('campo con etiqueta visible y teclado de email en el celular', () => {
    render(<ForgotPasswordForm />)
    expect(emailInput()).toHaveAttribute('type', 'email')
    expect(emailInput()).toHaveAttribute('inputmode', 'email')
  })
})
