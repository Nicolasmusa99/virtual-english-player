'use client'
// Rediseño (fase 2) — "Mi sala de Zoom" en corto: si está cargada y un botón para
// cambiarla, que abre la tarjeta de siempre (ZoomRoomCard) en una ventana. Va al pie de
// la barra lateral del profe y, en el celular, al final de "Hoy".
import { useEffect, useState } from 'react'
import styles from './aula.module.css'
import { Modal } from './ClassDialog'
import ZoomRoomCard from './ZoomRoomCard'

export const ZOOM_STATUS_TEXTS = {
  title: 'Mi sala de Zoom',
  readyWord: 'Lista',
  readyRest: ', la usan todas tus clases.',
  missing: 'Sin cargar: cargala y no pegás el link en cada clase.',
  change: 'Cambiar el link',
  add: 'Cargar el link',
  close: 'Listo',
} as const

export default function ZoomRoomStatus() {
  const T = ZOOM_STATUS_TEXTS
  const [url, setUrl] = useState<string | null | undefined>(undefined) // undefined = cargando
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/me/zoom')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setUrl(typeof d?.zoomUrl === 'string' && d.zoomUrl ? d.zoomUrl : null) })
      .catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [])

  return (
    <div className={styles.zs} data-testid="zoom-status">
      <b>{T.title}</b>
      {url !== undefined && (url ? <span><span className={styles.zsOk}>{T.readyWord}</span>{T.readyRest}</span> : <span>{T.missing}</span>)}
      <span><button type="button" className={styles.txtBtn} onClick={() => setOpen(true)}>{url ? T.change : T.add}</button></span>
      {open && (
        <Modal label={T.title} onClose={() => setOpen(false)}>
          <div className={styles.zsBox}>
            <ZoomRoomCard onSaved={setUrl} />
            <button type="button" className={`${styles.btn} ${styles.btnSec} ${styles.zsClose}`} onClick={() => setOpen(false)}>{T.close}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
