'use client'
// Rediseño (fase 2) — EL AULA: el marco de todas las pantallas de día del admin y del
// profe. Barra lateral con las secciones (en el celular, pestañas abajo y el logo
// arriba). El player (la sala) y la vista del alumno NO van acá.
// Solo navega: qué hay en cada sección lo decide page.tsx.
import type { ReactNode } from 'react'
import styles from './aula.module.css'

export type AulaNavItem = { id: string; label: string; short?: string; icon: ReactNode }

const svg = (d: ReactNode) => (
  <svg className={styles.ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
export const AULA_ICONS = {
  hoy: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  agenda: svg(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>),
  alumnos: svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>),
  biblioteca: svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></>),
  ejercicios: svg(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>),
  subir: svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>),
  misVideos: svg(<><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 4v16" /></>),
} as const

export const AULA_TEXTS = { nav: 'Secciones', signOut: 'Salir' } as const

export default function AulaShell({ items, current, onGo, user, onSignOut, footer, children }: {
  items: AulaNavItem[]
  current: string
  onGo: (id: string) => void
  user: { name: string; role: string }
  onSignOut: () => void
  /** Debajo de las secciones, en la barra lateral (p. ej. "Mi sala de Zoom" del profe). */
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.shell} style={{ ['--tabs' as string]: items.length }}>
      <nav className={styles.rail} aria-label={AULA_TEXTS.nav}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logo} src="/logo-ve.jpeg" alt="Virtual English" />
        <ul className={styles.navList}>
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" className={styles.navBtn} aria-current={it.id === current ? 'page' : undefined} onClick={() => onGo(it.id)}>
                {it.icon}{it.label}
              </button>
            </li>
          ))}
        </ul>
        <span className={styles.sp} />
        {footer && <div className={styles.foot}>{footer}</div>}
        <div className={styles.me}>
          <div><b>{user.name}</b>{user.role}</div>
          <button type="button" className={styles.txtBtn} onClick={onSignOut}>{AULA_TEXTS.signOut}</button>
        </div>
      </nav>

      {/* Celular: logo y "Salir" arriba; secciones abajo. */}
      <header className={styles.topbar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-ve.jpeg" alt="Virtual English" />
        <button type="button" className={styles.txtBtn} onClick={onSignOut}>{AULA_TEXTS.signOut}</button>
      </header>

      <main className={styles.main}>{children}</main>

      <nav className={styles.tabbar} aria-label={AULA_TEXTS.nav}>
        {items.map((it) => (
          <button key={it.id} type="button" className={styles.tab} aria-current={it.id === current ? 'page' : undefined} onClick={() => onGo(it.id)}>
            {it.icon}{it.short ?? it.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// Una página del aula: título grande, una línea que dice qué hay, y el contenido.
export function AulaPage({ title, lead, back, children }: {
  title: string
  lead?: ReactNode
  /** Sub-pantalla: botón para volver ("Alumnos", "Agenda"…). */
  back?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <div className={styles.page}>
      {back && <button type="button" className={styles.back} onClick={back.onClick}>← {back.label}</button>}
      <h1 className={styles.h1}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </div>
  )
}
