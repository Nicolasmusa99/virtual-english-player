'use client'
// Entrar con usuario y contraseña (2026-11), en la bienvenida, debajo de "Iniciar sesión con
// Google". Arranca cerrado (la mayoría entra con Google) y se abre con un link. Habla con
// POST /api/login; si sale bien, la página se recarga y ya hay sesión.
import { useState, type FormEvent } from 'react'
import styles from './login.module.css'

export const LOGIN_TEXTS = {
  open: 'Entrar con usuario y contraseña',
  or: 'o',
  username: 'Usuario', password: 'Contraseña',
  submit: 'Entrar', busy: 'Entrando…',
  show: 'Ver', hide: 'Ocultar',
  empty: 'Escribí tu usuario y tu contraseña.',
  network: 'No se pudo conectar. Probá de nuevo.',
  forgot: '¿Te olvidaste la contraseña? Pedile una nueva a tu profe o al administrador.',
} as const

export default function PasswordLogin({ onSignedIn }: { onSignedIn?: () => void }) {
  const T = LOGIN_TEXTS
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setError(T.empty); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : T.network); setBusy(false); return }
      if (onSignedIn) onSignedIn(); else window.location.reload()
    } catch { setError(T.network); setBusy(false) }
  }

  if (!open) {
    return (
      <div className={styles.wrap}>
        <div className={styles.or}><span>{T.or}</span></div>
        <button type="button" className={styles.link} onClick={() => setOpen(true)}>{T.open}</button>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label={T.open}>
      <div className={styles.or}><span>{T.or}</span></div>
      <label className={styles.field}>
        <span className={styles.lbl}>{T.username}</span>
        <input className={styles.input} autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={username} onChange={(e) => { setUsername(e.target.value); setError('') }} />
      </label>
      <label className={styles.field}>
        <span className={styles.lbl}>{T.password}</span>
        <span className={styles.pwRow}>
          <input className={styles.input} type={show ? 'text' : 'password'} autoComplete="current-password"
            value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} />
          <button type="button" className={styles.show} onClick={() => setShow((v) => !v)}>{show ? T.hide : T.show}</button>
        </span>
      </label>
      {error && <div className={styles.err} role="alert">{error}</div>}
      <button type="submit" className={styles.submit} disabled={busy}>{busy ? T.busy : T.submit}</button>
      <p className={styles.note}>{T.forgot}</p>
    </form>
  )
}
