// @vitest-environment jsdom
// F5 (login-password) — UsersPanel: botón "Enviar invitación" con confirmación.
// Lo central: nada sale sin confirmar A QUIÉN va; los errores son textos fijos
// traducidos del status / reason (el texto del server no aparece nunca); sin doble envío.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import UsersPanel, { INVITE_MESSAGES, deliveryErrorFor, inviteErrorFor } from '@/app/UsersPanel'
import { INVITE_TTL_DAYS } from '@/lib/emailTemplates'

const USERS = [
  { id: 'al-1', email: 'ana@mail.com', role: 'alumno', teacherId: 'p-1' },
  { id: 'al-2', email: 'beto@mail.com', role: 'alumno', teacherId: 'p-1' },
  { id: 'nr-1', email: 'sinrol@mail.com', role: null, teacherId: null },
]

type Handler = (init?: RequestInit) => Response | Promise<Response>
let inviteHandler: Handler
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  inviteHandler = () => json(200, { ok: true, delivered: true, expiresAt: '2026-09-29T00:00:00Z' })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/users') return Promise.resolve(json(200, { users: USERS }))
    if (/^\/api\/users\/[^/]+\/invite$/.test(url)) return Promise.resolve(inviteHandler(init))
    return Promise.resolve(json(404, {}))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const inviteCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/invite'))
// Fila + su bloque (confirmación/resultado). Con la confirmación abierta el email
// aparece dos veces (fila y <strong>): la primera en el DOM es siempre la de la fila.
const rowOf = (email: string) => screen.getAllByText(email)[0].closest('div')!.parentElement!

async function mount(onOpenStudent?: (id: string, email: string) => void) {
  render(<UsersPanel role="admin" onOpenStudent={onOpenStudent} />)
  await screen.findByText('ana@mail.com')
}
async function confirmAndSend(email: string) {
  fireEvent.click(within(rowOf(email)).getByRole('button', { name: /Enviar invitación|Reenviar/ }))
  await act(async () => { fireEvent.click(within(rowOf(email)).getByRole('button', { name: 'Enviar' })) })
}

