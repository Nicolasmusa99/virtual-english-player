// @vitest-environment jsdom
// Carpetas (rediseño 2026-11) en pantalla: el material de un alumno (StudentView, lado
// profe/admin: carpetas a la izquierda, selección múltiple, arrastrar, asignar en ventana),
// lo que ve el alumno (StudentApp) y las carpetas de la biblioteca del admin.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import StudentView, { MATERIAL_TEXTS as M } from '@/app/StudentView'
import StudentApp, { STUDENT_TEXTS } from '@/app/StudentApp'
import LibraryFolders, { LIB_FOLDER_TEXTS as L } from '@/app/LibraryFolders'

const ST = 'st-1'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
let fetchMock: ReturnType<typeof vi.fn>
const calls = (method: string, url?: string) => fetchMock.mock.calls
  .filter(([u, i]) => (i?.method ?? 'GET') === method && (!url || String(u) === url))
  .map(([u, i]) => ({ url: String(u), body: i?.body ? JSON.parse(String(i.body)) : undefined }))
afterEach(() => vi.unstubAllGlobals())

const nav = () => screen.getByRole('navigation', { name: M.folders })
const navBtn = (name: RegExp) => within(nav()).getByRole('button', { name })
const rows = () => screen.queryAllByTestId('material-row')
const openMenu = async (label: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: label })) }) }
const menuItem = (name: string) => {
  const m = screen.getByRole('menu')
  const item = [...within(m).queryAllByRole('menuitem'), ...within(m).queryAllByRole('menuitemradio')]
    .find((b) => b.textContent?.replace('✓', '').trim() === name)
  if (!item) throw new Error(`no hay "${name}" en el menú`)
  return item
}
const pickMenu = async (name: string) => { await act(async () => { fireEvent.click(menuItem(name)) }) }

