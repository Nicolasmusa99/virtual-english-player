// @vitest-environment jsdom
// Biblioteca compartida (rediseño 2026-11-04): carpetas a la izquierda; el admin tilda
// varios videos y los agrega o saca de una carpeta; el profe solo navega.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import SharedLibrary, { SHARED_TEXTS as S } from '@/app/SharedLibrary'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const vid = (id: string, originalName: string, sharedType: string | null = null) =>
  ({ id, originalName, durationSec: null, sharedType, sharedLevel: null, publishedAt: '2026-10-01', ownerName: null, phraseCount: 10 })
let fetchMock: ReturnType<typeof vi.fn>
let folders: { id: string; name: string; videoIds: string[] }[]
const calls = (method: string, url?: string) => fetchMock.mock.calls
  .filter(([u, i]) => (i?.method ?? 'GET') === method && (!url || String(u) === url))
  .map(([u, i]) => ({ url: String(u), body: i?.body ? JSON.parse(String(i.body)) : undefined }))
const nav = () => screen.getByRole('navigation', { name: S.folders })
const cards = () => screen.queryAllByTestId('shared-card').map((c) => c.querySelector('[title]')?.textContent)
const menuItem = (name: string) => [...within(screen.getByRole('menu')).queryAllByRole('menuitem')].find((b) => b.textContent === name)!

beforeEach(() => {
  folders = [{ id: 'f1', name: 'Canciones', videoIds: ['v2', 'privado'] }, { id: 'f2', name: 'Series', videoIds: [] }]
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (url === '/api/shared-videos') return Promise.resolve(json(200, { videos: [vid('v1', 'Friends', 'pelicula'), vid('v2', 'Let It Be', 'cancion'), vid('v3', 'Shrek', 'pelicula')] }))
    if (url === '/api/folders' && m === 'GET') return Promise.resolve(json(200, { folders }))
    if (url === '/api/folders' && m === 'POST') { folders = [...folders, { id: 'f3', name: 'Nueva', videoIds: [] }]; return Promise.resolve(json(201, {})) }
    return Promise.resolve(json(200, { ok: true }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('SharedLibrary', () => {
  it('carpetas a la izquierda con lo publicado; cada una muestra lo suyo', async () => {
    render(<SharedLibrary onOpen={() => {}} canManage />)
    await flush()
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      `${S.all}3`, 'Canciones1', 'Series0', `${S.loose}2`, `+ ${S.newFolder}`,
    ])
    fireEvent.click(within(nav()).getByRole('button', { name: /^Canciones/ }))
    expect(cards()).toEqual(['Let It Be'])
    fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${S.loose}`) }))
    expect(cards()).toEqual(['Friends', 'Shrek'])
  })

  it('el admin tilda varios y los agrega a una carpeta de una vez (con Deshacer)', async () => {
    render(<SharedLibrary onOpen={() => {}} canManage />)
    await flush()
    fireEvent.click(screen.getByLabelText(S.select('Friends')))
    fireEvent.click(screen.getByLabelText(S.select('Shrek')))
    expect(screen.getByText(S.selected(2))).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S.addTo })) })
    await act(async () => { fireEvent.click(menuItem('Series')) })
    expect(calls('POST', '/api/folders/f2/videos').map((c) => c.body)).toEqual([{ videoId: 'v1' }, { videoId: 'v3' }])
    expect(screen.getByRole('status')).toHaveTextContent(S.added(2, 'Series'))
    expect(within(nav()).getByRole('button', { name: /^Series/ })).toHaveTextContent('Series2')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S.undo })) })
    expect(calls('DELETE', '/api/folders/f2/videos')).toHaveLength(2)
  })

  it('"Seleccionar todos" y sacar de la carpeta', async () => {
    folders[0].videoIds = ['v1', 'v2']
    render(<SharedLibrary onOpen={() => {}} canManage />)
    await flush()
    fireEvent.click(within(nav()).getByRole('button', { name: /^Canciones/ }))
    fireEvent.click(screen.getByLabelText(S.selectAll))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S.takeOut(2) })) })
    expect(calls('DELETE', '/api/folders/f1/videos').map((c) => c.body)).toEqual([{ videoId: 'v1' }, { videoId: 'v2' }])
    expect(cards()).toEqual([])
  })

  it('agregar a una carpeta nueva desde la selección', async () => {
    render(<SharedLibrary onOpen={() => {}} canManage />)
    await flush()
    fireEvent.click(screen.getByLabelText(S.select('Shrek')))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S.addTo })) })
    await act(async () => { fireEvent.click(menuItem(S.addToNew)) })
    fireEvent.change(screen.getByLabelText(S.folderName), { target: { value: 'Películas' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: S.create })) })
    await flush()
    expect(calls('POST', '/api/folders')[0].body).toEqual({ name: 'Películas' })
    expect(calls('POST', '/api/folders/f3/videos')[0].body).toEqual({ videoId: 'v3' })
  })

  it('buscar y filtrar por tipo', async () => {
    render(<SharedLibrary onOpen={() => {}} canManage />)
    await flush()
    fireEvent.change(screen.getByLabelText(S.search), { target: { value: 'shr' } })
    expect(cards()).toEqual(['Shrek'])
    fireEvent.change(screen.getByLabelText(S.search), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canción' }))
    expect(cards()).toEqual(['Let It Be'])
  })

  it('el profe navega las carpetas pero no puede tocarlas ni tildar', async () => {
    const onOpen = vi.fn()
    render(<SharedLibrary onOpen={onOpen} assignable />)
    await flush()
    expect(within(nav()).queryByRole('button', { name: new RegExp(S.newFolder) })).toBeNull()
    expect(screen.queryByLabelText(S.selectAll)).toBeNull()
    expect(screen.queryByLabelText(S.select('Friends'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `${S.open} Friends` }))
    expect(onOpen).toHaveBeenCalledWith('v1')
    expect(screen.getByText(S.readOnly)).toBeInTheDocument()
  })
})
