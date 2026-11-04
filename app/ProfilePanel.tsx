'use client'
// "Mi perfil" (2026-11): la foto, el nombre y la contraseña de quien entró. Lo usan el aula
// (admin y profe) y la vista del alumno.
//   · Foto: la de Google se pone sola al entrar. Se puede subir otra (se recorta cuadrada en
//     el navegador y se achica antes de subir) y quitarla para volver a la de Google.
//   · Nombre y apellido: editable.
//   · Contraseña: solo si la cuenta entra con usuario y contraseña.
// Habla solo con /api/me, /api/me/photo y /api/me/password (siempre sobre la sesión).
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { upload } from '@vercel/blob/client'
import styles from './profile.module.css'
import ms from './material.module.css'
import Avatar from './Avatar'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'
import { PASSWORD_MIN, passwordProblem } from '@/lib/passwordRules'
import { AVATAR_MAX_BYTES, AVATAR_SIZE, avatarPrefix } from '@/lib/avatar'

type Profile = {
  id: string
  name: string | null
  email: string | null
  role: 'admin' | 'profesor' | 'alumno' | null
  image: string | null
  imageCustom: boolean
  hasGoogleImage: boolean
  username: string | null
  hasPassword: boolean
  hasGoogle: boolean
}

export const PROFILE_TEXTS = {
  photo: 'Foto', upload: 'Subir una foto', change: 'Cambiar la foto', remove: 'Quitar la foto',
  useGoogle: 'Usar la de Google',
  photoHint: 'JPG, PNG o WEBP. Se recorta cuadrada.',
  photoFromGoogle: 'Es la foto de tu cuenta de Google.',
  uploading: 'Subiendo…',
  photoError: 'No se pudo subir la foto. Probá con otra imagen.',
  notImage: 'Elegí una imagen (JPG, PNG o WEBP).',
  data: 'Tus datos', name: 'Nombre y apellido', email: 'Email', username: 'Usuario',
  save: 'Guardar', saved: 'Guardado.',
  signIn: 'Cómo entrás', withGoogle: 'Con Google', withPassword: 'Con usuario y contraseña',
  password: 'Contraseña', current: 'Contraseña actual', next: 'Contraseña nueva', repeat: 'Repetila',
  changePassword: 'Cambiar la contraseña', mismatch: 'Las dos contraseñas nuevas no coinciden.',
  passwordSaved: 'Listo: tu contraseña cambió. Las otras sesiones abiertas se cerraron.',
  loadError: 'No se pudo cargar tu perfil.',
  roles: { admin: 'Admin', profesor: 'Profe', alumno: 'Alumno' },
} as const

// Recorta la imagen al centro, cuadrada, y la achica a AVATAR_SIZE (JPEG). Así la foto
// pesa poco y se ve bien en cualquier círculo.
async function squareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const out = Math.min(AVATAR_SIZE, side)
    const canvas = document.createElement('canvas')
    canvas.width = out; canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sin canvas')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('sin blob'))), 'image/jpeg', 0.88))
  } finally { URL.revokeObjectURL(url) }
}

