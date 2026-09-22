// @vitest-environment node
// F1 — plantillas de los mails (lib/emailTemplates.ts). Lo que se controla acá es
// el CONTENIDO: que esté el link, que diga cuándo vence, que no filtre nada y que
// el HTML no se pueda envenenar.
import { describe, it, expect } from 'vitest'
import {
  INVITE_TTL_DAYS,
  RESET_TTL_MINUTES,
  inviteEmail,
  resetEmail,
} from '@/lib/emailTemplates'

const LINK = 'https://app.test/set-password?token=Zm9vYmFy-123_x'

describe('inviteEmail (primera contraseña)', () => {
  const mail = inviteEmail(LINK)

  it('tiene asunto y el link, en texto y en HTML', () => {
    expect(mail.subject).toBe('Activá tu cuenta de Virtual English')
    expect(mail.text).toContain(LINK)
    expect(mail.html).toContain(LINK.replace(/&/g, '&amp;'))
  })

  it('dice el vencimiento real y que es de un solo uso', () => {
    expect(mail.text).toContain(`${INVITE_TTL_DAYS} días`)
    expect(mail.text).toMatch(/una sola vez/)
    expect(mail.html).toContain(`${INVITE_TTL_DAYS} días`)
  })

  it('menciona que Google sigue siendo una opción (los dos caminos conviven)', () => {
    expect(mail.text).toMatch(/Google/)
  })
})

describe('resetEmail (olvidé mi contraseña)', () => {
  const mail = resetEmail(LINK)

  it('tiene asunto y el link', () => {
    expect(mail.subject).toBe('Restablecer tu contraseña de Virtual English')
    expect(mail.text).toContain(LINK)
  })

  it(`dice que vence en 1 hora (RESET_TTL_MINUTES=${RESET_TTL_MINUTES}) y que es de un solo uso`, () => {
    expect(RESET_TTL_MINUTES).toBe(60)
    expect(mail.text).toContain('1 hora')
    expect(mail.text).toMatch(/una sola vez/)
  })

  it('tranquiliza a quien no lo pidió: su contraseña actual sigue funcionando', () => {
    expect(mail.text).toMatch(/Si no lo pediste vos/)
    expect(mail.text).toMatch(/sigue funcionando/)
  })
})

describe('INVARIANTES de contenido', () => {
  it('las plantillas reciben SOLO el link: no pueden filtrar email, nombre ni rol', () => {
    // Garantía estructural, no de redacción: no hay por dónde colar un dato personal.
    expect(inviteEmail.length).toBe(1)
    expect(resetEmail.length).toBe(1)
  })

  it('ningún mail habla de "tu contraseña es" ni la incluye (no es recuperable)', () => {
    for (const mail of [inviteEmail(LINK), resetEmail(LINK)]) {
      expect(mail.text).not.toMatch(/tu contraseña es/i)
      expect(mail.text).not.toMatch(/contraseña actual:/i)
    }
  })

  it('no confirman ni niegan que la cuenta exista (nada de "tu cuenta X existe")', () => {
    expect(resetEmail(LINK).text).not.toMatch(/existe/i)
  })

  it('el HTML escapa el link: no se puede inyectar markup', () => {
    const evil = 'https://app.test/x?t=1"><script>alert(1)</script>'
    const html = inviteEmail(evil).html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;')
  })

  it('el HTML no trae imágenes ni recursos externos (mejor entregabilidad, menos spam)', () => {
    for (const mail of [inviteEmail(LINK), resetEmail(LINK)]) {
      expect(mail.html).not.toMatch(/<img/i)
      expect(mail.html).not.toMatch(/<link/i)
      expect(mail.html).not.toMatch(/<script/i)
    }
  })
})
