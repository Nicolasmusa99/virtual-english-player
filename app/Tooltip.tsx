'use client'
// Tooltip tipo "info" reutilizable (paso 5): explica qué hace un botón. Se muestra al pasar
// el mouse Y al llegar con el teclado (foco), no solo con hover, y se cierra con Escape (sin
// que el Escape siga de largo). El texto está siempre en el DOM (oculto) y el botón lo
// referencia con aria-describedby, así los lectores de pantalla lo leen.
// No bloquea los atajos del player: después de tocar un modo, las flechas siguen andando.
import { cloneElement, useId, useState, type ReactElement } from 'react'
import styles from './Tooltip.module.css'

export default function Tooltip({ text, align = 'center', children }: {
  text: string
  /** Dónde se alinea el globo respecto del botón (los de los bordes del panel, hacia adentro). */
  align?: 'start' | 'center' | 'end'
  children: ReactElement<{ 'aria-describedby'?: string }>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const show = () => setOpen(true)
  const hide = () => setOpen(false)
  return (
    <span className={styles.wrap}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); hide() } }}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span id={id} role="tooltip" className={`${styles.tip} ${styles[align]} ${open ? styles.open : ''}`}>
        {text}
      </span>
    </span>
  )
}

// La "i" que marca que un botón tiene explicación (va adentro del botón y es decorativa: el
// texto lo lee el lector de pantalla por aria-describedby). La letra la dibuja el CSS, así
// el texto del botón sigue siendo solo su nombre ("Auto-pausa").
export function InfoMark() {
  return <span className={styles.mark} aria-hidden="true" />
}
