import { NextRequest, NextResponse, after } from 'next/server'
import { processResetRequest } from '@/lib/passwordReset'
import { clientIp, isSameOrigin } from '@/lib/requestGuards'

// ─── POST /api/auth/forgot-password — pedir un link para restablecer ─────────
//
// ⚠️ Anti-enumeración: para cualquier pedido bien formado la respuesta es SIEMPRE
// `200 {ok:true}` —exista la cuenta o no, tenga rol o no, tenga contraseña o no,
// esté frenada por el rate limit o no— y sale ANTES de hacer ningún trabajo que
// dependa de la cuenta. Todo eso corre después, en after() (lib/passwordReset.ts),
// así el TIEMPO de respuesta tampoco puede delatar nada.
//
// Lo único que puede dar otra respuesta son pedidos mal formados o de otro sitio
// (400/403): se deciden antes de mirar ninguna cuenta y no dicen nada de ninguna.

const MAX_EMAIL = 320
const noStore = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  // CSRF: que otro sitio no pueda disparar mails de reset desde el navegador de alguien.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Solicitud no permitida' }, { status: 403, headers: noStore })
  }

  const body = await req.json().catch(() => null)
  const emailRaw = body && typeof body === 'object' ? (body as Record<string, unknown>).email : undefined
  if (typeof emailRaw !== 'string' || emailRaw.length > MAX_EMAIL) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400, headers: noStore })
  }
  const email = emailRaw.trim().toLowerCase()
  const ip = clientIp(req)

  // Se agenda para DESPUÉS de responder (en Vercel: waitUntil). Nada de lo que
  // pase ahí —ni un error— toca esta respuesta.
  after(() => processResetRequest(email, ip))

  return NextResponse.json({ ok: true }, { status: 200, headers: noStore })
}
