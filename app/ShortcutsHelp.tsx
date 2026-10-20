'use client'
// Player del profe (paso 5): "Atajos de teclado", una sección que se despliega al pie del
// guion (reemplaza la fila mínima de antes). Por atajo: la tecla, qué hace y una línea de
// ayuda. Se abre con el botón (con la "i"), se cierra con el mismo botón o con Escape (el
// foco vuelve al botón). Lleva KB_IGNORE_ATTR: con el foco acá adentro, ninguna tecla
// dispara un atajo de reproducción. Es una sección y no una ventanita flotante porque el
// panel tiene scroll propio y la recortaría.
import { useId, useRef, useState } from 'react'
import styles from './Tooltip.module.css'
import { InfoMark } from './Tooltip'
import { KB_IGNORE_ATTR, SHORTCUTS, SHORTCUTS_NOTE } from '@/lib/shortcuts'

export const SHORTCUTS_HELP_TEXTS = { toggle: 'Atajos de teclado' } as const

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <div className={styles.help} {...{ [KB_IGNORE_ATTR]: '' }}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); btnRef.current?.focus() } }}>
      <div id={id} className={styles.helpBody} role="region" aria-label={SHORTCUTS_HELP_TEXTS.toggle} hidden={!open}>
        <dl className={styles.helpList}>
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className={styles.helpRow}>
              <dt><kbd className={styles.kbd} aria-label={s.name}>{s.keys}</kbd></dt>
              <dd>
                <span className={styles.helpWhat}>{s.what}</span>
                <span className={styles.helpLine}>{s.help}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.helpNote}>{SHORTCUTS_NOTE}</p>
      </div>
      <button ref={btnRef} type="button" className={styles.helpBtn} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((o) => !o)}>
        <InfoMark />{SHORTCUTS_HELP_TEXTS.toggle}
        <span className={`${styles.chev} ${open ? styles.chevUp : ''}`} aria-hidden="true" />
      </button>
    </div>
  )
}
