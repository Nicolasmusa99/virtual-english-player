// @vitest-environment jsdom
// Mi biblioteca (rediseño 2026-11-05): mismo diseño que la compartida (LibraryBrowser
// mode="mine"). El admin ve "Publicados" / "Privados", publica y despublica de a varios,
// y elimina con confirmación (sugiere despublicar si hay publicados).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import LibraryBrowser, { SHARED_TEXTS as S, type LibraryVideoRow } from '@/app/LibraryBrowser'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const v = (id: string, originalName: string, pub: boolean): LibraryVideoRow =>
  ({ id, originalName, status: 'ready', phraseCount: 12, sharedType: pub ? 'cancion' : null, sharedLevel: pub ? 'medium' : null, publishedAt: pub ? '2026-10-01' : null })
const VIDEOS = [v('v1', 'Car Fart', true), v('v2', 'hola don pepito', false), v('v3', 'Slade', false)]
let fetchMock: ReturnType<typeof vi.fn>
const calls = (method: string) => fetchMock.mock.calls.filter(([, i]) => (i?.method ?? 'GET') === method).map(([u, i]) => ({ url: String(u), body: i?.body ? JSON.parse(String(i.body)) : undefined }))
const nav = () => screen.getByRole('navigation', { name: S.folders })
const cards = () => screen.queryAllByTestId('shared-card').map((c) => c.querySelector('[title]')?.textContent)

beforeEach(() => {
  fetchMock = vi.fn((url: string) => Promise.resolve(url === '/api/folders' ? json(200, { folders: [{ id: 'f1', name: 'Videos públicos', videoIds: ['v1'] }] }) : json(200, { ok: true })))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const mount = async (extra: Partial<React.ComponentProps<typeof LibraryBrowser>> = {}) => {
  const props = { onChanged: vi.fn(), onDelete: vi.fn(), onUpload: vi.fn(), ...extra }
  render(<LibraryBrowser mode="mine" videos={VIDEOS} canManage onOpen={() => {}} {...props} />)
  await flush()
  return props
}

describe('Mi biblioteca', () => {
  it('a la izquierda: todos, publicados, privados, carpetas y sin carpeta; cada tarjeta dice si está publicada', async () => {
    await mount()
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      `${S.all}3`, `${S.pub}1`, `${S.priv}2`, 'Videos públicos1', `${S.loose}2`, `+ ${S.newFolder}`,
    ])
    expect(screen.getAllByTestId('shared-card')[0]).toHaveTextContent(S.published)
    expect(screen.getAllByTestId('shared-card')[1]).toHaveTextContent(S.private)
    fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${S.priv}`) }))
    expect(cards()).toEqual(['hola don pepito', 'Slade'])
  })

  it('"+ Subir video" arriba', async () => {
    const p = await mount()
    fireEvent.click(screen.getByRole('button', { name: S.upload }))
    expect(p.onUpload).toHaveBeenCalled()
  })

  it('publicar varios de una: elige tipo y nivel y publica solo los privados tildados', async () => {
    const p = await mount()
    fireEvent.click(screen.getByLabelText(S.selectAll))
    fireEvent.click(screen.getByRole('button', { name: S.publishMany(2) }))
    const dlg = screen.getByRole('dialog', { name: S.publishTitle(2) })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: S.publishDo })) })
    expect(within(dlg).getByRole('alert')).toHaveTextContent(S.publishNeed)
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Película' }))
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Beginner' }))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: S.publishDo })) })
    expect(calls('POST').map((c) => [c.url, c.body])).toEqual([
      ['/api/videos/v2/share', { sharedType: 'pelicula', sharedLevel: 'beginner' }],
      ['/api/videos/v3/share', { sharedType: 'pelicula', sharedLevel: 'beginner' }],
    ])
    expect(p.onChanged).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(S.publishedOk(2))
  })

  it('despublicar desde el menú de la tarjeta', async () => {
    const p = await mount()
    fireEvent.click(screen.getByRole('button', { name: S.more('Car Fart') }))
    await act(async () => { fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: S.unpublish })) })
    expect(calls('DELETE')).toEqual([{ url: '/api/videos/v1/share', body: undefined }])
    expect(p.onChanged).toHaveBeenCalled()
  })

  it('eliminar pide confirmación; si hay publicados ofrece despublicar en vez', async () => {
    const p = await mount()
    fireEvent.click(screen.getByLabelText(S.select('Car Fart')))
    fireEvent.click(screen.getByLabelText(S.select('Slade')))
    fireEvent.click(screen.getByRole('button', { name: S.deleteMany(2) }))
    const dlg = screen.getByRole('dialog', { name: S.deleteTitle(2) })
    expect(dlg).toHaveTextContent('1 de ellos está publicado')
    expect(within(dlg).getByRole('button', { name: S.unpublishInstead })).toBeInTheDocument()
    expect(p.onDelete).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: S.deleteDo })) })
    expect(vi.mocked(p.onDelete!).mock.calls.map((c) => c[0])).toEqual(['v1', 'v3'])
  })

  it('un profe ve sus videos sin carpetas ni publicar, y puede eliminarlos', async () => {
    const onDelete = vi.fn()
    render(<LibraryBrowser mode="mine" videos={VIDEOS} onOpen={() => {}} onDelete={onDelete} />)
    await flush()
    expect(screen.queryByRole('navigation', { name: S.folders })).toBeNull()
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/folders')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: S.more('Slade') }))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: S.publish })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: S.delete }))
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: S.deleteDo })) })
    expect(onDelete).toHaveBeenCalledWith('v3')
  })
})
