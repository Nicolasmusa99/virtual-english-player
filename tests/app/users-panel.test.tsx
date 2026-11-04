// @vitest-environment jsdom
// UsersPanel (rediseño 2026-11): cada persona con avatar y sus datos; alta con nombre y
// apellido; el admin cambia nombres, cambia el profe de un alumno y borra cuentas.
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

describe('UsersPanel — la lista', () => {
  it('admin: por secciones (Profes, Alumnos, Admins) y filtros con cantidades', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Profes 1', 'Alumnos 2', 'Admins 1'])
    expect(screen.getByRole('button', { name: 'Todos4' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Alumnos2' }))
    expect(screen.getAllByTestId('person')).toHaveLength(2)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('de cada alumno: avatar, mail, su profe, videos, carpetas y próxima clase', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    const martina = personOf('Martina Pérez')
    for (const t of ['MP', 'martina@x.com', 'Profe: Laura Sosa', '3 videos', '2 carpetas', 'Próxima clase: Mañana, 18:00']) {
      expect(martina).toHaveTextContent(t)
    }
    const lucia = personOf('lucia@x.com')
    for (const t of ['Sin nombre: agregalo desde su pantalla', 'Sin profe', 'Sin material', 'Sin clases agendadas']) expect(lucia).toHaveTextContent(t)
    expect(personOf('Laura Sosa')).toHaveTextContent('1 alumno')
  })

  it('"Abrir" pasa id, mail y nombre', async () => {
    const onOpen = vi.fn()
    render(<UsersPanel role="admin" onOpenStudent={onOpen} />)
    await flush()
    fireEvent.click(within(personOf('Martina Pérez')).getByRole('button', { name: 'Abrir' }))
    expect(onOpen).toHaveBeenCalledWith('al-1', 'martina@x.com', 'Martina Pérez')
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

describe('UsersPanel — alta', () => {
  it('el profe da de alta con nombre y apellido; sin nombre no manda nada', async () => {
    users = users.filter((u) => u.role === 'alumno')
    render(<UsersPanel role="profesor" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newStudent }))
    fireEvent.change(screen.getByLabelText('Email del alumno'), { target: { value: 'tomas@x.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' })) })
    expect(screen.getByText(NAME_ERROR)).toBeInTheDocument()
    expect(calls('POST')).toEqual([])
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: '  Tomás   Ruiz ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' })) })
    await flush()
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({ name: 'Tomás Ruiz', email: 'tomas@x.com', role: 'alumno' })
    expect(screen.getByText('Usuario creado: Tomás Ruiz')).toBeInTheDocument()
  })

  it('el admin elige el rol y el profe del alumno (el selector muestra el nombre del profe)', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: T.newUser }))
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@x.com' } })
    expect(screen.getByRole('option', { name: 'Laura Sosa' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Profe'), { target: { value: 'pr-1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear' })) })
    expect(JSON.parse(String(calls('POST')[0][1].body))).toEqual({ name: 'Ana Gómez', email: 'ana@x.com', role: 'alumno', teacherId: 'pr-1' })
  })
})

describe('UsersPanel — acciones del admin', () => {
  it('"Cambiar nombre" en profes y admins (no en alumnos)', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    expect(within(personOf('Laura Sosa')).getByRole('button', { name: T.rename })).toBeInTheDocument()
    expect(within(personOf('Admin Uno')).getByRole('button', { name: T.rename })).toBeInTheDocument()
    expect(within(personOf('Martina Pérez')).queryByRole('button', { name: T.rename })).toBeNull()
    fireEvent.click(within(personOf('Laura Sosa')).getByRole('button', { name: T.rename }))
    expect(screen.getByRole('dialog', { name: 'Nombre del profe' })).toBeInTheDocument()
  })

  it('eliminar un alumno: confirma con lo que pasa y borra', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Martina Pérez' }))
    const dlg = screen.getByRole('dialog', { name: T.deleteTitle('Martina Pérez') })
    expect(dlg).toHaveTextContent('Se borran su material asignado, sus carpetas y sus clases.')
    expect(dlg).toHaveTextContent('No se puede deshacer.')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: T.deleteConfirm })) })
    await flush()
    expect(calls('DELETE')[0][0]).toBe('/api/users/al-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(T.deleted('Martina Pérez'))).toBeInTheDocument()
    expect(screen.queryByText('martina@x.com')).toBeNull()
  })

  it('eliminar un profe avisa que sus alumnos quedan sin profe; Cancelar no borra', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Laura Sosa' }))
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveTextContent('1 alumno queda sin profe')
    fireEvent.click(within(dlg).getByRole('button', { name: T.cancel }))
    expect(calls('DELETE')).toEqual([])
  })

  it('las cuentas de admin no se pueden eliminar desde acá', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    expect(within(personOf('Admin Uno')).queryByRole('button', { name: /Eliminar/ })).toBeNull()
  })

  it('"Cambiar profe" de un alumno: elige y guarda', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.click(within(personOf('lucia@x.com')).getByRole('button', { name: T.changeTeacher }))
    const dlg = screen.getByRole('dialog', { name: T.teacherTitle('lucia@x.com') })
    fireEvent.change(within(dlg).getByLabelText('Profe'), { target: { value: 'pr-1' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: T.save })) })
    const patch = calls('PATCH')[0]
    expect(patch[0]).toBe('/api/users/al-2')
    expect(JSON.parse(String(patch[1].body))).toEqual({ teacherId: 'pr-1' })
  })

  it('el profe no ve acciones de admin (ni eliminar, ni cambiar profe ni nombre)', async () => {
    users = users.filter((u) => u.role === 'alumno')
    render(<UsersPanel role="profesor" onOpenStudent={() => {}} />)
    await flush()
    expect(screen.queryByRole('button', { name: /Eliminar|Cambiar profe|Cambiar nombre/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Abrir' })).toHaveLength(2)
  })
})
