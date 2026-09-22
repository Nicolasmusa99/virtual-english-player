'use client'
// Campo de contraseña con botón "Mostrar / Ocultar" (F5). Lo usan la bienvenida
// (D2) y la pantalla de poner contraseña (D6).
// "Mostrar/Ocultar" con palabras, no con un ícono de ojo: más claro para quien no
// conoce la convención. El botón es type="button" para que NUNCA envíe el formulario.
import { useState, type Ref } from 'react'
import styles from './auth.module.css'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  // 'current-password' al entrar, 'new-password' al elegir una: así el gestor de
  // contraseñas del navegador sabe si tiene que completar o sugerir/guardar.
  autoComplete: 'current-password' | 'new-password'
  hint?: string
  ref?: Ref<HTMLInputElement>
}

export default function PasswordInput({ id, label, value, onChange, autoComplete, hint, ref }: Props) {
  const [visible, setVisible] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div className={styles.authField}>
      <label htmlFor={id} className={styles.authLabel}>{label}</label>
      <div className={styles.authInputWrap}>
        <input
          ref={ref}
          id={id}
          className={styles.authInput}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hintId}
        />
        <button
          type="button"
          className={styles.authToggle}
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {hint && <span id={hintId} className={styles.authHint}>{hint}</span>}
    </div>
  )
}
