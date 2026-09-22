// @vitest-environment node
// F4 — POST /api/auth/forgot-password + lib/passwordReset (lo que corre después).
//
// Corre DE VERDAD: la ruta, processResetRequest, las claves/límites del throttle,
// la plantilla del mail y appUrl. Se mockean: la búsqueda del usuario, la emisión
// del token, el envío del mail y las lecturas/escrituras del contador.
// `after()` de Next se intercepta con una cola: así se puede afirmar que la
// respuesta sale ANTES de que corra cualquier trabajo que dependa de la cuenta.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { afterQueue, findUserMock, createTokenMock, sendMock, hitMock } = vi.hoisted(() => ({
  afterQueue: [] as Array<() => unknown>,
  findUserMock: vi.fn(),
  createTokenMock: vi.fn(),
  sendMock: vi.fn(),
  hitMock: vi.fn(),
}))

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (task: () => unknown) => { afterQueue.push(task) },
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/users', () => ({ findUserByEmail: findUserMock }))
vi.mock('@/lib/passwordTokens', () => ({ createPasswordToken: createTokenMock }))
vi.mock('@/lib/email', () => ({ sendEmail: sendMock }))
vi.mock('@/lib/loginThrottle', async (orig) => ({
  ...(await orig<typeof import('@/lib/loginThrottle')>()),
  hit: hitMock,
}))

import { POST } from '@/app/api/auth/forgot-password/route'
import { processResetRequest } from '@/lib/passwordReset'
import { emailKey, ipKey } from '@/lib/loginThrottle'

// El módulo de tokens está mockeado arriba; expiryFor se pide REAL aparte.
const { expiryFor: realExpiryFor } = await vi.importActual<typeof import('@/lib/passwordTokens')>('@/lib/passwordTokens')

const RAW = 'RESET-TOKEN-CRUDO-xyz'
const B = 'http://localhost:3000'

