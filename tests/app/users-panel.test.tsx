// @vitest-environment jsdom
// UsersPanel (rediseño 2026-11): el profe ve tarjetas de sus alumnos; el admin, una tabla por
// sección con las acciones en el menú "⋯". Alta en una ventana, con nombre y apellido.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import UsersPanel, { PEOPLE_TEXTS as T } from '@/app/UsersPanel'
import { NAME_ERROR } from '@/lib/personName'

let users: { id: string; name: string | null; email: string; role: string; teacherId: string | null }[]
let stats: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-05T15:00:00Z')) // lunes 5/10, 12:00 en Buenos Aires
  users = [
    { id: 'al-1', name: 'Martina Pérez', email: 'martina@x.com', role: 'alumno', teacherId: 'pr-1' },
    { id: 'al-2', name: null, email: 'lucia@x.com', role: 'alumno', teacherId: null },
    { id: 'pr-1', name: 'Laura Sosa', email: 'laura@x.com', role: 'profesor', teacherId: null },
    { id: 'ad-1', name: 'Admin Uno', email: 'admin@x.com', role: 'admin', teacherId: null },
  ]
  stats = {
    'al-1': { materialCount: 3, folderCount: 2, nextClassAt: '2026-10-06T21:00:00.000Z' },
    'al-2': { materialCount: 0, folderCount: 0, nextClassAt: null },
  }
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (m === 'POST') return Promise.resolve(json(201, { id: 'new', ...JSON.parse(String(init!.body)) }))
    if (m === 'DELETE') { users = users.filter((u) => !url.endsWith(u.id)); return Promise.resolve(json(200, { ok: true })) }
    if (m === 'PATCH') return Promise.resolve(json(200, { ok: true, ...JSON.parse(String(init!.body)) }))
    if (url === '/api/users/stats') return Promise.resolve(json(200, { stats }))
    return Promise.resolve(json(200, { users }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const calls = (method: string) => fetchMock.mock.calls.filter(([, i]) => (i?.method ?? 'GET') === method)
const personOf = (text: string) => screen.getAllByTestId('person').find((p) => p.textContent?.includes(text))!

const openActions = (name: string) => fireEvent.click(screen.getByRole('button', { name: T.more(name) }))
const menuItem = (name: string) => within(screen.getByRole('menu')).getByRole('menuitem', { name })

describe('UsersPanel — la lista del admin', () => {
  it('por secciones (Profes, Alumnos, Admins) y filtros con cantidades', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Profes 1', 'Alumnos 2', 'Admins 1'])
    expect(screen.getByRole('button', { name: 'Todos4' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Alumnos2' }))
    expect(screen.getAllByTestId('person')).toHaveLength(2)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('filtro rápido de alumnos sin profe', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Sin profe1' }))
    expect(screen.getAllByTestId('person').map((p) => p.textContent)).toEqual([expect.stringContaining('lucia@x.com')])
  })

  it('de cada alumno: avatar, mail, su profe, videos, carpetas y próxima clase', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    const martina = personOf('Martina Pérez')
    for (const t of ['MP', 'martina@x.com', 'Laura Sosa', '3 videos', '2 carpetas', 'Mañana, 18:00']) expect(martina).toHaveTextContent(t)
    const lucia = personOf('lucia@x.com')
    for (const t of ['Sin nombre: agregalo desde su pantalla', 'Sin profe', 'Sin material', 'Sin agendar']) expect(lucia).toHaveTextContent(t)
    expect(personOf('Laura Sosa')).toHaveTextContent('1 alumno')
  })

  it('"Abrir" (o tocar la fila) pasa id, mail y nombre', async () => {
    const onOpen = vi.fn()
    render(<UsersPanel role="admin" onOpenStudent={onOpen} />)
    await flush()
    fireEvent.click(within(personOf('Martina Pérez')).getByRole('button', { name: 'Abrir' }))
    expect(onOpen).toHaveBeenCalledWith('al-1', 'martina@x.com', 'Martina Pérez')
    fireEvent.click(personOf('lucia@x.com'))
    expect(onOpen).toHaveBeenLastCalledWith('al-2', 'lucia@x.com', null)
  })

  it('la búsqueda encuentra por nombre o mail', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'pérez' } })
    expect(screen.getAllByTestId('person')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'lucia@' } })
    expect(screen.getAllByTestId('person')[0]).toHaveTextContent('lucia@x.com')
  })

  it('si el resumen falla, la lista se ve igual', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === '/api/users/stats' ? json(500, {}) : json(200, { users })))
    render(<UsersPanel role="admin" />)
    await flush()
    expect(screen.getAllByTestId('person')).toHaveLength(4)
  })
})

