'use client'
// Vista del ALUMNO (fase vista-alumno, E3): "Hola {nombre}" + sus clases (calendario, C3)
// + su material + su player.
// Es un camino APARTE: page.tsx la muestra EN LUGAR de todo lo demás cuando el rol es
// 'alumno', así que el alumno nunca llega a una pantalla del profe. Solo habla con
// /api/student/** (el servidor scopea todo al alumno de la sesión).
// Rediseño (fase 4): el aula de día — "Hola" grande, la próxima clase, y el material en
// tarjetas con miniatura grande; sin etiquetas en mayúsculas ni flechas.
import { useCallback, useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import pageStyles from './page.module.css'
import styles from './student.module.css'
import StudentPlayer, { type StudentVideoData } from './StudentPlayer'
import StudentClasses from './StudentClasses'
import StudentMonth from './StudentMonth'
import {
  assignedAgo, displayVideoName, durationLabel, firstName, levelLabel, typeLabel,
} from '@/lib/studentView'
import type { SharedLevel, SharedType } from '@/lib/db/schema'
import type { StudentPhrase } from '@/lib/assignments'

export type MaterialItem = {
  videoId: string
  originalName: string
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  durationSec: number | null
  assignedAt: string
}

export const STUDENT_TEXTS = {
  hello: (name: string) => (name ? `Hola, ${name}` : 'Hola'),
  intro: 'Tus clases y el material que te asignó tu profe. Tocá un video para verlo.',
  introEmpty: 'Tus clases y el material que te asignó tu profe.',
  material: 'Tu material',
  loading: 'Cargando tu material…',
  emptyTitle: 'Todavía no tenés material',
  emptySub: 'Cuando tu profe te asigne un video, lo vas a ver acá.',
  listErrorTitle: 'No pudimos cargar tu material',
  listErrorSub: 'Revisá tu conexión y probá de nuevo.',
  retry: 'Reintentar',
  signOut: 'Salir',
  opening: 'Abriendo el video…',
  videoGone: 'Ese video ya no está disponible. Puede que tu profe lo haya quitado.',
  videoError: 'No pudimos abrir el video. Probá de nuevo en un momento.',
  close: 'cerrar',
} as const

type ListState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: MaterialItem[] }

// Lo que llega de la API, validado: si algo no tiene la forma esperada, no se usa.
function toVideoData(body: unknown): StudentVideoData | null {
  const b = body as { video?: Record<string, unknown>; captions?: Record<string, unknown> } | null
  const v = b?.video
  if (!v || typeof v.id !== 'string' || typeof v.storageUrl !== 'string' || typeof v.originalName !== 'string') return null
  return {
    id: v.id,
    originalName: v.originalName,
    storageUrl: v.storageUrl,
    durationSec: typeof v.durationSec === 'number' ? v.durationSec : null,
    phrases: Array.isArray(b?.captions?.phrases) ? (b!.captions!.phrases as StudentPhrase[]) : [],
    delay: typeof b?.captions?.delay === 'number' ? (b!.captions!.delay as number) : 0,
  }
}

