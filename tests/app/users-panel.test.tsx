// @vitest-environment jsdom
// UsersPanel — nombre y apellido en el alta y en la lista.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import UsersPanel from '@/app/UsersPanel'
import { NAME_ERROR } from '@/lib/personName'

let users: unknown[]
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  users = [
    { id: 'al-1', name: 'Martina Pérez', email: 'martina@x.com', role: 'alumno', teacherId: 'pr-1' },
    { id: 'al-2', name: null, email: 'lucia@x.com', role: 'alumno', teacherId: 'pr-1' },
    { id: 'pr-1', name: 'Laura Sosa', email: 'laura@x.com', role: 'profesor', teacherId: null },
  ]
  fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const b = JSON.parse(String(init.body))
      return Promise.resolve(json(201, { id: 'new', ...b }))
    }
    return Promise.resolve(json(200, { users }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const posts = () => fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST').map(([, i]) => JSON.parse(String(i.body)))

describe('UsersPanel — nombre y apellido', () => {
  it('el profe da de alta con nombre y apellido; sin nombre no manda nada', async () => {
    const onOpen = vi.fn()
    render(<UsersPanel role="profesor" onOpenStudent={onOpen} />)
    await flush()
    fireEvent.change(screen.getByLabelText('Email del alumno'), { target: { value: 'tomas@x.com' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' })) })
    expect(screen.getByText(NAME_ERROR)).toBeInTheDocument()
    expect(posts()).toEqual([])

    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: '  Tomás   Ruiz ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear alumno' })) })
    await flush()
    expect(posts()).toEqual([{ name: 'Tomás Ruiz', email: 'tomas@x.com', role: 'alumno' }])
    expect(screen.getByText('Usuario creado: Tomás Ruiz')).toBeInTheDocument()
  })

  it('la lista: el nombre arriba y el mail abajo; sin nombre, el mail y el aviso; "Abrir" pasa el nombre', async () => {
    const onOpen = vi.fn()
    render(<UsersPanel role="admin" onOpenStudent={onOpen} />)
    await flush()
    expect(screen.getByText('Martina Pérez')).toBeInTheDocument()
    expect(screen.getByText('martina@x.com, profe: Laura Sosa')).toBeInTheDocument()
    expect(screen.getByText('lucia@x.com')).toBeInTheDocument()
    expect(screen.getByText('Sin nombre: agregalo desde su pantalla, profe: Laura Sosa')).toBeInTheDocument()
    // el selector de profe muestra el nombre
    expect(screen.getByRole('option', { name: 'Laura Sosa' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir' })[0])
    expect(onOpen).toHaveBeenCalledWith('al-1', 'martina@x.com', 'Martina Pérez')
  })

  it('la búsqueda encuentra por nombre', async () => {
    render(<UsersPanel role="admin" />)
    await flush()
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'pérez' } })
    expect(screen.getByText('Martina Pérez')).toBeInTheDocument()
    expect(screen.queryByText('lucia@x.com')).toBeNull()
  })
})
