// @vitest-environment jsdom
// "Mi perfil" (ProfilePanel) y entrar con usuario y contraseña (PasswordLogin), 2026-11.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ upload: uploadMock }))

import ProfilePanel, { PROFILE_TEXTS as P } from '@/app/ProfilePanel'
import PasswordLogin, { LOGIN_TEXTS as L } from '@/app/PasswordLogin'

const ME = '11111111-2222-4333-8444-555555555555'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
let fetchMock: ReturnType<typeof vi.fn>
let profile: Record<string, unknown>
const calls = (method: string, url: string) => fetchMock.mock.calls.filter(([u, i]) => String(u) === url && (i?.method ?? 'GET') === method)

beforeEach(() => {
  profile = { id: ME, name: 'Martina Pérez', email: 'martina@x.com', role: 'alumno', image: 'https://lh3.googleusercontent.com/a/m', imageCustom: false, hasGoogleImage: true, hasPassword: false, hasGoogle: true }
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (url === '/api/me' && m === 'GET') return Promise.resolve(json(200, { profile }))
    if (url === '/api/me' && m === 'PATCH') return Promise.resolve(json(200, JSON.parse(String(init!.body))))
    if (url === '/api/me/photo' && m === 'PUT') return Promise.resolve(json(200, { image: JSON.parse(String(init!.body)).url }))
    if (url === '/api/me/photo' && m === 'DELETE') return Promise.resolve(json(200, { image: 'https://lh3.googleusercontent.com/a/m' }))
    if (url === '/api/me/password') return Promise.resolve(json(200, { ok: true }))
    if (url === '/api/login') return Promise.resolve(json(401, { error: 'Mail o contraseña incorrectos.' }))
    return Promise.resolve(json(404, {}))
  })
  vi.stubGlobal('fetch', fetchMock)
  uploadMock.mockReset()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('ProfilePanel', () => {
  it('muestra la foto de Google, los datos y cómo entra; sin contraseña no ofrece cambiarla', async () => {
    render(<ProfilePanel />)
    await flush()
    expect(screen.getByTestId('avatar').querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/m')
    expect(screen.getByText(P.photoFromGoogle)).toBeInTheDocument()
    expect(screen.getByLabelText(P.name)).toHaveValue('Martina Pérez')
    expect(screen.getByText('martina@x.com', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(P.withGoogle)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: P.password })).toBeNull()
    expect(screen.queryByRole('button', { name: P.useGoogle })).toBeNull() // la foto ya es la de Google
  })

  it('cambiar el nombre', async () => {
    const onChanged = vi.fn()
    render(<ProfilePanel onChanged={onChanged} />)
    await flush()
    const save = screen.getByRole('button', { name: P.save })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText(P.name), { target: { value: 'Martina  Pérez Ruiz' } })
    await act(async () => { fireEvent.click(save) })
    expect(JSON.parse(String(calls('PATCH', '/api/me')[0][1].body))).toEqual({ name: 'Martina Pérez Ruiz' })
    expect(screen.getByRole('status')).toHaveTextContent(P.saved)
    expect(onChanged).toHaveBeenCalled()
  })

  it('subir una foto: se sube a SU carpeta y queda como la suya; después se puede volver a la de Google', async () => {
    // jsdom no dibuja: la imagen "carga" y el canvas devuelve un blob chico.
    const OrigImage = globalThis.Image
    class FakeImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { setTimeout(() => this.onload?.(), 0) } }
    vi.stubGlobal('Image', FakeImage)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['x'], { type: 'image/jpeg' })) })
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    const url = `https://abc.public.blob.vercel-storage.com/avatars/${ME}/foto-Ab1.jpg`
    uploadMock.mockResolvedValue({ url })
    const onChanged = vi.fn()
    render(<ProfilePanel onChanged={onChanged} />)
    await flush()
    const input = screen.getByLabelText(P.upload) as HTMLInputElement
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['img'], 'yo.png', { type: 'image/png' })] } }); await new Promise((r) => setTimeout(r, 20)) })
    expect(uploadMock).toHaveBeenCalledWith(`avatars/${ME}/foto.jpg`, expect.any(Blob), expect.objectContaining({ handleUploadUrl: '/api/me/photo', access: 'public' }))
    expect(JSON.parse(String(calls('PUT', '/api/me/photo')[0][1].body))).toEqual({ url })
    expect(screen.getByTestId('avatar').querySelector('img')).toHaveAttribute('src', url)
    expect(onChanged).toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: P.useGoogle })) })
    expect(calls('DELETE', '/api/me/photo')).toHaveLength(1)
    expect(screen.getByTestId('avatar').querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/m')
    vi.stubGlobal('Image', OrigImage)
  })

  it('un archivo que no es imagen avisa y no sube nada', async () => {
    render(<ProfilePanel />)
    await flush()
    await act(async () => { fireEvent.change(screen.getByLabelText(P.upload), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } }) })
    expect(screen.getByRole('alert')).toHaveTextContent(P.notImage)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('con contraseña: cambiarla pide la actual y que coincidan las nuevas', async () => {
    profile = { ...profile, hasPassword: true, hasGoogle: false, image: null, hasGoogleImage: false }
    render(<ProfilePanel />)
    await flush()
    expect(screen.getByText(P.withPassword)).toBeInTheDocument()
    const box = screen.getByRole('region', { name: P.password })
    fireEvent.change(within(box).getByLabelText(P.current), { target: { value: 'vieja-clave-1' } })
    fireEvent.change(within(box).getByLabelText(P.next), { target: { value: 'nueva-clave-1' } })
    fireEvent.change(within(box).getByLabelText(P.repeat), { target: { value: 'nueva-clave-2' } })
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: P.changePassword })) })
    expect(within(box).getByRole('alert')).toHaveTextContent(P.mismatch)
    fireEvent.change(within(box).getByLabelText(P.repeat), { target: { value: 'nueva-clave-1' } })
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: P.changePassword })) })
    expect(JSON.parse(String(calls('PUT', '/api/me/password')[0][1].body))).toEqual({ current: 'vieja-clave-1', next: 'nueva-clave-1' })
    expect(within(box).getByRole('status')).toHaveTextContent(P.passwordSaved)
  })
})

