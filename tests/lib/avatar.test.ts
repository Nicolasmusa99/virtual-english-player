// Fotos de perfil (2026-11): lib/avatar.ts.
import { describe, it, expect } from 'vitest'
import { afterGoogleSignIn, googlePicture, isOwnAvatarPath, isOwnAvatarUrl } from '@/lib/avatar'

const ME = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'
const blob = (path: string) => `https://abc123.public.blob.vercel-storage.com/${path}`

describe('avatar', () => {
  it('isOwnAvatarUrl: solo nuestro Blob, en SU carpeta, una imagen', () => {
    expect(isOwnAvatarUrl(blob(`avatars/${ME}/foto-Xy12.jpg`), ME)).toBe(true)
    expect(isOwnAvatarUrl(blob(`avatars/${OTHER}/foto.jpg`), ME)).toBe(false)
    expect(isOwnAvatarUrl(blob(`videos/${ME}/foto.jpg`), ME)).toBe(false)
    expect(isOwnAvatarUrl(blob(`avatars/${ME}/foto.svg`), ME)).toBe(false)
    expect(isOwnAvatarUrl(blob(`avatars/${ME}/foto.jpg?x=1`), ME)).toBe(false)
    expect(isOwnAvatarUrl(`http://abc.public.blob.vercel-storage.com/avatars/${ME}/f.jpg`, ME)).toBe(false)
    expect(isOwnAvatarUrl(`https://evil.com/avatars/${ME}/f.jpg`, ME)).toBe(false)
    expect(isOwnAvatarUrl(`https://abc.public.blob.vercel-storage.com.evil.com/avatars/${ME}/f.jpg`, ME)).toBe(false)
    expect(isOwnAvatarUrl(42, ME)).toBe(false)
  })
  it('isOwnAvatarPath: avatars/<id>/nombre.ext, sin subir de carpeta', () => {
    expect(isOwnAvatarPath(`avatars/${ME}/foto.jpg`, ME)).toBe(true)
    expect(isOwnAvatarPath(`avatars/${OTHER}/foto.jpg`, ME)).toBe(false)
    expect(isOwnAvatarPath(`avatars/${ME}/../x/foto.jpg`, ME)).toBe(false)
    expect(isOwnAvatarPath(`avatars/${ME}/foto.html`, ME)).toBe(false)
  })
  it('googlePicture: solo https de googleusercontent.com', () => {
    expect(googlePicture('https://lh3.googleusercontent.com/a/abc=s96-c')).toBe('https://lh3.googleusercontent.com/a/abc=s96-c')
    expect(googlePicture('http://lh3.googleusercontent.com/a/abc')).toBeNull()
    expect(googlePicture('https://evil.com/a.png')).toBeNull()
    expect(googlePicture(undefined)).toBeNull()
  })
  it('afterGoogleSignIn: la subida se respeta; si no, va la de Google', () => {
    expect(afterGoogleSignIn({ image: 'mine', imageCustom: true }, 'g')).toEqual({ googleImage: 'g', image: 'mine' })
    expect(afterGoogleSignIn({ image: null, imageCustom: false }, 'g')).toEqual({ googleImage: 'g', image: 'g' })
    expect(afterGoogleSignIn({ image: 'old', imageCustom: false }, null)).toEqual({ googleImage: null, image: 'old' })
  })
})
