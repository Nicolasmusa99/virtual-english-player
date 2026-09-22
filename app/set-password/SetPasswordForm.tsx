'use client'
// Poner contraseña desde el link del mail (fase login-password, F5). Sirve para la
// invitación (primera contraseña) y para "olvidé mi contraseña" (reset).
//
// Seguridad de esta pantalla:
//   · El token se lee UNA vez y se BORRA de la barra de direcciones enseguida
//     (history.replaceState): no queda en el historial ni sale en una captura.
//     Vive solo en memoria (tokenRef) y nunca se muestra.
//   · No se muestra el email ni ningún dato de la cuenta.
//   · "Link inválido" es UN solo mensaje para todas las causas (igual que el server).
//   · La pantalla decide qué mostrar por el `code` del server, nunca comparando
//     textos. ÚNICA excepción al "no mostrar texto del servidor": con
//     code === 'invalid_password' se muestra `error`, que siempre es uno de los
//     mensajes FIJOS de la política (lib/password.ts) sobre la contraseña que la
//     persona acaba de escribir (p. ej. "no puede contener tu email").
import { useEffect, useRef, useState, type FormEvent } from 'react'
import styles from '../auth.module.css'
import PasswordInput from '../PasswordInput'

export const SET_PASSWORD_MESSAGES = {
  empty: 'Escribí una contraseña.',
  tooShort: 'La contraseña tiene que tener al menos 10 caracteres.',
  mismatch: 'Las contraseñas no coinciden.',
  failed: 'No se pudo guardar la contraseña. Probá de nuevo en un momento.',
  checkFailed: 'No pudimos verificar el link. Revisá tu conexión y probá de nuevo.',
} as const

const MIN_CHARS = 10 // = PASSWORD_MIN_CHARS de lib/password.ts (el server es la autoridad)

type State = 'checking' | 'checkError' | 'invalid' | 'form' | 'saving' | 'done'
type Purpose = 'invite' | 'reset'

// El link "se ve" como un botón principal, pero es un <a> común: al terminar
// conviene una carga completa de la página (el server acaba de cerrar las sesiones
// de esta cuenta, y así la app arranca sin nada viejo en memoria).
const linkAsButton = { display: 'block', textAlign: 'center', textDecoration: 'none' } as const

export default function SetPasswordForm() {
  const tokenRef = useRef<string | null>(null)
  const [state, setState] = useState<State>('checking')
  const [purpose, setPurpose] = useState<Purpose>('invite')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')

  async function check() {
    setState('checking')
    const token = tokenRef.current
    if (!token) { setState('invalid'); return }
    try {
      const res = await fetch(`/api/auth/set-password?token=${encodeURIComponent(token)}`)
      if (res.status === 400) { setState('invalid'); return }
      if (!res.ok) { setState('checkError'); return }
      const data = await res.json().catch(() => null)
      if (data?.valid === true && (data.purpose === 'invite' || data.purpose === 'reset')) {
        setPurpose(data.purpose)
        setState('form')
      } else {
        setState('invalid')
      }
    } catch {
      setState('checkError') // red: se ofrece reintentar (el token sigue en memoria)
    }
  }

  useEffect(() => {
    // Leer el token UNA vez y borrarlo de la URL enseguida. El ref sobrevive al
    // doble efecto de React en desarrollo, así que la segunda pasada no lo pierde.
    if (tokenRef.current === null) {
      tokenRef.current = new URLSearchParams(window.location.search).get('token') ?? ''
      window.history.replaceState(null, '', window.location.pathname)
    }
    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state === 'saving') return // sin doble envío
    setError('')
    if (!password) { setError(SET_PASSWORD_MESSAGES.empty); return }
    if (password.length < MIN_CHARS) { setError(SET_PASSWORD_MESSAGES.tooShort); return }
    if (password !== repeat) { setError(SET_PASSWORD_MESSAGES.mismatch); return }

    setState('saving')
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, password }),
      })
      if (res.ok) {
        tokenRef.current = null // ya no sirve: se suelta
        setPassword('')
        setRepeat('')
        setState('done')
        return
      }
      const data = await res.json().catch(() => null)
      if (data?.code === 'invalid_link') { setState('invalid'); return }
      if (data?.code === 'invalid_password' && typeof data.error === 'string') {
        setError(data.error) // mensaje fijo de la política (ver arriba)
      } else {
        setError(SET_PASSWORD_MESSAGES.failed)
      }
    } catch {
      setError(SET_PASSWORD_MESSAGES.failed)
    }
    setState('form')
  }

  const isReset = purpose === 'reset'

  return (
    <div className={styles.authScreen}>
      <main className={styles.authCenter}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.authLogo} src="/logo-ve.jpeg" alt="Virtual English" />

        {state === 'checking' && (
          <p className={styles.authText} role="status">Verificando el link…</p>
        )}

        {state === 'checkError' && (
          <>
            <p className={styles.authError} role="alert">{SET_PASSWORD_MESSAGES.checkFailed}</p>
            <button type="button" className={styles.authPrimary} onClick={check}>Reintentar</button>
          </>
        )}

        {state === 'invalid' && (
          <>
            <h1 className={styles.authTitle}>Este link ya no sirve</h1>
            <p className={styles.authText}>
              El link no es válido o ya venció. Los links para elegir contraseña duran poco
              y se pueden usar una sola vez.
            </p>
            <a href="/forgot-password" className={styles.authPrimary} style={linkAsButton}>
              Pedir un link nuevo
            </a>
            <a href="/" className={styles.authLink}>Volver al inicio</a>
          </>
        )}

        {(state === 'form' || state === 'saving') && (
          <>
            <h1 className={styles.authTitle}>{isReset ? 'Elegí una contraseña nueva' : 'Elegí tu contraseña'}</h1>
            <p className={styles.authText}>
              {isReset
                ? 'Después vas a entrar con tu email y esta contraseña nueva.'
                : 'Con esta contraseña vas a entrar a Virtual English usando tu email.'}
            </p>

            <form className={styles.authForm} onSubmit={submit} noValidate>
              <PasswordInput
                id="new-password"
                label={isReset ? 'Contraseña nueva' : 'Contraseña'}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                hint="Al menos 10 caracteres. Podés usar una frase fácil de recordar."
              />
              <PasswordInput
                id="repeat-password"
                label="Repetí la contraseña"
                value={repeat}
                onChange={setRepeat}
                autoComplete="new-password"
              />

              {error && <p className={styles.authError} role="alert">{error}</p>}

              <button type="submit" className={styles.authPrimary} disabled={state === 'saving'} aria-busy={state === 'saving'}>
                {state === 'saving' ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}

        {state === 'done' && (
          <>
            <h1 className={styles.authTitle}>¡Listo!</h1>
            <p className={styles.authOk} role="status">
              Tu contraseña quedó guardada. Ya podés entrar con tu email y tu contraseña.
              {isReset && ' Por seguridad, cerramos tu sesión en todos los dispositivos.'}
            </p>
            <a href="/" className={styles.authPrimary} style={linkAsButton}>Ir a entrar</a>
          </>
        )}
      </main>
    </div>
  )
}
