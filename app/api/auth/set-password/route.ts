import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, validatePassword } from '@/lib/password'
import { consumePasswordToken, invalidateTokens, peekPasswordToken } from '@/lib/passwordTokens'
import { deleteAuthSessions, getPublicUserById, setUserPassword } from '@/lib/users'

// ─── POST/GET /api/auth/set-password — poner contraseña con un link del mail ──
//
// Ruta PÚBLICA (no hay sesión: la persona todavía no entró). Lo que la protege es
// el token: 256 bits aleatorios, de un solo uso y con vencimiento.
//
// ⚠️ Esto NO es un login: consumir el token NO crea sesión. Después de poner la
// contraseña hay que entrar normalmente. Si el link logueara, un mail de invitación
// robado sería una puerta de entrada durante 7 días.
//
// El login de Google y la allowlist de Fase 1 no se tocan: esta ruta nunca CREA un
// usuario ni le asigna un rol; solo le pone contraseña a alguien que ya existe y
// ya tiene rol.

// Mensaje ÚNICO para todos los motivos por los que un link no sirve (no existe,
// ya se usó, venció, el usuario se borró, le sacaron el rol). No distinguirlos
// evita que alguien use esta ruta para sondear tokens o cuentas.
const INVALID_LINK = 'El link no es válido o ya venció. Pedí uno nuevo.'

// Cada 400 lleva un `code` legible por máquina, para que la pantalla decida qué
// mostrar SIN comparar textos:
//   · invalid_link     → el link no sirve. MISMO código para TODAS las causas
//                        (no existe, usado, vencido, usuario borrado, sin rol).
//   · invalid_password → la contraseña no cumple la política; `error` es uno de
//                        los mensajes fijos de lib/password.ts.
//   · bad_request      → el pedido vino mal armado.
// No agrega información: quien tiene un token ya puede saber si sirve con el GET.
type FailCode = 'bad_request' | 'invalid_link' | 'invalid_password'
const fail = (code: FailCode, error: string) => NextResponse.json({ error, code }, { status: 400 })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('bad_request', 'Body inválido')
  }
  // Mass-assignment cerrado: SOLO se leen estos dos campos.
  const { token, password } = body as Record<string, unknown>

  // 1. ¿El token sirve? Se MIRA sin gastarlo: si después la contraseña no cumple
  //    la política, el link tiene que seguir vivo para que pueda reintentar.
  const ref = await peekPasswordToken(token)
  if (!ref) return fail('invalid_link', INVALID_LINK)

  // 2. FAIL-CLOSED: el usuario tiene que seguir existiendo y tener rol. Un token
  //    emitido antes de que le sacaran el rol no vale (misma regla que la allowlist).
  const user = await getPublicUserById(ref.userId)
  if (!user || !user.role) {
    await invalidateTokens(ref.userId) // que no quede nada vivo apuntando ahí
    return fail('invalid_link', INVALID_LINK)
  }

  // 3. Política de contraseña, server-side. Acá sí se dice qué está mal (es la
  //    persona dueña de la cuenta eligiendo su contraseña), pero el mensaje nunca
  //    incluye la contraseña ni revela nada de la cuenta.
  if (typeof password !== 'string') {
    return fail('invalid_password', 'La contraseña es obligatoria.')
  }
  const policy = validatePassword(password, { email: user.email })
  if (!policy.ok) return fail('invalid_password', policy.error)

  // 4. Recién ahora se GASTA el token, con el UPDATE atómico. Si dos requests
  //    llegan juntos con el mismo link, solo uno pasa de acá.
  const consumed = await consumePasswordToken(token)
  if (!consumed) return fail('invalid_link', INVALID_LINK)

  // 5. Guardar. hashPassword revalida y tira si algo no cumple (doble red).
  const passwordHash = await hashPassword(password)
  await setUserPassword(user.id, passwordHash) // también marca emailVerified

  // 6. Cerrar todo lo demás: los otros links vivos de esta persona y sus sesiones
  //    abiertas. Si alguien se había metido con la contraseña vieja, queda afuera.
  await invalidateTokens(user.id)
  await deleteAuthSessions(user.id)

  return NextResponse.json({ ok: true })
}

// GET ?token=… — ¿vale la pena mostrar el formulario? No gasta el token.
// Devuelve el propósito para que la pantalla diga "elegí tu contraseña" (invitación)
// o "elegí una nueva" (reset). No devuelve el email ni ningún dato de la cuenta.
export async function GET(req: NextRequest) {
  const ref = await peekPasswordToken(req.nextUrl.searchParams.get('token'))
  if (!ref) return NextResponse.json({ valid: false, error: INVALID_LINK, code: 'invalid_link' }, { status: 400 })

  const user = await getPublicUserById(ref.userId)
  if (!user || !user.role) {
    return NextResponse.json({ valid: false, error: INVALID_LINK, code: 'invalid_link' }, { status: 400 })
  }
  return NextResponse.json({ valid: true, purpose: ref.purpose })
}
