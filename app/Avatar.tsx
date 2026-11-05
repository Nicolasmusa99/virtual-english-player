'use client'
// La cara de una persona (2026-11): su foto (la de Google o la que subió) y, si no tiene o
// no carga, sus iniciales en un color fijo. Se usa en Usuarios / Alumnos, al asignar, en
// la barra del aula y en "Mi perfil".
import { useEffect, useState } from 'react'
import styles from './people.module.css'
import { avatarColor, initials } from '@/lib/peopleView'

export default function Avatar({ id, name, email, image, size = 40, className = '' }: {
  id: string
  name: string | null | undefined
  email?: string | null
  image?: string | null
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [image])
  const showImg = !!image && !broken
  return (
    <span className={`${styles.avatar} ${showImg ? styles.avatarImg : styles['c' + avatarColor(id)]} ${className}`} aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} data-testid="avatar">
      {showImg
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={image!} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : initials(name, email)}
    </span>
  )
}
