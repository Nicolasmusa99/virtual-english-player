'use client'
// Menú de acciones "⋯" (2026-11): lo que no es la acción principal de una fila o una carpeta
// (renombrar, mover, quitar, eliminar) va acá, como en Drive o Classroom. Se cierra al elegir,
// con Escape o tocando afuera. Puede tener títulos de grupo y una opción peligrosa (roja).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './material.module.css'

export type MenuItem =
  | { kind?: 'item'; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { kind: 'title'; label: string }
  | { kind: 'sep' }

export default function ActionMenu({ label, items, trigger, align = 'end' }: {
  /** Nombre accesible del botón (ej. "Más acciones de Let It Be"). */
  label: string
  items: MenuItem[]
  /** Contenido del botón; por defecto "⋯". */
  trigger?: ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)') ?? [])
        if (list.length === 0) return
        e.preventDefault()
        const at = list.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? (at + 1) % list.length : (at - 1 + list.length) % list.length
        list[next].focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    wrap.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus()
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [open])

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button ref={btn} type="button" className={trigger ? styles.menuTxtBtn : styles.menuBtn} aria-label={trigger ? undefined : label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        {trigger ?? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={`${styles.menu} ${align === 'start' ? styles.menuStart : ''}`}
          onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => {
            if (it.kind === 'title') return <div key={i} className={styles.menuTitle}>{it.label}</div>
            if (it.kind === 'sep') return <div key={i} className={styles.menuSep} role="separator" />
            return (
              <button key={i} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={it.checked === undefined ? undefined : it.checked}
                className={`${styles.menuItem} ${it.danger ? styles.menuDanger : ''}`} disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect() }}>
                {it.checked !== undefined && <span className={styles.menuCheck} aria-hidden="true">{it.checked ? '✓' : ''}</span>}
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
