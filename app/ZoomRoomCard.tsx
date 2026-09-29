'use client'
// Calendario (G0) — "Mi sala de Zoom" en el inicio del PROFE: su link personal de Zoom,
// que usan solas todas sus clases sin link propio. Habla solo con /api/me/zoom (siempre
// el usuario de la sesión).
import { useEffect, useState, type FormEvent } from 'react'
import styles from './classes.module.css'

export const ZOOM_TEXTS = {
  title: 'Mi sala de Zoom',
  sub: 'Tu link personal de Zoom. Se usa solo en todas tus clases: no lo pegás nunca más.',
  label: 'Link de tu sala de Zoom',
  ph: 'https://us02web.zoom.us/j/…',
  save: 'Guardar',
  saved: 'Guardado. Tus clases sin link usan esta sala.',
  removed: 'Sala quitada.',
  error: 'No se pudo guardar.',
} as const

export default function ZoomRoomCard() {
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/me/zoom')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setValue(typeof d?.zoomUrl === 'string' ? d.zoomUrl : ''); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/me/zoom', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zoomUrl: value.trim() }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setMsg({ ok: false, text: typeof d?.error === 'string' ? d.error : ZOOM_TEXTS.error }); return }
      setValue(d?.zoomUrl ?? '')
      setMsg({ ok: true, text: d?.zoomUrl ? ZOOM_TEXTS.saved : ZOOM_TEXTS.removed })
    } catch {
      setMsg({ ok: false, text: ZOOM_TEXTS.error })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.zr} onSubmit={save} aria-label={ZOOM_TEXTS.title}>
      <span className={styles.zrIcon} aria-hidden="true">Z</span>
      <div className={styles.zrBody}>
        <div className={styles.zrTitle}>{ZOOM_TEXTS.title}</div>
        <div className={styles.tcHint}>{ZOOM_TEXTS.sub}</div>
        <div className={styles.zrRow}>
          <input className={styles.tcInput} style={{ flex: 1 }} type="url" inputMode="url" aria-label={ZOOM_TEXTS.label}
            placeholder={ZOOM_TEXTS.ph} value={value} onChange={(e) => { setValue(e.target.value); setMsg(null) }} disabled={!loaded} />
          <button type="submit" className={styles.tcPrimary} disabled={busy || !loaded}>{busy ? '…' : ZOOM_TEXTS.save}</button>
        </div>
        {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? styles.zrOk : styles.tcError}>{msg.text}</div>}
      </div>
    </form>
  )
}