// ─────────────────────────────────────────────────────────────────────────────
describe('quién tiene botón', () => {
  it('las filas con email y rol tienen "Enviar invitación"; la fila SIN rol no', async () => {
    await mount()
    expect(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar invitación' })).toBeInTheDocument()
    expect(within(rowOf('beto@mail.com')).getByRole('button', { name: 'Enviar invitación' })).toBeInTheDocument()
    expect(within(rowOf('sinrol@mail.com')).queryByRole('button', { name: /invitación/ })).toBeNull()
  })

  it('"Abrir" sigue funcionando igual', async () => {
    const onOpen = vi.fn()
    await mount(onOpen)
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Abrir' }))
    expect(onOpen).toHaveBeenCalledWith('al-1', 'ana@mail.com')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('confirmación: nada sale sin confirmar A QUIÉN va', () => {
  it('click → aparece "¿Enviar invitación a ana@mail.com?" y NO se llama al server', async () => {
    await mount()
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar invitación' }))
    const box = screen.getByRole('group', { name: 'Confirmar invitación a ana@mail.com' })
    expect(box).toHaveTextContent('¿Enviar invitación a ana@mail.com?')
    expect(box).toHaveTextContent(`El link vence en ${INVITE_TTL_DAYS} días`)
    expect(box).toHaveTextContent('el link anterior deja de funcionar')
    expect(inviteCalls()).toHaveLength(0)
  })

  it('Cancelar → se cierra sin enviar', async () => {
    await mount()
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar invitación' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: /Confirmar invitación/ })).toBeNull()
    expect(inviteCalls()).toHaveLength(0)
  })

  it('una confirmación por vez: abrir la de otra fila cierra la anterior', async () => {
    await mount()
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar invitación' }))
    fireEvent.click(within(rowOf('beto@mail.com')).getByRole('button', { name: 'Enviar invitación' }))
    expect(screen.getAllByRole('group', { name: /Confirmar invitación/ })).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Confirmar invitación a beto@mail.com' })).toBeInTheDocument()
  })

  it('Enviar → POST a /api/users/{id}/invite de ESA persona', async () => {
    await mount()
    await confirmAndSend('beto@mail.com')
    expect(inviteCalls()).toHaveLength(1)
    expect(inviteCalls()[0][0]).toBe('/api/users/al-2/invite')
    expect((inviteCalls()[0][1] as RequestInit).method).toBe('POST')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resultado', () => {
  it('enviada → "✓ Invitación enviada a …" y el botón pasa a "Reenviar"', async () => {
    await mount()
    await confirmAndSend('ana@mail.com')
    expect(screen.getByRole('status')).toHaveTextContent('✓ Invitación enviada a ana@mail.com')
    expect(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Reenviar' })).toBeInTheDocument()
  })

  it('200 pero el mail no salió → texto fijo según `reason`', async () => {
    const cases: Array<[unknown, string]> = [
      ['allowlist', INVITE_MESSAGES.blockedByTestBarrier],
      ['no-api-key', INVITE_MESSAGES.mailNotConfigured],
      ['off', INVITE_MESSAGES.mailOff],
      ['error', INVITE_MESSAGES.mailFailed],
      [undefined, INVITE_MESSAGES.mailFailed],
    ]
    for (const [reason, text] of cases) expect(deliveryErrorFor(reason)).toBe(text)

    await mount()
    inviteHandler = () => json(200, { ok: true, delivered: false, reason: 'allowlist' })
    await confirmAndSend('ana@mail.com')
    expect(screen.getByRole('alert')).toHaveTextContent(INVITE_MESSAGES.blockedByTestBarrier)
  })

  it('status de error → textos fijos', () => {
    expect(inviteErrorFor(401)).toBe(INVITE_MESSAGES.expired)
    expect(inviteErrorFor(403)).toBe(INVITE_MESSAGES.forbidden)
    expect(inviteErrorFor(404)).toBe(INVITE_MESSAGES.notFound)
    expect(inviteErrorFor(400)).toBe(INVITE_MESSAGES.notInvitable)
    expect(inviteErrorFor(500)).toBe(INVITE_MESSAGES.failed)
  })

  it('INVARIANTE: el `error` crudo del server NO aparece en pantalla', async () => {
    await mount()
    for (const status of [400, 403, 404, 500]) {
      inviteHandler = () => json(status, { error: `DETALLE CRUDO ${status}` })
      await confirmAndSend('ana@mail.com')
      expect(screen.getByRole('alert')).toHaveTextContent(inviteErrorFor(status))
      expect(document.body.textContent).not.toMatch(/DETALLE CRUDO/)
    }
    inviteHandler = () => json(200, { ok: true, delivered: false, reason: 'error', detail: 'DETALLE CRUDO smtp' })
    await confirmAndSend('ana@mail.com')
    expect(document.body.textContent).not.toMatch(/DETALLE CRUDO/)
  })

  it('error de red → texto fijo', async () => {
    await mount()
    inviteHandler = () => { throw new TypeError('Failed to fetch') }
    await confirmAndSend('ana@mail.com')
    expect(screen.getByRole('alert')).toHaveTextContent(INVITE_MESSAGES.failed)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('sin doble envío', () => {
  it('mientras envía: el botón de la fila dice "Enviando…", está deshabilitado y hay UN solo POST', async () => {
    await mount()
    let resolve!: (r: Response) => void
    inviteHandler = () => new Promise<Response>((r) => { resolve = r }) as unknown as Response
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar invitación' }))
    fireEvent.click(within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviar' }))
    const rowBtn = within(rowOf('ana@mail.com')).getByRole('button', { name: 'Enviando…' })
    expect(rowBtn).toBeDisabled()
    fireEvent.click(rowBtn) // no reabre la confirmación ni manda otra
    expect(screen.queryByRole('group', { name: /Confirmar invitación/ })).toBeNull()
    expect(inviteCalls()).toHaveLength(1)
    await act(async () => { resolve(json(200, { ok: true, delivered: true })) })
  })
})
