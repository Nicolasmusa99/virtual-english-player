'use client'
// La bienvenida (2026-11): entrar o crear cuenta.
//   · Entrar: "Iniciar sesión con Google" y, abajo, "Entrar con mail y contraseña".
//   · Crear cuenta: con Google o con nombre y apellido, mail y contraseña. Quien se registra entra directo
//     como alumno, sin profe (el admin le asigna uno). El rol nunca se elige acá.
// "Crear cuenta con Google" deja la cookie de intención (lib/signup.ts) antes de ir a Google:
// sin ella, un mail que no existe no crea cuenta.
import { useState, type FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import styles from './login.module.css'
import PasswordLogin from './PasswordLogin'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'
import { EMAIL_ERROR, PASSWORD_MIN, normalizeEmail, passwordProblem } from '@/lib/passwordRules'
import { SIGNUP_INTENT_COOKIE, SIGNUP_INTENT_MAX_AGE_S } from '@/lib/signup'

export const WELCOME_TEXTS = {
  enter: 'Entrá a tu aula',
  googleIn: 'Iniciar sesión con Google',
  googleUp: 'Crear cuenta con Google',
  noAccount: '¿No tenés cuenta?', create: 'Crear cuenta',
  haveAccount: '¿Ya tenés cuenta?', signIn: 'Iniciar sesión',
  title: 'Crear cuenta',
  lead: 'Entrás como alumno. Tu profe te asigna el material y las clases.',
  or: 'o con tu mail',
  name: 'Nombre y apellido', email: 'Mail', password: 'Contraseña',
  show: 'Ver', hide: 'Ocultar',
  submit: 'Crear cuenta', busy: 'Creando…',
  min: `Al menos ${PASSWORD_MIN} caracteres.`,
  network: 'No se pudo conectar. Probá de nuevo.',
  denied: 'Esa cuenta de Google no está registrada.',
} as const

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M17.64 9.2a10.34 10.34 0 0 0-.164-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908C16.658 14.252 17.64 11.945 17.64 9.2z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258a5.37 5.37 0 0 1-3.048.86c-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A9 9 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export default function WelcomeAuth({ googleClassName, accessDenied = false, onSignedIn }: {
  /** La clase del botón azul de Google de la bienvenida (page.module.css). */
  googleClassName: string
  /** Volvió de Google sin cuenta: se ofrece crearla. */
  accessDenied?: boolean
  onSignedIn?: () => void
}) {
  const T = WELCOME_TEXTS
  const [mode, setMode] = useState<'in' | 'up'>('in')

  function googleSignUp() {
    document.cookie = `${SIGNUP_INTENT_COOKIE}=1; Max-Age=${SIGNUP_INTENT_MAX_AGE_S}; Path=/; SameSite=Lax`
    signIn('google')
  }
  function googleSignIn() {
    document.cookie = `${SIGNUP_INTENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
    signIn('google')
  }

  if (mode === 'up') {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>{T.title}</h1>
        <p className={styles.lead}>{T.lead}</p>
        <button type="button" className={googleClassName} onClick={googleSignUp}><GoogleLogo />{T.googleUp}</button>
        <SignupForm onSignedIn={onSignedIn} />
        <p className={styles.switch}>{T.haveAccount} <button type="button" className={styles.link} onClick={() => setMode('in')}>{T.signIn}</button></p>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{T.enter}</h1>
      <button type="button" className={googleClassName} onClick={googleSignIn}><GoogleLogo />{T.googleIn}</button>
      {accessDenied && (
        <div className={styles.err} role="alert">
          {T.denied} <button type="button" className={styles.linkInline} onClick={() => setMode('up')}>{T.create}</button>
        </div>
      )}
      <PasswordLogin onSignedIn={onSignedIn} />
      <p className={styles.switch}>{T.noAccount} <button type="button" className={styles.link} onClick={() => setMode('up')}>{T.create}</button></p>
    </div>
  )
}

function SignupForm({ onSignedIn }: { onSignedIn?: () => void }) {
  const T = WELCOME_TEXTS
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const n = normalizePersonName(name)
    if (!n) { setError(NAME_ERROR); return }
    const m = normalizeEmail(email)
    if (!m) { setError(EMAIL_ERROR); return }
    const p = passwordProblem(password)
    if (p) { setError(p); return }
    setBusy(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, email: m, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : T.network); setBusy(false); return }
      if (onSignedIn) onSignedIn(); else window.location.reload()
    } catch { setError(T.network); setBusy(false) }
  }

  return (
    <form className={styles.form} style={{ marginTop: 0 }} onSubmit={submit} aria-label={T.title}>
      <div className={styles.or}><span>{T.or}</span></div>
      <label className={styles.field}>
        <span className={styles.lbl}>{T.name}</span>
        <input className={styles.input} autoComplete="name" maxLength={NAME_MAX} value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
      </label>
      <label className={styles.field}>
        <span className={styles.lbl}>{T.email}</span>
        <input className={styles.input} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} />
      </label>
      <label className={styles.field}>
        <span className={styles.lbl}>{T.password}</span>
        <span className={styles.pwRow}>
          <input className={styles.input} type={show ? 'text' : 'password'} autoComplete="new-password"
            value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} />
          <button type="button" className={styles.show} onClick={() => setShow((v) => !v)}>{show ? T.hide : T.show}</button>
        </span>
      </label>
      <span className={styles.hint} style={{ marginTop: -8 }}>{T.min}</span>
      {error && <div className={styles.err} role="alert">{error}</div>}
      <button type="submit" className={styles.submit} disabled={busy}>{busy ? T.busy : T.submit}</button>
    </form>
  )
}
