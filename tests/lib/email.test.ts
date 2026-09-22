// @vitest-environment node
// F1 infra de email — transporte (lib/email.ts). CERO RED: el SDK de Resend está
// mockeado, así que la suite nunca manda nada ni necesita API key.
// El test más importante de este archivo es el de la allowlist: es la barrera que
// hace imposible escribirle a una persona real desde pruebas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.hoisted(() => vi.fn())
vi.mock('resend', () => ({
  Resend: class {
    constructor(public apiKey: string) {}
    emails = { send: sendMock }
  },
}))

import {
  emailAllowlist,
  isRecipientAllowed,
  resolveEmailMode,
  sendEmail,
  type EmailMessage,
} from '@/lib/email'

const ENV_KEYS = ['VERCEL_ENV', 'EMAIL_MODE', 'EMAIL_TEST_ALLOWLIST', 'EMAIL_FROM', 'RESEND_API_KEY']
const ORIGINAL = { ...process.env }

const MSG: EmailMessage = {
  to: 'Alumno@Mail.com',
  subject: 'Activá tu cuenta',
  text: 'Entrá acá: https://app.test/set-password?token=abc',
  html: '<p>hola</p>',
}

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  sendMock.mockReset().mockResolvedValue({ data: { id: 're_123' }, error: null })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL }
})

describe('resolveEmailMode', () => {
  it('fuera de producción el default es console (no se manda nada)', () => {
    expect(resolveEmailMode()).toBe('console') // VERCEL_ENV undefined (local)
    process.env.VERCEL_ENV = 'preview'
    expect(resolveEmailMode()).toBe('console')
    process.env.VERCEL_ENV = 'development'
    expect(resolveEmailMode()).toBe('console')
  })

  it('en producción el default es resend', () => {
    process.env.VERCEL_ENV = 'production'
    expect(resolveEmailMode()).toBe('resend')
  })

  it('EMAIL_MODE explícito manda, sin importar mayúsculas ni espacios', () => {
    process.env.EMAIL_MODE = ' Resend '
    expect(resolveEmailMode()).toBe('resend')
    process.env.EMAIL_MODE = 'off'
    expect(resolveEmailMode()).toBe('off')
  })

  it('avisa fuerte si en PRODUCCIÓN se desactivó el envío', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.EMAIL_MODE = 'console'
    expect(resolveEmailMode()).toBe('console')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PRODUCCIÓN'))
  })

  it('un EMAIL_MODE inválido se ignora y cae al default (no rompe)', () => {
    process.env.EMAIL_MODE = 'smtp'
    expect(resolveEmailMode()).toBe('console')
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('allowlist de destinatarios', () => {
  it('parsea la lista: separa por coma, recorta y pasa a minúsculas', () => {
    process.env.EMAIL_TEST_ALLOWLIST = ' Nico@Mail.com , otro@x.com ,, '
    expect(emailAllowlist()).toEqual(['nico@mail.com', 'otro@x.com'])
  })

  it('FAIL-CLOSED: fuera de producción, lista vacía = no se le puede escribir a NADIE', () => {
    expect(isRecipientAllowed('nico@mail.com')).toBe(false)
    process.env.EMAIL_TEST_ALLOWLIST = ''
    expect(isRecipientAllowed('nico@mail.com')).toBe(false)
  })

  it('fuera de producción solo pasan los de la lista (case-insensitive)', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.EMAIL_TEST_ALLOWLIST = 'nico@mail.com'
    expect(isRecipientAllowed('NICO@Mail.com ')).toBe(true)
    expect(isRecipientAllowed('alumno-real@gmail.com')).toBe(false)
  })

  it('en producción se le puede escribir a cualquiera', () => {
    process.env.VERCEL_ENV = 'production'
    expect(isRecipientAllowed('alumno-real@gmail.com')).toBe(true)
  })
})

describe('sendEmail — modo console (default de desarrollo)', () => {
  it('imprime el mail con el link y NO llama a Resend', async () => {
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: true, mode: 'console' })
    expect(sendMock).not.toHaveBeenCalled()
    const printed = logSpy.mock.calls.flat().join('\n')
    expect(printed).toContain('https://app.test/set-password?token=abc')
    expect(printed).toContain('Alumno@Mail.com')
  })
})

describe('sendEmail — modo off', () => {
  it('no manda nada y lo reporta', async () => {
    process.env.EMAIL_MODE = 'off'
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: false, reason: 'off' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('sendEmail — modo resend', () => {
  beforeEach(() => {
    process.env.EMAIL_MODE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('🛑 INVARIANTE: fuera de producción, un destinatario fuera de la allowlist NO recibe nada', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.EMAIL_TEST_ALLOWLIST = 'nico@mail.com'
    const res = await sendEmail({ ...MSG, to: 'alumno-real@gmail.com' })
    expect(res).toEqual({ ok: false, reason: 'allowlist' })
    expect(sendMock).not.toHaveBeenCalled() // ← lo que importa: cero envío
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BLOQUEADO'))
  })

  it('🛑 INVARIANTE: sin allowlist configurada tampoco sale nada fuera de producción', async () => {
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: false, reason: 'allowlist' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('un destinatario de la allowlist sí se manda, con el formato esperado', async () => {
    process.env.EMAIL_TEST_ALLOWLIST = 'alumno@mail.com'
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: true, mode: 'resend', id: 're_123' })
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Virtual English <onboarding@resend.dev>',
      to: 'Alumno@Mail.com',
      subject: 'Activá tu cuenta',
      text: MSG.text,
      html: '<p>hola</p>',
    })
  })

  it('sin html, no se manda el campo html', async () => {
    process.env.EMAIL_TEST_ALLOWLIST = 'alumno@mail.com'
    await sendEmail({ to: MSG.to, subject: 's', text: 't' })
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty('html')
  })

  it('EMAIL_FROM pisa el remitente por defecto', async () => {
    process.env.EMAIL_TEST_ALLOWLIST = 'alumno@mail.com'
    process.env.EMAIL_FROM = 'VE <no-responder@virtualenglish.test>'
    await sendEmail(MSG)
    expect(sendMock.mock.calls[0][0].from).toBe('VE <no-responder@virtualenglish.test>')
  })

  it('en producción se manda sin pasar por la allowlist', async () => {
    process.env.VERCEL_ENV = 'production'
    const res = await sendEmail({ ...MSG, to: 'alumno-real@gmail.com' })
    expect(res).toMatchObject({ ok: true, mode: 'resend' })
    expect(sendMock).toHaveBeenCalled()
  })

  it('sin RESEND_API_KEY no se intenta mandar', async () => {
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_TEST_ALLOWLIST = 'alumno@mail.com'
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: false, reason: 'no-api-key' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('sendEmail — nunca tira', () => {
  beforeEach(() => {
    process.env.EMAIL_MODE = 'resend'
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_TEST_ALLOWLIST = 'alumno@mail.com'
  })

  it('si Resend devuelve error, se reporta sin tirar', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'dominio no verificado' } })
    const res = await sendEmail(MSG)
    expect(res).toEqual({ ok: false, reason: 'error', detail: 'dominio no verificado' })
    expect(errSpy).toHaveBeenCalled()
  })

  it('si el SDK explota (red caída), se reporta sin tirar', async () => {
    sendMock.mockRejectedValue(new Error('ECONNRESET'))
    await expect(sendEmail(MSG)).resolves.toEqual({ ok: false, reason: 'error', detail: 'ECONNRESET' })
  })
})