export default function ProfilePanel({ onChanged }: {
  /** Algo cambió (foto o nombre): para refrescar la sesión y el resto de la pantalla. */
  onChanged?: () => void
}) {
  const T = PROFILE_TEXTS
  const [p, setP] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const [name, setName] = useState('')
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [nameBusy, setNameBusy] = useState(false)

  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [rep, setRep] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me')
      if (!res.ok) throw new Error()
      const prof: Profile = (await res.json()).profile
      setP(prof); setName(prof.name ?? '')
    } catch { setLoadError(T.loadError) }
  }, [T.loadError])
  useEffect(() => { load() }, [load])

  async function pickPhoto(file: File | undefined) {
    if (!file || !p) return
    setPhotoError('')
    if (!/^image\//.test(file.type)) { setPhotoError(T.notImage); return }
    setPhotoBusy(true)
    try {
      const blob = await squareJpeg(file)
      if (blob.size > AVATAR_MAX_BYTES) throw new Error('grande')
      const up = await upload(`${avatarPrefix(p.id)}foto.jpg`, blob, { access: 'public', handleUploadUrl: '/api/me/photo', contentType: 'image/jpeg' })
      const res = await fetch('/api/me/photo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: up.url }) })
      if (!res.ok) throw new Error()
      const { image } = await res.json()
      setP((x) => (x ? { ...x, image, imageCustom: true } : x))
      onChanged?.()
    } catch { setPhotoError(T.photoError) }
    finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function removePhoto() {
    setPhotoBusy(true); setPhotoError('')
    try {
      const res = await fetch('/api/me/photo', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      const { image } = await res.json()
      setP((x) => (x ? { ...x, image, imageCustom: false } : x))
      onChanged?.()
    } catch { setPhotoError(T.photoError) }
    finally { setPhotoBusy(false) }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault()
    const clean = normalizePersonName(name)
    if (!clean) { setNameMsg({ ok: false, text: NAME_ERROR }); return }
    setNameBusy(true); setNameMsg(null)
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: clean }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error)
      setP((x) => (x ? { ...x, name: clean } : x)); setName(clean)
      setNameMsg({ ok: true, text: T.saved })
      onChanged?.()
    } catch (err) { setNameMsg({ ok: false, text: (err as Error).message || 'No se pudo guardar.' }) }
    finally { setNameBusy(false) }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    const problem = passwordProblem(next)
    if (problem) { setPwMsg({ ok: false, text: problem }); return }
    if (next !== rep) { setPwMsg({ ok: false, text: T.mismatch }); return }
    setPwBusy(true)
    try {
      const res = await fetch('/api/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: cur, next }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error)
      setCur(''); setNext(''); setRep('')
      setPwMsg({ ok: true, text: T.passwordSaved })
    } catch (err) { setPwMsg({ ok: false, text: (err as Error).message || 'No se pudo cambiar la contraseña.' }) }
    finally { setPwBusy(false) }
  }

  if (loadError) return <div className={ms.err} role="alert">{loadError}</div>
  if (!p) return <p className={ms.muted}>Cargando…</p>

  const dirtyName = (normalizePersonName(name) ?? name) !== (p.name ?? '')

  return (
    <div className={styles.wrap}>
      {/* ── Foto ── */}
      <section className={styles.card} aria-label={T.photo}>
        <div className={styles.photoRow}>
          <div className={styles.photoBox}>
            <Avatar id={p.id} name={p.name} email={p.email} image={p.image} size={112} />
            {photoBusy && <span className={styles.photoBusy}>{T.uploading}</span>}
          </div>
          <div className={styles.photoInfo}>
            <h2 className={styles.who}>{p.name || p.username || p.email}</h2>
            <p className={styles.sub}>{[p.role && T.roles[p.role], p.email].filter(Boolean).join(', ')}</p>
            <div className={styles.photoBtns}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={T.upload}
                onChange={(e) => pickPhoto(e.target.files?.[0])} />
              <button type="button" className={`${ms.btn} ${ms.btnPri}`} disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                {p.image ? T.change : T.upload}
              </button>
              {p.imageCustom && (
                <button type="button" className={ms.btn} disabled={photoBusy} onClick={removePhoto}>
                  {p.hasGoogleImage ? T.useGoogle : T.remove}
                </button>
              )}
            </div>
            <p className={styles.hint}>{p.image && !p.imageCustom && p.hasGoogleImage ? T.photoFromGoogle : T.photoHint}</p>
            {photoError && <div className={ms.err} role="alert" style={{ margin: '8px 0 0' }}>{photoError}</div>}
          </div>
        </div>
      </section>

      {/* ── Datos ── */}
      <section className={styles.card} aria-label={T.data}>
        <h3 className={styles.h3}>{T.data}</h3>
        <form onSubmit={saveName} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.lbl}>{T.name}</span>
            <input className={ms.input} maxLength={NAME_MAX} value={name} onChange={(e) => { setName(e.target.value); setNameMsg(null) }} />
          </label>
          {p.email && (
            <div className={styles.field}><span className={styles.lbl}>{T.email}</span><span className={styles.ro}>{p.email}</span></div>
          )}
          {p.username && (
            <div className={styles.field}><span className={styles.lbl}>{T.username}</span><span className={styles.ro}>{p.username}</span></div>
          )}
          <div className={styles.field}>
            <span className={styles.lbl}>{T.signIn}</span>
            <span className={styles.ro}>{[p.hasGoogle && T.withGoogle, p.hasPassword && T.withPassword].filter(Boolean).join(' y ') || T.withGoogle}</span>
          </div>
          <div className={styles.formFoot}>
            {nameMsg && <span role={nameMsg.ok ? 'status' : 'alert'} className={nameMsg.ok ? styles.ok : styles.bad}>{nameMsg.text}</span>}
            <span className={ms.sp} />
            <button type="submit" className={`${ms.btn} ${ms.btnPri}`} disabled={nameBusy || !dirtyName}>{T.save}</button>
          </div>
        </form>
      </section>

      {/* ── Contraseña ── */}
      {p.hasPassword && (
        <section className={styles.card} aria-label={T.password}>
          <h3 className={styles.h3}>{T.changePassword}</h3>
          <form onSubmit={savePassword} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.lbl}>{T.current}</span>
              <input className={ms.input} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </label>
            <div className={styles.two}>
              <label className={styles.field}>
                <span className={styles.lbl}>{T.next}</span>
                <input className={ms.input} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.lbl}>{T.repeat}</span>
                <input className={ms.input} type="password" autoComplete="new-password" value={rep} onChange={(e) => setRep(e.target.value)} />
              </label>
            </div>
            <p className={styles.hint}>Al menos {PASSWORD_MIN} caracteres.</p>
            <div className={styles.formFoot}>
              {pwMsg && <span role={pwMsg.ok ? 'status' : 'alert'} className={pwMsg.ok ? styles.ok : styles.bad}>{pwMsg.text}</span>}
              <span className={ms.sp} />
              <button type="submit" className={`${ms.btn} ${ms.btnPri}`} disabled={pwBusy || !cur || !next}>{T.changePassword}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
