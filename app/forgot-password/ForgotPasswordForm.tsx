'use client'
// "Olvidé mi contraseña" (fase login-password, F5).
//
// ⚠️ REGLA DE SEGURIDAD: cuando el pedido sale bien se muestra SIEMPRE el MISMO
// texto fijo (FORGOT_MESSAGES.sent), exista la cuenta o no. El servidor ya responde
// 200 {ok:true} en todos los casos (F4); acá, además, NO se lee el cuerpo de la
// respuesta: la pantalla solo mira res.ok. No hay forma de que diga algo distinto
// según la cuenta.
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import styles from '../auth.module.css'

export const FORGOT_MESSAGES = {
  invalidEmail: 'Escribí un email válido, por ejemplo nombre@gmail.com.',
  failed: 'No se pudo enviar el pedido. Probá de nuevo en un momento.',
  // ÚNICO mensaje de "enviado": el mismo para cualquier email.
  sent:
    'Si ese email está registrado, te mandamos un link para elegir una contraseña nueva. ' +
    'Revisá tu casilla y también la carpeta de spam. El link vence en 1 hora.',
} as const

// Solo para ahorrarle al usuario un viaje con un email mal escrito. No es seguridad
// (eso lo hace el servidor) y no revela nada: mira el texto, no la cuenta.
const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'form' | 'sending' | 'sent'>('form')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state === 'sending') return // sin doble envío
    setError('')
    const mail = email.trim()
    if (!looksLikeEmail(mail)) {
      setError(FORGOT_MESSAGES.invalidEmail)
      return
    }

    setState('sending')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail }),
      })
      // A propósito NO se lee res.json(): solo importa si el pedido llegó bien.
      if (res.ok) {
        setState('sent')
        return
      }
    } catch {
      // error de red: cae al mensaje genérico de abajo
    }
    setError(FORGOT_MESSAGES.failed)
    setState('form')
  }

  return (
    <div className={styles.authScreen}>
      <main className={styles.authCenter}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.authLogo} src="/logo-ve.jpeg" alt="Virtual English" />

        {state === 'sent' ? (
          <>
            <h1 className={styles.authTitle}>Revisá tu email</h1>
            <p className={styles.authOk} role="status">{FORGOT_MESSAGES.sent}</p>
            {/* Vuelve al formulario con el email ya escrito, por si hubo un error de tipeo. */}
            <button type="button" className={styles.authLink} onClick={() => setState('form')}>
              Probar con otro email
            </button>
            <Link href="/" className={styles.authLink}>Volver al inicio</Link>
          </>
        ) : (
          <>
            <h1 className={styles.authTitle}>¿Olvidaste tu contraseña?</h1>
            <p className={styles.authText}>
              Escribí tu email y te mandamos un link para elegir una contraseña nueva.
            </p>

            <form className={styles.authForm} onSubmit={submit} noValidate>
              <div className={styles.authField}>
                <label htmlFor="forgot-email" className={styles.authLabel}>Email</label>
                <input
                  id="forgot-email"
                  className={styles.authInput}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && <p className={styles.authError} role="alert">{error}</p>}

              <button
                type="submit"
                className={styles.authPrimary}
                disabled={state === 'sending'}
                aria-busy={state === 'sending'}
              >
                {state === 'sending' ? 'Enviando…' : 'Mandame el link'}
              </button>
            </form>

            <Link href="/" className={styles.authLink}>Volver al inicio</Link>
          </>
        )}
      </main>
    </div>
  )
}
