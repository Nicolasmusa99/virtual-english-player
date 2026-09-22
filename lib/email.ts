// ─── Envío de emails (F1) ────────────────────────────────────────────────────
// Único punto de salida de correo del proyecto. Diseñado para que sea IMPOSIBLE
// mandarle un mail a una persona real desde pruebas:
//
//   1. Fuera de producción el modo por defecto es 'console': el mail se IMPRIME
//      en la terminal (link incluido) y no se manda nada.
//   2. Si alguien fuerza EMAIL_MODE=resend fuera de producción, el destinatario
//      tiene que estar en EMAIL_TEST_ALLOWLIST. Lista vacía = no sale nada
//      (fail-closed: el default seguro es no mandar).
//   3. Encima de todo, Resend con un dominio sin verificar solo acepta enviar a
//      la casilla dueña de la cuenta.
//
// La señal de entorno es VERCEL_ENV, igual que la guarda de la DB (lib/db/guard.mjs):
// NODE_ENV vale 'production' también en preview, así que no sirve.
//
// `sendEmail` NUNCA tira: devuelve un resultado. Los flujos que mandan mail (reset,
// invitación) no deben cambiar su respuesta según si el envío salió bien o mal.

export type EmailMode = 'console' | 'resend' | 'off'

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

export type SendResult =
  | { ok: true; mode: 'console' }
  | { ok: true; mode: 'resend'; id: string }
  | { ok: false; reason: 'off' | 'allowlist' | 'no-api-key' | 'error'; detail?: string }

// Remitente por defecto: el sandbox de Resend, que solo puede escribirle a la
// casilla dueña de la cuenta. Al tener dominio propio verificado (F6) se cambia
// por EMAIL_FROM='Virtual English <no-responder@tudominio.com>'.
const DEFAULT_FROM = 'Virtual English <onboarding@resend.dev>'

function isProdEnv(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

/** Modo efectivo. EMAIL_MODE manda; si no está, producción envía y el resto imprime. */
export function resolveEmailMode(): EmailMode {
  const raw = (process.env.EMAIL_MODE ?? '').trim().toLowerCase()
  if (raw === 'console' || raw === 'resend' || raw === 'off') {
    if (raw !== 'resend' && isProdEnv()) {
      console.warn(`[email] ⚠️ EMAIL_MODE=${raw} en PRODUCCIÓN: no se está mandando ningún mail real.`)
    }
    return raw
  }
  if (raw) console.warn(`[email] EMAIL_MODE="${raw}" no es válido (console|resend|off); se ignora.`)
  return isProdEnv() ? 'resend' : 'console'
}

/** Destinatarios habilitados fuera de producción (EMAIL_TEST_ALLOWLIST, separados por coma). */
export function emailAllowlist(): string[] {
  return (process.env.EMAIL_TEST_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * En producción se le puede escribir a cualquiera. Fuera de producción, SOLO a
 * los de la allowlist — y si la lista está vacía, a nadie.
 */
export function isRecipientAllowed(to: string): boolean {
  if (isProdEnv()) return true
  return emailAllowlist().includes(to.trim().toLowerCase())
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
}

/** Imprime el mail en la terminal en vez de mandarlo (modo de desarrollo). */
function printToConsole(msg: EmailMessage): void {
  const line = '─'.repeat(72)
  console.log(
    `\n${line}\n📧 [email:console] NO se mandó nada — esto es lo que se habría enviado:\n` +
      `   De:      ${fromAddress()}\n` +
      `   Para:    ${msg.to}\n` +
      `   Asunto:  ${msg.subject}\n${line}\n${msg.text}\n${line}\n`
  )
}

/**
 * Manda un email. No tira nunca; devuelve qué pasó.
 *
 * Importante para quien la llame: NO cambies la respuesta HTTP según este
 * resultado en flujos de "olvidé mi contraseña" — filtraría qué cuentas existen.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const to = msg.to.trim()
  const mode = resolveEmailMode()

  if (mode === 'off') {
    console.warn(`[email] descartado (EMAIL_MODE=off): "${msg.subject}"`)
    return { ok: false, reason: 'off' }
  }

  if (mode === 'console') {
    printToConsole({ ...msg, to })
    return { ok: true, mode: 'console' }
  }

  // ── A partir de acá se manda de verdad ──
  if (!isRecipientAllowed(to)) {
    console.warn(
      `[email] 🛑 BLOQUEADO: se intentó mandar a un destinatario que no está en ` +
        `EMAIL_TEST_ALLOWLIST (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'undefined'}). ` +
        `No salió ningún mail. Agregá la casilla a EMAIL_TEST_ALLOWLIST si es a propósito.`
    )
    return { ok: false, reason: 'allowlist' }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY ausente: no se pudo mandar el mail.')
    return { ok: false, reason: 'no-api-key' }
  }

  try {
    // Import diferido: en modo console no se carga el SDK, y la suite de tests
    // puede mockear 'resend' sin que nada toque la red.
    const { Resend } = await import('resend')
    const { data, error } = await new Resend(apiKey).emails.send({
      from: fromAddress(),
      to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    })
    if (error) {
      console.error('[email] Resend devolvió error:', error.message)
      return { ok: false, reason: 'error', detail: error.message }
    }
    return { ok: true, mode: 'resend', id: data?.id ?? '' }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[email] fallo al mandar:', detail)
    return { ok: false, reason: 'error', detail }
  }
}
