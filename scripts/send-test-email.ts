// ─── Mail de prueba (F1) ─────────────────────────────────────────────────────
// Uso:
//   npm run email:test -- tu@mail.com           → PREVISUALIZA en la terminal (no manda)
//   npm run email:test -- tu@mail.com --send    → MANDA de verdad por Resend
//
// El envío real pasa igual por todas las barreras de lib/email.ts: si la casilla
// no está en EMAIL_TEST_ALLOWLIST, no sale nada.
import { appBaseUrl, appUrl } from '../lib/appUrl'
import { emailAllowlist, isRecipientAllowed, resolveEmailMode, sendEmail } from '../lib/email'
import { inviteEmail, resetEmail } from '../lib/emailTemplates'

async function main() {
const args = process.argv.slice(2)
const to = args.find((a) => !a.startsWith('-'))
const send = args.includes('--send')
const kind = args.includes('--reset') ? 'reset' : 'invite'

if (!to) {
  console.error('Falta el destinatario.\n  npm run email:test -- tu@mail.com [--send] [--reset]')
  process.exit(1)
}

// Sin --send forzamos la previsualización, pase lo que pase en el entorno.
process.env.EMAIL_MODE = send ? 'resend' : 'console'

const mask = (s?: string) => (s ? `${s.slice(0, 6)}…(${s.length} chars)` : '(ausente)')

console.log('\n── Configuración ─────────────────────────────')
console.log('  destinatario   :', to)
console.log('  modo           :', resolveEmailMode(), send ? '(envío REAL)' : '(solo previsualización)')
console.log('  VERCEL_ENV     :', process.env.VERCEL_ENV ?? '(undefined → no es producción)')
console.log('  remitente      :', process.env.EMAIL_FROM || 'Virtual English <onboarding@resend.dev> (default)')
console.log('  RESEND_API_KEY :', mask(process.env.RESEND_API_KEY))
console.log('  allowlist      :', emailAllowlist().join(', ') || '(vacía)')
console.log('  URL base       :', appBaseUrl())
console.log('  ¿habilitado?   :', isRecipientAllowed(to) ? 'SÍ' : 'NO — está fuera de la allowlist')
console.log('──────────────────────────────────────────────\n')

// Link de juguete: los tokens de verdad los emite F2. Sirve para ver cómo se ve
// el mail y si entra al inbox; no habilita nada porque esa ruta todavía no existe.
const link = appUrl(`/set-password?token=DEMO-${Date.now().toString(36)}`)
const mail = kind === 'reset' ? resetEmail(link) : inviteEmail(link)

const res = await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html })

console.log('\nResultado:', res)
if (res.ok && res.mode === 'resend') {
  console.log('\n✅ Mail entregado a Resend (id ' + res.id + ').')
  console.log('   Revisá tu casilla — y también la carpeta de SPAM.')
} else if (res.ok) {
  console.log('\nℹ️ Previsualización nada más. Para mandarlo de verdad, agregá --send')
} else if (res.reason === 'allowlist') {
  console.log('\n🛑 La barrera de pruebas lo frenó (esto es lo que queremos que pase).')
  console.log('   Para habilitar TU casilla, agregá en .env.local:')
  console.log(`   EMAIL_TEST_ALLOWLIST=${to}`)
} else if (res.reason === 'no-api-key') {
  console.log('\n🛑 Falta RESEND_API_KEY en .env.local')
}
}

main()