describe('PasswordLogin', () => {
  it('arranca cerrado; abre el formulario, manda usuario y contraseña y muestra el error', async () => {
    render(<PasswordLogin onSignedIn={() => {}} />)
    expect(screen.queryByLabelText(L.email)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: L.open }))
    fireEvent.change(screen.getByLabelText(L.email), { target: { value: ' martina@x.com ' } })
    fireEvent.change(screen.getByLabelText(L.password), { target: { value: 'clave-mala' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: L.submit })) })
    expect(JSON.parse(String(calls('POST', '/api/login')[0][1].body))).toEqual({ email: 'martina@x.com', password: 'clave-mala' })
    expect(screen.getByRole('alert')).toHaveTextContent('Mail o contraseña incorrectos.')
  })

  it('si entra bien, avisa (la página se recarga)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { ok: true })))
    const onSignedIn = vi.fn()
    render(<PasswordLogin onSignedIn={onSignedIn} />)
    fireEvent.click(screen.getByRole('button', { name: L.open }))
    fireEvent.change(screen.getByLabelText(L.email), { target: { value: 'martina@x.com' } })
    fireEvent.change(screen.getByLabelText(L.password), { target: { value: 'clave-buena-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: L.submit })) })
    expect(onSignedIn).toHaveBeenCalled()
  })

  it('vacío: avisa sin llamar al servidor', async () => {
    render(<PasswordLogin onSignedIn={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: L.open }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: L.submit })) })
    expect(screen.getByRole('alert')).toHaveTextContent(L.empty)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
