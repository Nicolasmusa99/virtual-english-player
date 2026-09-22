'use client'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import styles from './page.module.css'
import type { Role } from '@/lib/db/schema'
import { INVITE_TTL_DAYS } from '@/lib/emailTemplates'

interface UserRow {
  id: string
  email: string | null
  role: Role | null
  teacherId: string | null
}

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// ─── Invitación (fase login-password, F5) ───────────────────────────────────
// Botón explícito por fila + confirmación que muestra A QUIÉN va, para no
// mandarle al alumno equivocado. Todos los textos son fijos: el texto que venga
// del server no se muestra nunca; el status y el `reason` se TRADUCEN acá.
// (Acá sí se informa el motivo de un envío fallido: quien mira es admin/profe,
// que ya ve a esa persona en su lista; no hay nada que enumerar.)
type InviteStatus = { phase: 'sending' } | { phase: 'sent' } | { phase: 'error'; message: string }

export const INVITE_MESSAGES = {
  failed: 'No se pudo enviar la invitación. Probá de nuevo.',
  forbidden: 'No tenés permiso para invitar a este usuario.',
  notFound: 'Ese usuario ya no existe. Recargá la lista.',
  notInvitable: 'Este usuario no se puede invitar todavía (le falta rol o email).',
  expired: 'Tu sesión venció. Volvé a entrar.',
  blockedByTestBarrier: 'Frenado por la barrera de pruebas: este entorno no manda mails a esa casilla.',
  mailNotConfigured: 'El envío de mails no está configurado.',
  mailOff: 'El envío de mails está desactivado.',
  mailFailed: 'No se pudo mandar el mail. Probá de nuevo en un rato.',
} as const

/** Status HTTP de /api/users/[id]/invite → texto fijo. */
export function inviteErrorFor(status: number): string {
  if (status === 401) return INVITE_MESSAGES.expired
  if (status === 403) return INVITE_MESSAGES.forbidden
  if (status === 404) return INVITE_MESSAGES.notFound
  if (status === 400) return INVITE_MESSAGES.notInvitable
  return INVITE_MESSAGES.failed
}

/** 200 pero el mail no salió: `reason` → texto fijo. */
export function deliveryErrorFor(reason: unknown): string {
  if (reason === 'allowlist') return INVITE_MESSAGES.blockedByTestBarrier
  if (reason === 'no-api-key') return INVITE_MESSAGES.mailNotConfigured
  if (reason === 'off') return INVITE_MESSAGES.mailOff
  return INVITE_MESSAGES.mailFailed
}

