'use client'
// Bienvenida (SCR-025) con los DOS caminos de entrada visibles: Google y email +
// contraseña (fase login-password, F5). Reemplaza el bloque que vivía en page.tsx;
// el botón de Google es el MISMO (mismo texto, mismo SVG, misma clase, signIn('google')).
//
// ⚠️ REGLA DE SEGURIDAD de esta pantalla: el mensaje de error sale SOLO del status
// HTTP (loginErrorFor). El cuerpo de la respuesta NO se lee nunca. Así, pase lo que
// pase en el servidor, la pantalla no puede mostrar nada que diferencie "no existe"
// de "contraseña mal" de "sin rol": para todos esos casos el server responde 401 y
// acá se ve exactamente el mismo texto.
import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import pageStyles from './page.module.css'
import styles from './auth.module.css'
import PasswordInput from './PasswordInput'

// Textos fijos. Exportados para que los tests afirmen contra ESTAS constantes.
export const LOGIN_MESSAGES = {
  empty: 'Escribí tu email y tu contraseña.',
  // 401 — idéntico para no-existe / sin contraseña / contraseña mal / sin rol.
  // La segunda frase es fija (sale en TODOS los 401): no revela nada y orienta a
  // quien siempre entró con Google y no tiene contraseña.
  invalid: 'Email o contraseña incorrectos. Si siempre entraste con Google, usá el botón de arriba.',
  locked: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.', // 429
  failed: 'No se pudo iniciar sesión. Probá de nuevo en un momento.',   // todo lo demás
} as const

/** Status HTTP → mensaje. Es la ÚNICA fuente de mensajes de error del login. */
export function loginErrorFor(status: number): string {
  if (status === 401) return LOGIN_MESSAGES.invalid
  if (status === 429) return LOGIN_MESSAGES.locked
  return LOGIN_MESSAGES.failed
}

export default function WelcomeScreen({ accessDenied }: { accessDenied: boolean }) {
  const { update } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return // sin doble envío (además del botón deshabilitado)
    setError('')
    if (!email.trim() || !password) {
      setError(LOGIN_MESSAGES.empty)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      // A propósito NO se lee res.json(): el mensaje sale solo de res.status.
      if (res.ok) {
        // El server ya dejó la cookie de sesión: update() vuelve a pedir la sesión
        // y page.tsx pasa solo a la app (sin recargar). Si por algún motivo la
        // sesión no aparece, se avisa en vez de quedar trabado en "Entrando…".
        const session = await update()
        if (session) return
        setError(LOGIN_MESSAGES.failed)
      } else {
        setError(loginErrorFor(res.status))
        if (res.status === 401 || res.status === 429) {
          setPassword('') // se borra la contraseña y se conserva el email
          passwordRef.current?.focus()
        }
      }
    } catch {
      setError(LOGIN_MESSAGES.failed) // error de red
    }
    setSubmitting(false)
  }

  return (
    <div className={styles.authScreen}>
      <main className={styles.authCenter}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.authLogo} src="/logo-ve.jpeg" alt="Virtual English" />

        {/* Camino 1 — Google: el mismo botón de siempre. Solo se centra el contenido,
            porque ahora ocupa el ancho de la columna junto al formulario. */}
        <button
          type="button"
          className={pageStyles.wSignInBtn}
          style={{ justifyContent: 'center' }}
          onClick={() => signIn('google')}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2a10.34 10.34 0 0 0-.164-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908C16.658 14.252 17.64 11.945 17.64 9.2z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258a5.37 5.37 0 0 1-3.048.86c-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A9 9 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Iniciar sesión con Google
        </button>
        {/* Aviso del allowlist de Google (Fase 1), igual que antes: es del camino Google. */}
        {accessDenied && (
          <div className={pageStyles.wAccessDenied} role="alert">
            Tu cuenta no está habilitada. Pedí acceso a tu profesor o administrador.
          </div>
        )}

        <div className={styles.authDivider}>o con tu email</div>

        {/* Camino 2 — email + contraseña. noValidate: los mensajes son los nuestros,
            en castellano, no las burbujas del navegador. */}
        <form className={styles.authForm} onSubmit={submit} noValidate>
          <div className={styles.authField}>
            <label htmlFor="login-email" className={styles.authLabel}>Email</label>
            <input
              id="login-email"
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

          <PasswordInput
            ref={passwordRef}
            id="login-password"
            label="Contraseña"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          {error && <p className={styles.authError} role="alert">{error}</p>}

          <button type="submit" className={styles.authPrimary} disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <Link href="/forgot-password" className={styles.authLink}>¿Olvidaste tu contraseña?</Link>
      </main>
    </div>
  )
}