describe('UsersPanel — los alumnos del profe', () => {
  beforeEach(() => { users = users.filter((u) => u.role === 'alumno') })

  it('una tarjeta por alumno, con su material y su próxima clase; tocarla abre al alumno', async () => {
    const onOpen = vi.fn()
    render(<UsersPanel role="profesor" onOpenStudent={onOpen} />)
    await flush()
    const martina = personOf('Martina Pérez')
    for (const t of ['MP', '3 videos', 'Carpetas2', 'Mañana, 18:00']) expect(martina).toHaveTextContent(t)
    expect(personOf('lucia@x.com')).toHaveTextContent('Sin agendar')
    fireEvent.click(within(martina).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('al-1', 'martina@x.com', 'Martina Pérez')
  })

  it('la clase de HOY se marca', async () => {
    stats['al-2'] = { materialCount: 1, folderCount: 0, nextClassAt: '2026-10-05T20:00:00.000Z' }
    render(<UsersPanel role="profesor" onOpenStudent={() => {}} />)
    await flush()
    const hoy = within(personOf('lucia@x.com')).getByText('Hoy, 17:00')
    expect(hoy.className).toMatch(/today/)
  })

  it('ordenar por próxima clase (sin clase, al final)', async () => {
    render(<UsersPanel role="profesor" onOpenStudent={() => {}} />)
    await flush()
    expect(screen.getAllByTestId('person')[0]).toHaveTextContent('lucia@x.com') // por nombre
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'next' } })
    expect(screen.getAllByTestId('person')[0]).toHaveTextContent('Martina Pérez')
  })

  it('no ve acciones de admin (ni eliminar, ni cambiar profe ni nombre)', async () => {
    render(<UsersPanel role="profesor" onOpenStudent={() => {}} />)
    await flush()
    expect(screen.queryByRole('button', { name: /Eliminar|Cambiar profe|Cambiar nombre|Acciones de/ })).toBeNull()
  })
})

describe('UsersPanel — alta', () => {
  it('el profe da de alta con nombre y apellido; sin nombre no manda nada', async () => {
    users = users.filter((u) => u.role === 'alumno')
    render(<UsersPanel role="profesor" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newStudent }))
    const dlg = screen.getByRole('dialog', { name: T.createTitleTeacher })
    fireEvent.change(within(dlg).getByLabelText(/Email del alumno/), { target: { value: 'tomas@x.com' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Crear alumno' })) })
    expect(within(dlg).getByText(NAME_ERROR)).toBeInTheDocument()
    expect(calls('POST')).toEqual([])
    fireEvent.change(within(dlg).getByLabelText('Nombre y apellido'), { target: { value: '  Tomás   Ruiz ' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Crear alumno' })) })
    await flush()
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({ name: 'Tomás Ruiz', email: 'tomas@x.com', role: 'alumno' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(T.created('Tomás Ruiz'))
  })

  it('el admin elige el rol y el profe del alumno (el selector muestra el nombre del profe)', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newUser }))
    const dlg = screen.getByRole('dialog', { name: T.createTitleAdmin })
    expect(within(dlg).getByRole('radio', { name: 'Alumno' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(within(dlg).getByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(within(dlg).getByLabelText(/^Email/), { target: { value: 'ana@x.com' } })
    expect(within(dlg).getByRole('option', { name: 'Laura Sosa' })).toBeInTheDocument()
    fireEvent.change(within(dlg).getByLabelText('Profe'), { target: { value: 'pr-1' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Crear' })) })
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({ name: 'Ana Gómez', email: 'ana@x.com', role: 'alumno', teacherId: 'pr-1' })
  })

  it('el admin crea un profe (sin elegir profe)', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newUser }))
    const dlg = screen.getByRole('dialog')
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Profe' }))
    expect(within(dlg).queryByLabelText('Profe')).toBeNull()
    fireEvent.change(within(dlg).getByLabelText('Nombre y apellido'), { target: { value: 'Pablo Díaz' } })
    fireEvent.change(within(dlg).getByLabelText(/^Email/), { target: { value: 'pablo@x.com' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Crear' })) })
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({ name: 'Pablo Díaz', email: 'pablo@x.com', role: 'profesor' })
  })
})

describe('UsersPanel — acciones del admin (menú "⋯")', () => {
  it('"Cambiar nombre" abre la ventana con el título del rol', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Laura Sosa')
    fireEvent.click(menuItem(T.rename))
    expect(screen.getByRole('dialog', { name: 'Nombre del profe' })).toBeInTheDocument()
  })

  it('eliminar un alumno: confirma con lo que pasa y borra', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Martina Pérez')
    fireEvent.click(menuItem(T.remove))
    const dlg = screen.getByRole('dialog', { name: T.deleteTitle('Martina Pérez') })
    expect(dlg).toHaveTextContent('Se borran su material asignado, sus carpetas y sus clases.')
    expect(dlg).toHaveTextContent('No se puede deshacer.')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: T.deleteConfirm })) })
    await flush()
    expect(calls('DELETE')[0][0]).toBe('/api/users/al-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(T.deleted('Martina Pérez'))
    expect(screen.queryByText('martina@x.com')).toBeNull()
  })

  it('eliminar un profe avisa que sus alumnos quedan sin profe; Cancelar no borra', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Laura Sosa')
    fireEvent.click(menuItem(T.remove))
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveTextContent('1 alumno queda sin profe')
    fireEvent.click(within(dlg).getByRole('button', { name: T.cancel }))
    expect(calls('DELETE')).toEqual([])
  })

  it('las cuentas de admin no se pueden eliminar desde acá', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Admin Uno')
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: T.remove })).toBeNull()
  })

  it('"Cambiar profe" de un alumno: elige y guarda', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('lucia@x.com')
    fireEvent.click(menuItem(T.changeTeacher))
    const dlg = screen.getByRole('dialog', { name: T.teacherTitle('lucia@x.com') })
    fireEvent.change(within(dlg).getByLabelText('Profe'), { target: { value: 'pr-1' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: T.save })) })
    const patch = calls('PATCH')[0]
    expect(patch[0]).toBe('/api/users/al-2')
    expect(JSON.parse(String(patch[1].body))).toEqual({ teacherId: 'pr-1' })
  })
})