function forgot(body: unknown, o: { origin?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    host: 'localhost:3000',
    'x-forwarded-for': o.ip ?? '9.9.9.9',
  }
  const origin = o.origin === undefined ? B : o.origin
  if (origin !== null) headers.origin = origin
  return new NextRequest(`${B}/api/auth/forgot-password`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function flushAfter() {
  const tasks = afterQueue.splice(0)
  for (const t of tasks) await t()
}

// Los 4 casos de cuenta del pedido. `sendsMail`: si DESPUÉS de responder corresponde mandar.
const USER = { id: 'u-1', email: 'ana@mail.com', role: 'alumno', teacherId: 'p-1' }
const SCENARIOS: Array<[string, unknown, boolean]> = [
  ['no existe', null, false],
  ['existe, con rol y con contraseña', USER, true],
  ['existe pero SIN ROL', { ...USER, role: null }, false],
  // Sin contraseña (solo Google): findUserByEmail no mira credenciales → mismo
  // camino que "existe". Le llega el link a SU casilla = una invitación pedida por ella.
  ['existe SIN contraseña (solo Google)', USER, true],
]

beforeEach(() => {
  afterQueue.length = 0
  findUserMock.mockReset().mockResolvedValue(USER)
  createTokenMock.mockReset().mockResolvedValue({ raw: RAW, expiresAt: new Date() })
  sendMock.mockReset().mockResolvedValue({ ok: true, mode: 'console' })
  hitMock.mockReset().mockResolvedValue(true) // true = entra dentro del límite
})

// ─────────────────────────────────────────────────────────────────────────────
describe('INVARIANTE anti-enumeración: la respuesta es SIEMPRE la misma', () => {
  it('los 4 casos → status, cuerpo y headers byte a byte idénticos', async () => {
    const snaps: string[] = []
    for (const [, user] of SCENARIOS) {
      findUserMock.mockResolvedValue(user)
      const res = await POST(forgot({ email: 'ana@mail.com' }))
      snaps.push(JSON.stringify({
        status: res.status,
        body: await res.text(),
        cache: res.headers.get('cache-control'),
        cookie: res.headers.get('set-cookie'),
      }))
      await flushAfter()
    }
    expect(new Set(snaps).size).toBe(1)
    expect(JSON.parse(snaps[0])).toMatchObject({ status: 200, body: '{"ok":true}', cache: 'no-store', cookie: null })
  })

  it('la respuesta sale ANTES de mirar la cuenta: al responder, todavía no se buscó a nadie', async () => {
    const res = await POST(forgot({ email: 'ana@mail.com' }))
    expect(res.status).toBe(200)
    // Al volver POST, nada que dependa de la cuenta corrió todavía:
    expect(findUserMock).not.toHaveBeenCalled()
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(afterQueue).toHaveLength(1) // quedó agendado para después
    await flushAfter()
    expect(findUserMock).toHaveBeenCalledWith('ana@mail.com')
  })

  it('INVARIANTE timing: una búsqueda lenta NO demora la respuesta', async () => {
    findUserMock.mockImplementation(() => new Promise((r) => setTimeout(() => r(USER), 800)))
    const t0 = performance.now()
    await POST(forgot({ email: 'ana@mail.com' }))
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(200) // el trabajo de 800ms quedó para después
    await flushAfter()
  })

  it('rate-limited → también 200 {ok:true} idéntico (el freno no se puede sondear)', async () => {
    hitMock.mockResolvedValue(false)
    const res = await POST(forgot({ email: 'ana@mail.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    await flushAfter()
    expect(sendMock).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('lo que pasa DESPUÉS de responder, según la cuenta', () => {
  for (const [name, user, sendsMail] of SCENARIOS) {
    it(`${name} → ${sendsMail ? 'se emite token reset y sale el mail' : 'NO se emite token ni sale mail'}`, async () => {
      findUserMock.mockResolvedValue(user)
      await POST(forgot({ email: 'ana@mail.com' }))
      await flushAfter()
      if (sendsMail) {
        expect(createTokenMock).toHaveBeenCalledWith('u-1', 'reset')
        const sent = sendMock.mock.calls[0][0]
        expect(sent.to).toBe('ana@mail.com')
        expect(sent.subject).toMatch(/Restablecer/)
        expect(sent.text).toContain('/set-password?token=' + encodeURIComponent(RAW))
        expect(sent.text).toContain('1 hora')
      } else {
        expect(createTokenMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
      }
    })
  }

  it('el link de reset vence en 1 HORA (corto, como se decidió)', () => {
    const now = new Date('2026-09-22T12:00:00Z')
    expect(realExpiryFor('reset', now).getTime() - now.getTime()).toBe(60 * 60 * 1000)
  })

  it('normaliza el email (trim + minúsculas) para buscar y para el contador', async () => {
    await POST(forgot({ email: '  Ana@Mail.COM ' }))
    await flushAfter()
    expect(findUserMock).toHaveBeenCalledWith('ana@mail.com')
    expect(hitMock).toHaveBeenCalledWith('reset-email:ana@mail.com', 3, { windowMinutes: 60, lockMinutes: 60 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('anti-bombardeo (rate limiting)', () => {
  it('cuenta cada pedido: 3/hora por email y 10/hora por IP', async () => {
    await POST(forgot({ email: 'ana@mail.com' }, { ip: '1.2.3.4' }))
    await flushAfter()
    expect(hitMock).toHaveBeenCalledWith('reset-email:ana@mail.com', 3, { windowMinutes: 60, lockMinutes: 60 })
    expect(hitMock).toHaveBeenCalledWith('reset-ip:1.2.3.4', 10, { windowMinutes: 60, lockMinutes: 60 })
  })

  it('ANTI-ENUMERACIÓN: el pedido se cuenta AUNQUE la cuenta no exista', async () => {
    findUserMock.mockResolvedValue(null)
    await POST(forgot({ email: 'inventado@mail.com' }))
    await flushAfter()
    expect(hitMock).toHaveBeenCalledWith('reset-email:inventado@mail.com', 3, expect.anything())
  })

  it('frenado → no busca la cuenta, no emite token, no manda mail', async () => {
    hitMock.mockResolvedValue(false)
    await POST(forgot({ email: 'ana@mail.com' }))
    await flushAfter()
    expect(findUserMock).not.toHaveBeenCalled()
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('contadores SEPARADOS del login: pedir resets no bloquea el login ni al revés', () => {
    expect('reset-email:a@b.com').not.toBe(emailKey('a@b.com'))
    expect('reset-ip:1.1.1.1').not.toBe(ipKey('1.1.1.1'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('pedidos inválidos (se deciden antes de mirar ninguna cuenta)', () => {
  it('sin Origin / Origin ajeno → 403 y NO se agenda nada (no se puede disparar mails desde otro sitio)', async () => {
    expect((await POST(forgot({ email: 'ana@mail.com' }, { origin: null }))).status).toBe(403)
    expect((await POST(forgot({ email: 'ana@mail.com' }, { origin: 'https://evil.example' }))).status).toBe(403)
    expect(afterQueue).toHaveLength(0)
  })

  it('body inválido / email no-string / email gigante → 400 y NO se agenda nada', async () => {
    for (const body of ['no-json', { email: 123 }, {}, { email: 'a'.repeat(400) + '@b.com' }]) {
      expect((await POST(forgot(body))).status).toBe(400)
    }
    expect(afterQueue).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('processResetRequest nunca tira (la respuesta ya salió)', () => {
  it('si falla el envío → "send-failed", sin excepción', async () => {
    sendMock.mockResolvedValue({ ok: false, reason: 'allowlist' })
    await expect(processResetRequest('ana@mail.com', '9.9.9.9')).resolves.toBe('send-failed')
  })

  it('si explota la base → "error", sin excepción', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    findUserMock.mockRejectedValue(new Error('DB caída'))
    await expect(processResetRequest('ana@mail.com', '9.9.9.9')).resolves.toBe('error')
    err.mockRestore()
  })

  it('el token crudo viaja solo en el mail, nunca en la respuesta', async () => {
    const res = await POST(forgot({ email: 'ana@mail.com' }))
    await flushAfter()
    expect(await res.text()).not.toContain(RAW)
  })
})