describe('StudentView — el material de un alumno en carpetas', () => {
  let folders: { id: string; name: string }[]
  let assignments: { videoId: string; originalName: string; sharedType: null; sharedLevel: null; active: boolean; folderId: string | null }[]
  beforeEach(() => {
    folders = [{ id: 'f1', name: 'Unidad 1' }, { id: 'f2', name: 'Canciones' }]
    assignments = [
      { videoId: 'v1', originalName: 'Comercial del auto', sharedType: null, sharedLevel: null, active: true, folderId: 'f1' },
      { videoId: 'v2', originalName: 'Let It Be', sharedType: null, sharedLevel: null, active: true, folderId: null },
    ]
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'
      if (m === 'POST' && url === '/api/folders') { folders = [...folders, { id: 'f3', name: 'Unidad 2' }]; return Promise.resolve(json(201, { ok: true })) }
      if (m !== 'GET') return Promise.resolve(json(200, { ok: true }))
      if (url.startsWith('/api/assignments')) return Promise.resolve(json(200, { assignments }))
      if (url.startsWith('/api/folders')) return Promise.resolve(json(200, { folders }))
      if (url === '/api/shared-videos') return Promise.resolve(json(200, { videos: [
        { id: 'v1', originalName: 'Comercial del auto', sharedType: null, sharedLevel: null },
        { id: 'v3', originalName: 'Frozen', sharedType: 'pelicula', sharedLevel: 'beginner' },
        { id: 'v4', originalName: 'Yesterday', sharedType: 'cancion', sharedLevel: 'medium' },
      ] }))
      return Promise.resolve(json(200, { classes: [], series: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  const mount = async () => { render(<StudentView studentId={ST} onOpenVideo={() => {}} />); await flush() }

  it('las carpetas a la izquierda con su cantidad; "Todo el material" muestra todo y dónde está cada uno', async () => {
    await mount()
    const items = within(nav()).getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(['Todo el material2', 'Unidad 11', 'Canciones0', 'Sin carpeta1', `+ ${M.newFolder}`])
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Comercial del autoUnidad 1'), expect.stringContaining('Let It BeSin carpeta'),
    ])
  })

  it('elegir una carpeta muestra solo lo suyo; vacía invita a asignar', async () => {
    await mount()
    fireEvent.click(navBtn(/^Unidad 1/))
    expect(rows()).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Unidad 11 video')
    fireEvent.click(navBtn(/^Canciones/))
    expect(rows()).toHaveLength(0)
    expect(screen.getByText(M.emptyFolder)).toBeInTheDocument()
  })

  it('crear una carpeta la abre', async () => {
    await mount()
    fireEvent.click(navBtn(new RegExp(M.newFolder)))
    fireEvent.change(screen.getByLabelText(M.folderName), { target: { value: ' Unidad 2 ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: M.create })) })
    await flush()
    expect(calls('POST', '/api/folders')[0].body).toEqual({ name: 'Unidad 2', studentId: ST })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Unidad 2')
  })

  it('mover un video desde su menú "⋯" (a otra carpeta o a "Sin carpeta")', async () => {
    await mount()
    await openMenu(M.more('Let It Be'))
    await pickMenu('Canciones')
    expect(calls('PATCH', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v2', folderId: 'f2' })
    expect(screen.getByRole('status')).toHaveTextContent(M.moved(1, 'Canciones'))
    await openMenu(M.more('Comercial del auto'))
    await pickMenu('Sin carpeta')
    expect(calls('PATCH', '/api/assignments')[1].body).toEqual({ studentId: ST, videoId: 'v1', folderId: null })
  })

  it('tildar varios y moverlos juntos', async () => {
    await mount()
    fireEvent.click(screen.getByLabelText(M.selectAll))
    expect(screen.getByText(M.selected(2))).toBeInTheDocument()
    await openMenu(M.moveMany)
    await pickMenu('Canciones')
    expect(calls('PATCH', '/api/assignments').map((c) => c.body)).toEqual([
      { studentId: ST, videoId: 'v1', folderId: 'f2' }, { studentId: ST, videoId: 'v2', folderId: 'f2' },
    ])
    expect(within(nav()).getByRole('button', { name: /^Canciones/ })).toHaveTextContent('Canciones2')
  })

  it('arrastrar un video a una carpeta lo mueve ahí', async () => {
    await mount()
    const store: Record<string, string> = {}
    const dataTransfer = { setData: (k: string, v: string) => { store[k] = v }, getData: (k: string) => store[k], get types() { return Object.keys(store) }, effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(rows()[1], { dataTransfer })
    const target = navBtn(/^Unidad 1/)
    fireEvent.dragOver(target, { dataTransfer })
    await act(async () => { fireEvent.drop(target, { dataTransfer }) })
    expect(calls('PATCH', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v2', folderId: 'f1' })
  })

  it('quitar un video avisa y se puede deshacer (vuelve a su carpeta)', async () => {
    await mount()
    await openMenu(M.more('Comercial del auto'))
    await pickMenu(M.removeOne)
    expect(calls('DELETE', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v1' })
    expect(rows()).toHaveLength(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: M.undo })) })
    expect(calls('POST', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v1', folderId: 'f1' })
  })

  it('quitar varios pide confirmación', async () => {
    await mount()
    fireEvent.click(screen.getByLabelText(M.selectAll))
    fireEvent.click(screen.getByRole('button', { name: M.removeMany(2) }))
    const dlg = screen.getByRole('dialog', { name: M.removeManyTitle(2) })
    expect(calls('DELETE', '/api/assignments')).toHaveLength(0)
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: M.removeMany(2) })) })
    expect(calls('DELETE', '/api/assignments')).toHaveLength(2)
  })

  it('renombrar, subir/bajar y eliminar (con confirmación) una carpeta desde su menú', async () => {
    await mount()
    fireEvent.click(navBtn(/^Unidad 1/))
    await openMenu(M.folderMore('Unidad 1'))
    expect(menuItem(M.up)).toBeDisabled()
    await pickMenu(M.down)
    expect(calls('PATCH', '/api/folders/f1')[0].body).toEqual({ move: 'down' })
    await openMenu(M.folderMore('Unidad 1'))
    await pickMenu(M.rename)
    const input = screen.getByLabelText(M.folderName)
    fireEvent.change(input, { target: { value: 'Unidad uno' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(calls('PATCH', '/api/folders/f1')[1].body).toEqual({ name: 'Unidad uno' })
    await openMenu(M.folderMore('Unidad uno'))
    await pickMenu(M.removeFolder)
    const dlg = screen.getByRole('dialog', { name: M.removeFolderTitle('Unidad uno') })
    expect(dlg).toHaveTextContent('no se le sacan al alumno')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: M.removeFolder })) })
    expect(calls('DELETE', '/api/folders/f1')).toHaveLength(1)
  })

  it('asignar material: en la carpeta que se está mirando, varios de una', async () => {
    await mount()
    fireEvent.click(navBtn(/^Canciones/))
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: `+ ${M.assign}` })[0]) })
    await flush()
    const dlg = screen.getByRole('dialog', { name: M.pickerTitle })
    // lo que ya tiene se ve tildado y no se puede elegir
    expect(within(dlg).getByText(M.pickerAlready)).toBeInTheDocument()
    expect(within(dlg).getByLabelText(M.pickerIn)).toHaveValue('f2')
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Frozen/ }))
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Yesterday/ }))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: M.pickerConfirm(2) })) })
    await flush()
    expect(calls('POST', '/api/assignments').map((c) => c.body)).toEqual([
      { studentId: ST, videoId: 'v3', folderId: 'f2' }, { studentId: ST, videoId: 'v4', folderId: 'f2' },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(M.assigned(2, 'Canciones'))
  })

  it('el selector busca y filtra por tipo', async () => {
    await mount()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: `+ ${M.assign}` })[0]) })
    await flush()
    const dlg = screen.getByRole('dialog')
    fireEvent.change(within(dlg).getByLabelText('Buscar material'), { target: { value: 'yest' } })
    expect(within(dlg).getAllByRole('checkbox')).toHaveLength(1)
    fireEvent.change(within(dlg).getByLabelText('Buscar material'), { target: { value: '' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Película' }))
    expect(within(dlg).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual([expect.stringContaining('Frozen')])
  })

  it('la pestaña "Clases" muestra las clases', async () => {
    render(<StudentView studentId={ST} initialTab="classes" onOpenVideo={() => {}} />)
    await flush()
    expect(screen.getByRole('tab', { name: M.tabClasses })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('navigation', { name: M.folders })).toBeNull()
  })
})

