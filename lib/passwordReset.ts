// ─── "Olvidé mi contraseña": el trabajo que corre DESPUÉS de responder (F4) ──
//
// La ruta responde 200 {ok:true} ANTES de llamar a esto (vía after() de Next), así
// que nada de lo que pasa acá —si la cuenta existe, si se crea un token, si el mail
// sale o falla— puede cambiar el status, el cuerpo ni el TIEMPO de la respuesta.
// Por eso esta función nunca tira: registra y sigue.
//
// Qué hace, en orden:
//   1. Frena el bombardeo: 3 pedidos/hora por email y 10/hora por IP. Cuenta CADA
//      pedido y lo cuenta aunque la cuenta no exista (anti-enumeración). Si está
//      frenado, no manda nada (en silencio: la respuesta ya fue la de siempre).
//   2. Busca al usuario. Sin fila o sin rol (fail-closed, allowlist de Fase 1) → nada.
//   3. Emite un token 'reset' (1 hora, un solo uso; mata el reset anterior) y manda
//      el mail. El link lleva a /set-password — el MISMO flujo de F2, que al usarse
//      quema los demás tokens y borra las sesiones vivas.
//
// Una persona SIN contraseña (solo Google) también recibe el link: el mail llega a
// su propia casilla, así que es equivalente a una invitación que ella misma pidió.
import { appUrl } from '@/lib/appUrl'
import { sendEmail } from '@/lib/email'
import { resetEmail } from '@/lib/emailTemplates'
import {
  RESET_EMAIL_MAX,
  RESET_IP_MAX,
  RESET_LOCK_MINUTES,
  RESET_WINDOW_MINUTES,
  hit,
  resetEmailKey,
  resetIpKey,
} from '@/lib/loginThrottle'
import { createPasswordToken } from '@/lib/passwordTokens'
import { findUserByEmail } from '@/lib/users'

const RESET_WINDOW = { windowMinutes: RESET_WINDOW_MINUTES, lockMinutes: RESET_LOCK_MINUTES }

export type ResetOutcome = 'throttled' | 'no-account' | 'sent' | 'send-failed' | 'error'

/** Devuelve qué pasó SOLO para logs y tests. Nunca llega al cliente. */
export async function processResetRequest(normalizedEmail: string, ip: string): Promise<ResetOutcome> {
  try {
    const eKey = resetEmailKey(normalizedEmail)
    const iKey = resetIpKey(ip)

    // Contar-y-decidir atómico (ver hit): pedidos simultáneos no pueden pasar todos.
    if (!(await hit(iKey, RESET_IP_MAX, RESET_WINDOW))) return 'throttled'
    if (!(await hit(eKey, RESET_EMAIL_MAX, RESET_WINDOW))) return 'throttled'

    const user = await findUserByEmail(normalizedEmail)
    if (!user || !user.role || !user.email) return 'no-account'

    const { raw } = await createPasswordToken(user.id, 'reset')
    const mail = resetEmail(appUrl(`/set-password?token=${encodeURIComponent(raw)}`))
    const res = await sendEmail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html })
    return res.ok ? 'sent' : 'send-failed'
  } catch (err) {
    // Nunca se propaga: la respuesta ya salió y no debe depender de esto.
    console.error('[forgot-password] error procesando el pedido:', err instanceof Error ? err.message : err)
    return 'error'
  }
}