// Fase 3a — cara visible de /api/users (Fase 2). Solo consume GET/POST existentes;
// la seguridad real vive en el backend. El `role` decide qué vista mostrar.
export default function UsersPanel({ role, onOpenStudent }: { role: Role; onOpenStudent?: (id: string, email: string) => void }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // form crear
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('alumno')
  const [teacherId, setTeacherId] = useState('') // '' = sin profe (teacherId null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // búsqueda / filtro (front-only)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  // invitación: qué fila está confirmando (una a la vez) y el resultado por fila
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [invites, setInvites] = useState<Record<string, InviteStatus>>({})

  async function sendInvite(u: UserRow) {
    if (invites[u.id]?.phase === 'sending') return // sin doble envío
    setConfirmId(null)
    setInvites((s) => ({ ...s, [u.id]: { phase: 'sending' } }))
    let result: InviteStatus
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(u.id)}/invite`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        result = data?.delivered === true
          ? { phase: 'sent' }
          : { phase: 'error', message: deliveryErrorFor(data?.reason) }
      } else {
        result = { phase: 'error', message: inviteErrorFor(res.status) }
      }
    } catch {
      result = { phase: 'error', message: INVITE_MESSAGES.failed }
    }
    setInvites((s) => ({ ...s, [u.id]: result }))
  }

  async function load() {
    setLoading(true); setLoadError('')
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch {
      setLoadError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const teachers = useMemo(() => users.filter(u => u.role === 'profesor'), [users])
  const emailById = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u.email])) as Record<string, string | null>,
    [users]
  )

  const filtered = useMemo(() => users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (q && !(u.email ?? '').toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [users, q, roleFilter])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(''); setOkMsg('')
    const mail = email.trim()
    if (!isValidEmail(mail)) { setFormError('Ingresá un email válido.'); return }

    // El rol a crear sale del rol del creador: un profesor solo crea alumnos.
    const roleToCreate: Role = role === 'profesor' ? 'alumno' : newRole
    const body: Record<string, unknown> = { email: mail, role: roleToCreate }
    if (role === 'admin' && roleToCreate === 'alumno' && teacherId) body.teacherId = teacherId

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 201) {
        setOkMsg(`Usuario creado: ${data.email ?? mail}`)
        setEmail(''); setTeacherId(''); setNewRole('alumno')
        await load()
      } else if (res.status === 409) {
        setFormError('Ya existe un usuario con ese email.')
      } else if (res.status === 400) {
        setFormError(data.error || 'Datos inválidos.')
      } else if (res.status === 403) {
        setFormError('No tenés permiso para crear ese usuario.')
      } else {
        setFormError(data.error || 'No se pudo crear el usuario.')
      }
    } catch {
      setFormError('Error de red al crear el usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* CREAR — vista admin */}
      {role === 'admin' && (
        <form className={styles.usersForm} onSubmit={submit}>
          <div className={styles.usersFormRow}>
            <select className={styles.usersInput} value={newRole} onChange={e => setNewRole(e.target.value as Role)}>
              <option value="admin">Admin</option>
              <option value="profesor">Profesor</option>
              <option value="alumno">Alumno</option>
            </select>
            <input className={styles.usersInput} type="email" placeholder="email@ejemplo.com"
              value={email} onChange={e => setEmail(e.target.value)} />
            {newRole === 'alumno' && (
              <select className={styles.usersInput} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                <option value="">— sin profe —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
              </select>
            )}
            <button className={styles.tbBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear'}</button>
          </div>
          {newRole === 'alumno' && teachers.length === 0 && (
            <div className={styles.progSub}>Todavía no hay profesores cargados; el alumno quedará sin profe.</div>
          )}
          {formError && <div className={styles.errorBox}>{formError}</div>}
          {okMsg && <div className={styles.usersOk}>{okMsg}</div>}
        </form>
      )}

      {/* CREAR — vista profesor (solo alumno; el backend lo asigna a este profe) */}
      {role === 'profesor' && (
        <form className={styles.usersForm} onSubmit={submit}>
          <div className={styles.usersFormRow}>
            <input className={styles.usersInput} type="email" placeholder="email del alumno"
              value={email} onChange={e => setEmail(e.target.value)} />
            <button className={styles.tbBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear alumno'}</button>
          </div>
          <div className={styles.progSub}>El alumno queda asignado a vos automáticamente.</div>
          {formError && <div className={styles.errorBox}>{formError}</div>}
          {okMsg && <div className={styles.usersOk}>{okMsg}</div>}
        </form>
      )}

      {/* BÚSQUEDA + FILTRO */}
      <div className={styles.usersToolbar}>
        <input className={styles.usersSearch} placeholder="Buscar por email…" value={q} onChange={e => setQ(e.target.value)} />
        {role === 'admin' && (
          <div className={styles.usersFilters}>
            {(['all', 'admin', 'profesor', 'alumno'] as const).map(r => (
              <button key={r} type="button"
                className={`${styles.usersFilterChip} ${roleFilter === r ? styles.usersFilterChipOn : ''}`}
                onClick={() => setRoleFilter(r)}>
                {r === 'all' ? 'Todos' : r}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadError && <div className={styles.errorBox}>{loadError}</div>}

      {loading ? (
        <div className={styles.progSub}>Cargando usuarios…</div>
      ) : users.length === 0 ? (
        <div className={styles.progSub}>
          {role === 'profesor'
            ? 'Aún no tenés alumnos. Creá el primero con el formulario de arriba.'
            : 'No hay usuarios todavía.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.progSub}>No hay resultados para esa búsqueda.</div>
      ) : (
        <>
          <div className={styles.progSub}>{filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(u => {
              const inv = invites[u.id]
              const canInvite = !!u.email && !!u.role
              return (
              <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={styles.restoreBanner}>
                <span className={styles.restoreBannerText}>
                  {u.email}
                  {u.role === 'alumno' && role === 'admin' && (
                    <span className={styles.usersMeta}> · profe: {u.teacherId ? (emailById[u.teacherId] ?? '—') : '—'}</span>
                  )}
                </span>
                <span className={`${styles.chip} ${styles.chipSrt}`}>{u.role}</span>
                {u.role === 'alumno' && onOpenStudent && (
                  <button className={styles.tbBtn} onClick={() => onOpenStudent(u.id, u.email ?? '')}>Abrir</button>
                )}
                {canInvite && (
                  <button
                    className={styles.tbBtn}
                    disabled={inv?.phase === 'sending'}
                    aria-expanded={confirmId === u.id}
                    onClick={() => setConfirmId(confirmId === u.id ? null : u.id)}
                  >
                    {inv?.phase === 'sending' ? 'Enviando…' : inv?.phase === 'sent' ? 'Reenviar' : 'Enviar invitación'}
                  </button>
                )}
              </div>

              {confirmId === u.id && (
                <div className={styles.usersForm} role="group" aria-label={`Confirmar invitación a ${u.email}`}>
                  <span style={{ color: 'var(--tx)' }}>¿Enviar invitación a <strong>{u.email}</strong>?</span>
                  <span className={styles.progSub}>
                    Le llega un mail con un link para elegir su contraseña. El link vence en {INVITE_TTL_DAYS} días.
                    Si ya le habías mandado una, el link anterior deja de funcionar.
                  </span>
                  <div className={styles.usersFormRow}>
                    <button className={styles.tbBtn} onClick={() => sendInvite(u)}>Enviar</button>
                    <button className={styles.tbBtn} onClick={() => setConfirmId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
              {inv?.phase === 'sent' && (
                <div className={styles.usersOk} role="status">✓ Invitación enviada a {u.email}</div>
              )}
              {inv?.phase === 'error' && (
                <div className={styles.errorBox} role="alert">{inv.message}</div>
              )}
              </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
