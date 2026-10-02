'use client'
// Vista del ALUMNO (fase vista-alumno, E3): "Hola {nombre}" + sus clases (calendario, C3)
// + su material + su player.
// Es un camino APARTE: page.tsx la muestra EN LUGAR de todo lo demás cuando el rol es
// 'alumno', así que el alumno nunca llega a una pantalla del profe. Solo habla con
// /api/student/** (el servidor scopea todo al alumno de la sesión).
// Rediseño (fase 4): el aula de día — "Hola" grande, la próxima clase, y el material en
// tarjetas con miniatura grande; sin etiquetas en mayúsculas ni flechas.
// Vista del alumno v2: barra con "Inicio" y "Calendario" (en el celular, abajo). El inicio
// va en dos columnas (material a la izquierda, la próxima clase a la derecha; en el celular,
// la clase primero). Lo asignado en los últimos 7 días va primero y con "Nuevo". Sin
// material, la clase pasa a ser lo principal; sin clases ni material, una bienvenida.
// El calendario es la grilla semanal de StudentWeek (reemplaza al mes).
import { useCallback, useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import pageStyles from './page.module.css'
import styles from './student.module.css'
import StudentPlayer, { type StudentVideoData } from './StudentPlayer'
import StudentClasses, { hasUpcoming, useStudentClasses } from './StudentClasses'
import StudentWeek from './StudentWeek'
import {
  assignedAgo, displayVideoName, durationLabel, firstName, isNewAssignment, levelLabel, newestFirst, typeLabel,
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
  intro: 'Tocá un video para practicar.',
  introEmpty: 'Acá vas a ver tus clases y el material que te asigne tu profe.',
  welcome: 'Te damos la bienvenida a Virtual English.',
  welcomeTitle: 'Todavía no tenés clases ni material',
  welcomeSub: 'Cuando tu profe te agende una clase o te asigne un video, lo vas a ver acá.',
  nav: 'Secciones',
  home: 'Inicio',
  calendar: 'Calendario',
  material: 'Tu material',
  isNew: 'Nuevo',
  loading: 'Cargando tu material…',
  emptyTitle: 'Todavía no tenés material',
  emptySub: 'Cuando tu profe te asigne un video, aparece acá para que lo practiques.',
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
  const T = STUDENT_TEXTS
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<StudentVideoData | null>(null)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'inicio' | 'calendario'>('inicio')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
  const { state: classes, reload: reloadClasses } = useStudentClasses()
  const homeRef = useRef<HTMLDivElement>(null)

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
        setNotice(T.videoGone)
        loadList({ silent: true }) // ya no está: se refresca la lista para que desaparezca
        return
      }
      const data = res.ok ? toVideoData(await res.json()) : null
      if (!data) throw new Error('respuesta inválida')
      setPlaying(data)
    } catch {
      setNotice(T.videoError)
    } finally {
      setOpeningId(null)
    }
  }

  function goTab(t: 'inicio' | 'calendario') {
    setTab(t)
    if (homeRef.current) homeRef.current.scrollTop = 0
  }

  if (playing) return <StudentPlayer data={playing} onBack={() => setPlaying(null)} />

  const hello = T.hello(firstName(name, email))
  const items = list.kind === 'ok' ? newestFirst(list.items) : []
  const noMaterial = list.kind === 'ok' && items.length === 0
  const noClasses = classes.kind === 'ok' && !hasUpcoming(classes.classes, now)
  // Armado del inicio: con material, dos columnas; sin material, la clase es lo principal;
  // sin clases ni material, una bienvenida.
  const layout = noMaterial && noClasses ? 'welcome' : noMaterial ? 'classFirst' : 'cols'
  const lead = layout === 'welcome' ? T.welcome : items.length > 0 ? T.intro : T.introEmpty

  const header = (
    <header className={styles.hBar}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.hLogo} src="/logo-ve.jpeg" alt="Virtual English" />
      <nav className={styles.hTabs} aria-label={T.nav}>
        {(['inicio', 'calendario'] as const).map((k) => (
          <button key={k} type="button" className={`${styles.hTab} ${tab === k ? styles.hTabOn : ''}`}
            aria-current={tab === k ? 'page' : undefined} onClick={() => goTab(k)}>
            {k === 'inicio' ? T.home : T.calendar}
          </button>
        ))}
      </nav>
      <span className={styles.hSp} />
      {(name || email) && <span className={styles.hMe}>{name || email}</span>}
      <button type="button" className={styles.hOut} onClick={() => signOut()}>{T.signOut}</button>
    </header>
  )

  if (tab === 'calendario') {
    return (
      <div ref={homeRef} className={`${pageStyles.lightScope} ${styles.home}`}>
        {header}
        <main className={styles.wkBody}>
          <StudentWeek upcoming={classes.kind === 'ok' ? classes.classes : []} />
        </main>
      </div>
    )
  }

  const classesBlock = (
    <StudentClasses state={classes} now={now} wide={layout === 'classFirst'} onRetry={reloadClasses} onOpenCalendar={() => goTab('calendario')} />
  )

  const materialBlock = (
    <section className={styles.mat} aria-label={T.material}>
      <h2 className={styles.sTitle}>{T.material}</h2>

      {list.kind === 'loading' && <p role="status" className={styles.opening}>{T.loading}</p>}

      {list.kind === 'error' && (
        <div className={styles.empty}>
          <div className={styles.emTitle}>{T.listErrorTitle}</div>
          <div className={styles.emSub}>{T.listErrorSub}</div>
          <button type="button" className={styles.stateBtn} onClick={() => loadList()}>{T.retry}</button>
        </div>
      )}

      {noMaterial && (
        <div className={styles.empty}>
          <div className={styles.emTitle}>{T.emptyTitle}</div>
          <div className={styles.emSub}>{T.emptySub}</div>
        </div>
      )}

      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((m) => {
            const meta = [typeLabel(m.sharedType), levelLabel(m.sharedLevel), durationLabel(m.durationSec)].filter(Boolean).join(', ')
            const fresh = isNewAssignment(m.assignedAt, now)
            return (
              <li key={m.videoId}>
                <button type="button" className={styles.card} onClick={() => open(m.videoId)} disabled={!!openingId}>
                  <span className={styles.thumb} aria-hidden="true">
                    {fresh && <span className={styles.newTag}>{T.isNew}</span>}
                    <svg width="28" height="28" viewBox="0 0 24 24"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg>
                  </span>
                  <span className={styles.cTitle}>{displayVideoName(m.originalName)}</span>
                  {fresh && <span className={styles.srOnly}>, {T.isNew}</span>}
                  {meta && <span className={styles.cMeta}>{meta}</span>}
                  <span className={styles.cWhen}>{assignedAgo(m.assignedAt, now)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div ref={homeRef} className={`${pageStyles.lightScope} ${styles.home}`}>
      {header}

      <main className={styles.hBody}>
        <h1 className={styles.hello}>{hello}</h1>
        <p className={styles.helloSub}>{lead}</p>

        {notice && (
          <div role="alert" className={styles.notice}>
            <span>{notice}</span>
            <button type="button" className={styles.noticeClose} onClick={() => setNotice('')}>{T.close}</button>
          </div>
        )}
        {openingId && <p role="status" className={styles.opening}>{T.opening}</p>}

        {layout === 'welcome' && (
          <div className={styles.empty}>
            <div className={styles.emTitle}>{T.welcomeTitle}</div>
            <div className={styles.emSub}>{T.welcomeSub}</div>
          </div>
        )}

        {layout === 'classFirst' && <>{classesBlock}{materialBlock}</>}

        {layout === 'cols' && (
          <div className={`${styles.cols} ${noClasses ? styles.colsMatFirst : ''}`}>
            {materialBlock}
            <div className={styles.aside}>{classesBlock}</div>
          </div>
        )}
      </main>
    </div>
  )
}
