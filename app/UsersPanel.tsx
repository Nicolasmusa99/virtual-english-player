'use client'
import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'
import type { Role } from '@/lib/db/schema'

interface UserRow {
  id: string
  email: string | null
  role: Role | null
  teacherId: string | null
}

// Fase 3a — cara visible de /api/users (Fase 2). Solo consume GET/POST existentes;
// la seguridad real vive en el backend. El `role` decide qué vista mostrar.
export default function UsersPanel({ role }: { role: Role }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [q, setQ] = useState('')

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

  const filtered = useMemo(
    () => users.filter(u => !q || (u.email ?? '').toLowerCase().includes(q.toLowerCase())),
    [users, q]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {loadError && <div className={styles.errorBox}>{loadError}</div>}

      <input
        className={styles.usersSearch}
        placeholder="Buscar por email…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      {loading ? (
        <div className={styles.progSub}>Cargando usuarios…</div>
      ) : users.length === 0 ? (
        <div className={styles.progSub}>
          {role === 'profesor'
            ? 'Aún no tenés alumnos. Creá el primero con el formulario de arriba.'
            : 'No hay usuarios todavía.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.progSub}>No hay resultados para “{q}”.</div>
      ) : (
        <>
          <div className={styles.progSub}>{filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(u => (
              <div key={u.id} className={styles.restoreBanner}>
                <span className={styles.restoreBannerText}>{u.email}</span>
                <span className={`${styles.chip} ${styles.chipSrt}`}>{u.role}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
