// ─── Plantillas de los mails de contraseña (F1) ──────────────────────────────
// Texto plano + HTML mínimo (sin imágenes, sin tracking, sin CSS externo): es lo
// que mejor entrega y lo que menos se parece a spam.
//
// Reglas de contenido:
//   · NUNCA va la contraseña en el mail (no existe: no es recuperable).
//   · NUNCA se confirma ni se niega que la cuenta exista — el mail llega, y punto.
//   · Un solo link, el nuestro, y se dice cuándo vence.

// Vencimientos. ÚNICA fuente de verdad: F2/F4 los importan de acá para armar los
// tokens, así la letra del mail no puede quedar desfasada de la realidad.
export const INVITE_TTL_DAYS = 7
export const RESET_TTL_MINUTES = 60

export type EmailContent = { subject: string; text: string; html: string }

/** Escapa para interpolar en HTML. El link lo generamos nosotros, pero no se confía igual. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(title: string, body: string, link: string, cta: string): string {
  const safe = esc(link)
  return [
    '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f7fa;',
    'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b2b3f">',
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">',
    `<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>`,
    body,
    `<p style="margin:28px 0"><a href="${safe}" style="background:#3D6FB6;color:#fff;`,
    `text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${esc(cta)}</a></p>`,
    '<p style="margin:0 0 8px;font-size:13px;color:#61748a">Si el botón no funciona, copiá y pegá este link:</p>',
    `<p style="margin:0;font-size:13px;word-break:break-all"><a href="${safe}" style="color:#3D6FB6">${safe}</a></p>`,
    '<hr style="border:none;border-top:1px solid #e3e9f0;margin:28px 0">',
    '<p style="margin:0;font-size:13px;color:#61748a">Virtual English</p>',
    '</div></body></html>',
  ].join('')
}

/** "Poné tu primera contraseña" — alta por invitación. Vence en INVITE_TTL_DAYS días. */
export function inviteEmail(link: string): EmailContent {
  const subject = 'Activá tu cuenta de Virtual English'
  const text = [
    'Te crearon una cuenta en Virtual English.',
    '',
    'Para entrar, primero elegí tu contraseña con este link:',
    link,
    '',
    `El link vence en ${INVITE_TTL_DAYS} días y se puede usar una sola vez.`,
    '',
    'También podés entrar con tu cuenta de Google, sin contraseña.',
    '',
    'Si no esperabas este mail, ignoralo.',
    '',
    '— Virtual English',
  ].join('\n')

  const html = layout(
    'Activá tu cuenta',
    [
      '<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Te crearon una cuenta en Virtual English. ',
      'Para entrar, primero elegí tu contraseña.</p>',
      `<p style="margin:0;font-size:14px;color:#61748a">El link vence en ${INVITE_TTL_DAYS} días y se puede usar una sola vez. `,
      'También podés entrar con tu cuenta de Google, sin contraseña.</p>',
    ].join(''),
    link,
    'Elegir mi contraseña'
  )

  return { subject, text, html }
}

/** "Olvidé mi contraseña". Vence en RESET_TTL_MINUTES minutos (corto a propósito). */
export function resetEmail(link: string): EmailContent {
  const subject = 'Restablecer tu contraseña de Virtual English'
  const hours = RESET_TTL_MINUTES / 60
  const plazo = hours === 1 ? '1 hora' : `${RESET_TTL_MINUTES} minutos`
  const text = [
    'Pediste restablecer tu contraseña de Virtual English.',
    '',
    'Elegí una nueva con este link:',
    link,
    '',
    `El link vence en ${plazo} y se puede usar una sola vez.`,
    '',
    'Si no lo pediste vos, ignorá este mail: tu contraseña actual sigue funcionando.',
    '',
    '— Virtual English',
  ].join('\n')

  const html = layout(
    'Restablecer tu contraseña',
    [
      '<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Pediste restablecer tu contraseña de Virtual English. ',
      'Elegí una nueva con el botón de abajo.</p>',
      `<p style="margin:0;font-size:14px;color:#61748a">El link vence en ${plazo} y se puede usar una sola vez. `,
      'Si no lo pediste vos, ignorá este mail: tu contraseña actual sigue funcionando.</p>',
    ].join(''),
    link,
    'Elegir una nueva contraseña'
  )

  return { subject, text, html }
}