export default function StudentApp({ name, email }: { name: string | null; email: string | null }) {
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<StudentVideoData | null>(null)
  const [notice, setNotice] = useState('')
  const [monthOpen, setMonthOpen] = useState(false)

  // silent: refresco "por detrás" (tras un 404): la lista actual queda en pantalla
  // hasta que llega la nueva, sin el parpadeo de "Cargando…". Si ese refresco falla,
  // se conserva la lista que había (el aviso del 404 ya explica lo que pasó).
  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setList({ kind: 'loading' })
    try {
      const res = await fetch('/api/student/material')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setList({ kind: 'ok', items: Array.isArray(data?.material) ? data.material : [] })
    } catch {
      if (!opts?.silent) setList({ kind: 'error' })
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  async function open(videoId: string) {
    if (openingId) return // sin doble apertura
    setNotice('')
    setOpeningId(videoId)
    try {
      const res = await fetch(`/api/student/material/${encodeURIComponent(videoId)}`)
      if (res.status === 404) {
        setNotice(STUDENT_TEXTS.videoGone)
        loadList({ silent: true }) // ya no está: se refresca la lista para que desaparezca
        return
      }
      const data = res.ok ? toVideoData(await res.json()) : null
      if (!data) throw new Error('respuesta inválida')
      setPlaying(data)
    } catch {
      setNotice(STUDENT_TEXTS.videoError)
    } finally {
      setOpeningId(null)
    }
  }

  if (playing) return <StudentPlayer data={playing} onBack={() => setPlaying(null)} />

  const hello = STUDENT_TEXTS.hello(firstName(name, email))
  const hasItems = list.kind === 'ok' && list.items.length > 0

  const header = (
    <header className={styles.hBar}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.hLogo} src="/logo-ve.jpeg" alt="Virtual English" />
      <button type="button" className={styles.hOut} onClick={() => signOut()}>{STUDENT_TEXTS.signOut}</button>
    </header>
  )

  if (monthOpen) {
    return (
      <div className={`${pageStyles.lightScope} ${styles.home}`}>
        {header}
        <main className={styles.hBody}><StudentMonth onBack={() => setMonthOpen(false)} /></main>
      </div>
    )
  }

  return (
    <div className={`${pageStyles.lightScope} ${styles.home}`}>
      {header}

      <main className={styles.hBody}>
        <h1 className={styles.hello}>{hello}</h1>
        <p className={styles.helloSub}>{hasItems ? STUDENT_TEXTS.intro : STUDENT_TEXTS.introEmpty}</p>

        <StudentClasses onOpenMonth={() => setMonthOpen(true)} />

        <h2 className={styles.sTitle}>{STUDENT_TEXTS.material}</h2>

        {notice && (
          <div role="alert" className={styles.notice}>
            <span>{notice}</span>
            <button type="button" className={styles.noticeClose} onClick={() => setNotice('')}>{STUDENT_TEXTS.close}</button>
          </div>
        )}
        {openingId && <p role="status" className={styles.opening}>{STUDENT_TEXTS.opening}</p>}

        {list.kind === 'loading' && <p role="status" className={styles.opening}>{STUDENT_TEXTS.loading}</p>}

        {list.kind === 'error' && (
          <div className={styles.state}>
            <div className={styles.stateTitle}>{STUDENT_TEXTS.listErrorTitle}</div>
            <div className={styles.stateSub}>{STUDENT_TEXTS.listErrorSub}</div>
            <button type="button" className={styles.stateBtn} onClick={() => loadList()}>{STUDENT_TEXTS.retry}</button>
          </div>
        )}

        {list.kind === 'ok' && list.items.length === 0 && (
          <div className={styles.state}>
            <div className={styles.stateIcon} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            </div>
            <div className={styles.stateTitle}>{STUDENT_TEXTS.emptyTitle}</div>
            <div className={styles.stateSub}>{STUDENT_TEXTS.emptySub}</div>
          </div>
        )}

        {hasItems && (
          <ul className={styles.list}>
            {list.items.map((m) => {
              const meta = [typeLabel(m.sharedType), levelLabel(m.sharedLevel), durationLabel(m.durationSec)].filter(Boolean).join(', ')
              return (
                <li key={m.videoId}>
                  <button type="button" className={styles.card} onClick={() => open(m.videoId)} disabled={!!openingId}>
                    <span className={styles.thumb} aria-hidden="true">
                      <svg width="28" height="28" viewBox="0 0 24 24"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg>
                    </span>
                    <span className={styles.cTitle}>{displayVideoName(m.originalName)}</span>
                    {meta && <span className={styles.cMeta}>{meta}</span>}
                    <span className={styles.cWhen}>{assignedAgo(m.assignedAt)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