describe('StudentApp — el alumno ve su material por carpetas', () => {
  const today = new Date().toISOString()
  const mat = (videoId: string, originalName: string, folderId: string | null) =>
    ({ videoId, originalName, sharedType: null, sharedLevel: null, durationSec: null, assignedAt: today, folderId })
  const mountWith = async (material: unknown[], folders: unknown[]) => {
    fetchMock = vi.fn((url: string) => Promise.resolve(url === '/api/student/material'
      ? json(200, { material, folders })
      : json(200, { classes: [], teacherName: null })))
    vi.stubGlobal('fetch', fetchMock)
    render(<StudentApp name="Martina" email={null} />)
    await flush()
  }

  it('un grupo por carpeta (sin las vacías) y "Otros videos" al final', async () => {
    await mountWith(
      [mat('v1', 'Comercial', 'f1'), mat('v2', 'Let It Be', null), mat('v3', 'Frozen', 'f2')],
      [{ id: 'f2', name: 'Canciones' }, { id: 'f1', name: 'Unidad 1' }, { id: 'f9', name: 'Vacía' }],
    )
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Canciones1 video', 'Unidad 11 video', `${STUDENT_TEXTS.otherVideos}1 video`])
  })

  it('sin carpetas, como siempre (sin títulos de grupo)', async () => {
    await mountWith([mat('v1', 'Comercial', null)], [])
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(screen.getByRole('button', { name: /Comercial/ })).toBeInTheDocument()
  })
})

describe('LibraryFolders — las carpetas de la biblioteca (admin)', () => {
  const VIDEOS = [
    { id: 'v1', originalName: 'Comercial', status: 'ready', phraseCount: 6, sharedType: null, sharedLevel: null, publishedAt: '2026-10-01' },
    { id: 'v2', originalName: 'Ensayo', status: 'ready', phraseCount: 3, sharedType: null, sharedLevel: null, publishedAt: null },
    { id: 'v3', originalName: 'Frozen', status: 'ready', phraseCount: 9, sharedType: null, sharedLevel: null, publishedAt: '2026-10-01' },
  ]
  let libFolders: { id: string; name: string; videoIds: string[] }[]
  beforeEach(() => {
    libFolders = [{ id: 'lf1', name: 'Canciones', videoIds: ['v1'] }]
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'
      if (m === 'POST' && url === '/api/folders') { libFolders = [...libFolders, { id: 'lf2', name: 'Películas', videoIds: [] }] }
      return Promise.resolve(m === 'GET' ? json(200, { folders: libFolders }) : json(200, { ok: true }))
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('muestra sus videos, agrega varios de una, saca uno y crea carpetas', async () => {
    render(<LibraryFolders videos={VIDEOS} onOpen={() => {}} />)
    await flush()
    const box = screen.getByTestId('folder')
    expect(box).toHaveTextContent('Comercial')
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: `+ ${L.addVideos}` })) })
    const dlg = screen.getByRole('dialog', { name: L.addTitle('Canciones') })
    expect(within(dlg).getByText(L.unpublished)).toBeInTheDocument() // Ensayo es privado
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Ensayo/ }))
    fireEvent.click(within(dlg).getByRole('checkbox', { name: /Frozen/ }))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: L.addConfirm(2) })) })
    expect(calls('POST', '/api/folders/lf1/videos').map((c) => c.body)).toEqual([{ videoId: 'v2' }, { videoId: 'v3' }])
    expect(screen.getByTestId('folder')).toHaveTextContent('3 videos')

    await openMenu(L.more('Comercial'))
    await pickMenu(L.takeOut)
    expect(calls('DELETE', '/api/folders/lf1/videos')[0].body).toEqual({ videoId: 'v1' })

    fireEvent.click(screen.getByRole('button', { name: `+ ${L.newFolder}` }))
    fireEvent.change(screen.getByLabelText(L.folderName), { target: { value: 'Películas' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: L.create })) })
    await flush()
    expect(calls('POST', '/api/folders')[0].body).toEqual({ name: 'Películas' })
    expect(screen.getByTestId('folder')).toHaveAttribute('aria-label', 'Películas')
  })

  it('sin carpetas invita a crear la primera', async () => {
    libFolders = []
    render(<LibraryFolders videos={VIDEOS} onOpen={() => {}} />)
    await flush()
    expect(screen.getByText(L.intro)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: L.firstFolder }))
    expect(screen.getByLabelText(L.folderName)).toBeInTheDocument()
  })
})