describe('UsersPanel — cuentas con usuario y contraseña (2026-11)', () => {
  it('la foto de cada persona, si tiene; si no, sus iniciales', async () => {
    users[0] = { ...users[0], image: 'https://lh3.googleusercontent.com/a/martina' } as typeof users[0]
    render(<UsersPanel role="admin" />)
    await flush()
    expect(within(personOf('Martina Pérez')).getByTestId('avatar').querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/martina')
    expect(within(personOf('Laura Sosa')).getByTestId('avatar')).toHaveTextContent('LS')
  })

  it('el admin crea una cuenta con mail y contraseña y ve los datos para pasarle', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newUser }))
    const dlg = screen.getByRole('dialog', { name: T.createTitleAdmin })
    fireEvent.change(within(dlg).getByLabelText('Nombre y apellido'), { target: { value: 'Tomás Ruiz' } })
    fireEvent.change(within(dlg).getByLabelText(/^Email/), { target: { value: 'Tomas@X.com' } })
    fireEvent.click(within(dlg).getByRole('radio', { name: new RegExp(T.accessPassword) }))
    fireEvent.change(within(dlg).getByLabelText(T.password), { target: { value: 'clave-segura-1' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: 'Crear' })) })
    await flush()
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({
      name: 'Tomás Ruiz', email: 'Tomas@X.com', role: 'alumno', access: 'password', password: 'clave-segura-1',
    })
    const creds = screen.getByRole('dialog', { name: T.credsTitle('Tomás Ruiz') })
    expect(creds).toHaveTextContent('tomas@x.com')
    expect(creds).toHaveTextContent('clave-segura-1')
  })

  it('"Generar una" pone una contraseña válida a la vista', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newUser }))
    const dlg = screen.getByRole('dialog')
    fireEvent.click(within(dlg).getByRole('radio', { name: new RegExp(T.accessPassword) }))
    fireEvent.click(within(dlg).getByRole('button', { name: T.generate }))
    const pw = within(dlg).getByLabelText(T.password) as HTMLInputElement
    expect(pw.type).toBe('text')
    expect(pw.value).toMatch(/^[a-zA-Z2-9]{10}$/)
  })

  it('el profe solo da de alta con Google (no ve la opción)', async () => {
    users = users.filter((u) => u.role === 'alumno')
    render(<UsersPanel role="profesor" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newStudent }))
    expect(within(screen.getByRole('dialog')).queryByRole('radio', { name: new RegExp(T.accessPassword) })).toBeNull()
  })

  it('el admin le puede cambiar la contraseña a una cuenta con contraseña', async () => {
    users.push({ id: 'al-9', name: 'Tomás Ruiz', email: 'tomas@x.com', role: 'alumno', teacherId: null, hasPassword: true } as typeof users[0])
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Tomás Ruiz')
    fireEvent.click(menuItem(T.resetPassword))
    const dlg = screen.getByRole('dialog', { name: T.resetTitle('Tomás Ruiz') })
    fireEvent.change(within(dlg).getByLabelText(T.password), { target: { value: 'nueva-clave-9' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: T.save })) })
    await flush()
    const p = calls('PATCH')[0]
    expect(p[0]).toBe('/api/users/al-9')
    expect(JSON.parse(String(p[1].body))).toEqual({ password: 'nueva-clave-9' })
    expect(screen.getByRole('dialog', { name: T.credsTitle('Tomás Ruiz') })).toHaveTextContent('nueva-clave-9')
  })

  it('a una cuenta de Google no se le ofrece cambiar la contraseña', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    openActions('Martina Pérez')
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: T.resetPassword })).toBeNull()
  })
})
