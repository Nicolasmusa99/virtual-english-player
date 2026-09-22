import { NextRequest, NextResponse } from 'next/server'
import { appUrl } from '@/lib/appUrl'
import { requireRole } from '@/lib/authz'
import { sendEmail } from '@/lib/email'
import { inviteEmail } from '@/lib/emailTemplates'
import { createPasswordToken } from '@/lib/passwordTokens'
import { getPublicUserById } from '@/lib/users'

// ─── POST /api/users/[id]/invite — mandar (o reenviar) la invitación ─────────
//
// Botón explícito, nunca automático al crear el usuario: así no se le escapa un
// mail a nadie por accidente, y el mismo botón sirve para reenviar cuando el link
// de 7 días venció.
//
// No crea usuarios ni toca roles: opera sobre alguien que YA existe y ya tiene rol.
// Emitir un token nuevo invalida el anterior del mismo tipo (un solo link vigente).

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? 'No autenticado' : 'No autorizado' },
      { status: gate.status }
    )
  }
  const me = gate.session.user
  const { id } = await params

  const target = await getPublicUserById(id)
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // El profe SOLO sobre sus propios alumnos; la relación se lee de la base, nunca
  // del request. El admin puede invitar a cualquiera.
  if (me.role === 'profesor' && !(target.role === 'alumno' && target.teacherId === me.id)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Fail-closed: sin rol no puede entrar, así que invitarlo no tendría sentido.
  if (!target.role) {
    return NextResponse.json({ error: 'El usuario no tiene rol asignado' }, { status: 400 })
  }
  if (!target.email) {
    return NextResponse.json({ error: 'El usuario no tiene email' }, { status: 400 })
  }

  const { raw, expiresAt } = await createPasswordToken(target.id, 'invite')
  const mail = inviteEmail(appUrl(`/set-password?token=${encodeURIComponent(raw)}`))
  const res = await sendEmail({ to: target.email, subject: mail.subject, text: mail.text, html: mail.html })

  // Acá SÍ se informa si el mail salió o no: quien llama es un admin/profe que ya
  // puede ver a esa persona, así que no hay nada que filtrar, y necesita saber si
  // tiene que reintentar. (En "olvidé mi contraseña" la respuesta será siempre
  // idéntica, justamente por lo contrario.)
  return NextResponse.json({
    ok: true,
    delivered: res.ok,
    expiresAt,
    ...(res.ok ? {} : { reason: res.reason }),
  })
}
