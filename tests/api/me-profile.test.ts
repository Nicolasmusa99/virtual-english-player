// @vitest-environment node
// "Mi perfil" (2026-11): /api/me, /api/me/password y /api/me/photo. Siempre sobre la
// sesión; la base se mockea (@/lib/users) y Vercel Blob también.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/password'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getProfile: vi.fn(), setUserName: vi.fn(), getPasswordHash: vi.fn(), setPassword: vi.fn(),
  setCustomImage: vi.fn(), handleUpload: vi.fn(), del: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({
  getProfile: m.getProfile, setUserName: m.setUserName, getPasswordHash: m.getPasswordHash, setPassword: m.setPassword, setCustomImage: m.setCustomImage,
}))
vi.mock('@vercel/blob/client', () => ({ handleUpload: m.handleUpload }))
vi.mock('@vercel/blob', () => ({ del: m.del }))

import { GET as getMe, PATCH as patchMe } from '@/app/api/me/route'
import { PUT as putPassword } from '@/app/api/me/password/route'
import { POST as photoToken, PUT as putPhoto, DELETE as delPhoto } from '@/app/api/me/photo/route'

const ME = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'
const blob = (p: string) => `https://abc123.public.blob.vercel-storage.com/${p}`
const req = (method: string, body?: unknown, cookie?: string) => new NextRequest('https://ve.app/api/me', {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
})
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.auth.mockResolvedValue({ user: { id: ME, role: 'alumno' } })
})

describe('/api/me', () => {
  it('sin sesión → 401', async () => {
    m.auth.mockResolvedValue(null)
    expect((await getMe()).status).toBe(401)
    expect((await patchMe(req('PATCH', { name: 'Ana Gómez' }))).status).toBe(401)
  })
  it('GET devuelve SU perfil, sin la foto de Google cruda', async () => {
    m.getProfile.mockResolvedValue({ id: ME, name: 'Ana', email: null, role: 'alumno', image: 'i', imageCustom: false, googleImage: 'g', hasPassword: true, hasGoogle: false })
    const res = await getMe()
    const { profile } = await res.json()
    expect(m.getProfile).toHaveBeenCalledWith(ME)
    expect(profile).toMatchObject({ id: ME, hasPassword: true, hasGoogleImage: true })
    expect(profile).not.toHaveProperty('googleImage')
    expect(JSON.stringify(profile)).not.toMatch(/hash/i)
  })
  it('PATCH cambia SU nombre (valida)', async () => {
    expect((await patchMe(req('PATCH', { name: 'x' }))).status).toBe(400)
    const res = await patchMe(req('PATCH', { name: '  Ana   Gómez ', id: OTHER }))
    expect(res.status).toBe(200)
    expect(m.setUserName).toHaveBeenCalledWith(ME, 'Ana Gómez')
  })
})

describe('/api/me/password', () => {
  it('pide la actual, valida la nueva y deja abierta ESTA sesión', async () => {
    m.getPasswordHash.mockResolvedValue(await hashPassword('vieja-clave-1'))
    expect((await putPassword(req('PUT', { current: 'otra', next: 'nueva-clave-1' }))).status).toBe(400)
    expect((await putPassword(req('PUT', { current: 'vieja-clave-1', next: 'corta' }))).status).toBe(400)
    const res = await putPassword(req('PUT', { current: 'vieja-clave-1', next: 'nueva-clave-1' }, '__Secure-authjs.session-token=mi-tok'))
    expect(res.status).toBe(200)
    expect(m.setPassword).toHaveBeenCalledWith(ME, expect.stringMatching(/^scrypt\$/), 'mi-tok')
  })
  it('una cuenta de Google no tiene contraseña para cambiar', async () => {
    m.getPasswordHash.mockResolvedValue(null)
    const res = await putPassword(req('PUT', { current: 'x', next: 'nueva-clave-1' }))
    expect(res.status).toBe(400)
    expect(m.setPassword).not.toHaveBeenCalled()
  })
})

describe('/api/me/photo', () => {
  it('PUT solo acepta una foto de nuestro Blob en SU carpeta; borra la subida anterior', async () => {
    expect((await putPhoto(req('PUT', { url: blob(`avatars/${OTHER}/f.jpg`) }))).status).toBe(400)
    expect((await putPhoto(req('PUT', { url: 'https://evil.com/f.jpg' }))).status).toBe(400)
    expect(m.setCustomImage).not.toHaveBeenCalled()
    const old = blob(`avatars/${ME}/vieja.jpg`)
    const nueva = blob(`avatars/${ME}/nueva-Ab1.jpg`)
    m.setCustomImage.mockResolvedValue({ previous: old, image: nueva })
    const res = await putPhoto(req('PUT', { url: nueva }))
    expect(res.status).toBe(200)
    expect(m.setCustomImage).toHaveBeenCalledWith(ME, nueva)
    expect(m.del).toHaveBeenCalledWith(old)
  })
  it('DELETE vuelve a la de Google y borra la subida', async () => {
    const old = blob(`avatars/${ME}/vieja.jpg`)
    m.setCustomImage.mockResolvedValue({ previous: old, image: 'https://lh3.googleusercontent.com/a/x' })
    const res = await delPhoto()
    expect(await res.json()).toEqual({ image: 'https://lh3.googleusercontent.com/a/x' })
    expect(m.setCustomImage).toHaveBeenCalledWith(ME, null)
    expect(m.del).toHaveBeenCalledWith(old)
  })
  it('POST: el token solo sale para avatars/<su id>/, imágenes y hasta 2 MB', async () => {
    let check: ((p: string) => Promise<unknown>) | null = null
    m.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => { check = onBeforeGenerateToken; return { ok: true } })
    const res = await photoToken(req('POST', { type: 'blob.generate-client-token' }))
    expect(res.status).toBe(200)
    await expect(check!(`avatars/${OTHER}/f.jpg`)).rejects.toThrow()
    await expect(check!(`videos/${ME}/f.jpg`)).rejects.toThrow()
    expect(await check!(`avatars/${ME}/foto.jpg`)).toMatchObject({ allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 2 * 1024 * 1024 })
  })
})
