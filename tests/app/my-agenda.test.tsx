// @vitest-environment jsdom
// Calendario (G2) — "Mi agenda" del profe (MyAgenda + useClassEditor + ClassDialog).
// Reloj fijo: martes 29/9/2026 12:00 en Buenos Aires. Verifica la grilla (qué clase va en
// qué día, colores, superposiciones, "ahora"), la navegación y QUÉ se le pide a la API
// al crear desde un hueco, editar o cancelar desde el detalle (mismo flujo que G1).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import MyAgenda, { AGENDA_TEXTS as A } from '@/app/MyAgenda'
import { DIALOG_TEXTS as D } from '@/app/ClassDialog'

const ZOOM = 'https://us02web.zoom.us/j/111'
const STUDENTS = [
  { id: 'st-m', name: 'Martina Pérez', email: 'martina@x.com' },
  { id: 'st-t', name: 'Tomás Ruiz', email: 'tomas@x.com' },
  { id: 'st-l', name: 'Lucía Gómez', email: 'lucia@x.com' },
]
const SER_M = { id: 'ser-m', studentId: 'st-m', weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: null }
const SER_L = { id: 'ser-l', studentId: 'st-l', weekdays: [4], time: '11:00', durationMin: 90, startsOn: '2026-09-01', endsOn: null, meetUrl: null }
const CLASSES = [
  { key: 'e-t', studentId: 'st-t', seriesId: null, eventId: 'e-t', startsAt: '2026-09-28T20:00:00.000Z', durationMin: 60, meetUrl: 'https://zoom.us/j/9', status: 'scheduled', originalStartsAt: null }, // lun 17:00
  { key: 'ser-m:1', studentId: 'st-m', seriesId: 'ser-m', eventId: null, startsAt: '2026-09-29T21:00:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // mar 18:00
  { key: 'e-t2', studentId: 'st-t', seriesId: null, eventId: 'e-t2', startsAt: '2026-09-29T21:30:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // mar 18:30 (se superpone)
  { key: 'e-l', studentId: 'st-l', seriesId: 'ser-l', eventId: 'e-l', startsAt: '2026-10-01T14:00:00.000Z', durationMin: 90, meetUrl: null, status: 'cancelled', originalStartsAt: '2026-10-01T14:00:00.000Z' }, // jue 11:00 cancelada
]

let data: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>
let narrow = false
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T15:00:00Z'))
  narrow = false
  data = { students: STUDENTS, series: [SER_M, SER_L], classes: CLASSES, zoomUrl: ZOOM }
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return Promise.resolve(json(200, data))
    return Promise.resolve(json(200, { ok: true }))
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: narrow, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const gets = () => fetchMock.mock.calls.filter(([, i]) => !i?.method || i.method === 'GET').map(([u]) => decodeURIComponent(String(u)))
const writes = () => fetchMock.mock.calls.filter(([, i]) => i?.method && i.method !== 'GET')
  .map(([u, i]) => [String(u), i.method, i.body ? JSON.parse(i.body) : undefined])
const onOpenStudent = vi.fn()
const onBack = vi.fn()
async function mount() { render(<MyAgenda onBack={onBack} onOpenStudent={onOpenStudent} />); await flush() }
const click = async (el: HTMLElement, init?: object) => { await act(async () => { fireEvent.click(el, init) }); await flush() }
const block = (name: RegExp) => screen.getAllByTestId('agenda-class').find((b) => name.test(b.getAttribute('aria-label') ?? ''))!
const col = (day: string) => document.querySelector(`[data-day="${day}"]`) as HTMLElement

describe('MyAgenda — la semana', () => {
  it('pide la semana actual (lunes a lunes, hora de Argentina) y la titula como Google', async () => {
    await mount()
    expect(gets()[0]).toBe('/api/classes/agenda?from=2026-09-28T03:00:00.000Z&to=2026-10-05T03:00:00.000Z')
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('28 sep – 4 oct 2026')
    expect(screen.getByLabelText('martes 29 de septiembre')).toHaveTextContent('MAR29')
  })

  it('cada clase en su día, con el nombre del alumno y la hora', async () => {
    await mount()
    expect(screen.getAllByTestId('agenda-class')).toHaveLength(4)
    expect(within(col('2026-09-28')).getByTestId('agenda-class')).toHaveTextContent('Tomás17:00')
    const martes = within(col('2026-09-29')).getAllByTestId('agenda-class')
    expect(martes.map((b) => b.textContent)).toEqual(['Martina18:00', 'Tomás18:30'])
    expect(block(/Martina/)).toHaveAttribute('aria-label', 'Martina Pérez, martes 29 de septiembre, 18:00–19:00')
  })

  it('dos clases a la vez se reparten el ancho; la cancelada se marca', async () => {
    await mount()
    expect(block(/Martina/).style.width).toBe('calc(50% - 5px)')
    expect(block(/Tomás.*18:30/).style.left).toBe('calc(50% + 2px)')
    expect(block(/Lucía/).getAttribute('aria-label')).toContain('(cancelada)')
  })

  it('el mismo alumno, el mismo color; la leyenda muestra a los de la semana', async () => {
    await mount()
    const colorOf = (b: HTMLElement) => [...b.classList].find((c) => /agC\d/.test(c))
    expect(colorOf(block(/Tomás.*17:00/))).toBe(colorOf(block(/Tomás.*18:30/)))
    expect(colorOf(block(/Martina/))).not.toBe(colorOf(block(/Tomás.*17:00/)))
    expect(screen.getByText(A.hint)).toBeInTheDocument()
    for (const n of ['Martina', 'Tomás', 'Lucía']) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
  })

  it('la línea de "ahora" está en la columna de hoy', async () => {
    await mount()
    expect(within(col('2026-09-29')).getByTestId('agenda-now')).toBeInTheDocument()
    expect(within(col('2026-09-30')).queryByTestId('agenda-now')).toBeNull()
  })

  it('‹ › cambian de semana y "Hoy" vuelve', async () => {
    await mount()
    data = { ...data, classes: [] }
    await click(screen.getByRole('button', { name: A.nextWeek }))
    expect(gets().at(-1)).toBe('/api/classes/agenda?from=2026-10-05T03:00:00.000Z&to=2026-10-12T03:00:00.000Z')
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('5 – 11 oct 2026')
    expect(screen.getByText(A.empty)).toBeInTheDocument()
    await click(screen.getByRole('button', { name: A.prevWeek }))
    await click(screen.getByRole('button', { name: A.prevWeek }))
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('21 – 27 sep 2026')
    await click(screen.getByRole('button', { name: A.today }))
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('28 sep – 4 oct 2026')
  })

  it('sin alumnos: lo avisa y no deja crear', async () => {
    data = { students: [], series: [], classes: [], zoomUrl: null }
    await mount()
    expect(screen.getByText(A.noStudents)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear/ })).toBeDisabled()
  })

  it('si falla la carga, lo dice y deja reintentar', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    await mount()
    expect(screen.getByText(A.loadError)).toBeInTheDocument()
    await click(screen.getByRole('button', { name: A.retry }))
    expect(screen.getAllByTestId('agenda-class')).toHaveLength(4)
  })

  it('"← Inicio" vuelve', async () => {
    await mount()
    await click(screen.getByRole('button', { name: A.back }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('MyAgenda — crear', () => {
  it('clic en un hueco → "Nueva clase" ese día a esa hora, con el alumno a elegir', async () => {
    await mount()
    await click(col('2026-09-30'), { clientY: 10 * 48 + 20 }) // 18:00 (la grilla arranca a las 8)
    const dlg = screen.getByRole('dialog', { name: D.create })
    expect((within(dlg).getByLabelText(D.date) as HTMLInputElement).value).toBe('2026-09-30')
    expect((within(dlg).getByLabelText(D.start) as HTMLInputElement).value).toBe('18:00')
    expect((within(dlg).getByLabelText(D.end) as HTMLInputElement).value).toBe('19:00')
    // sin alumno no se guarda
    await click(within(dlg).getByRole('button', { name: D.save }))
    expect(within(dlg).getByRole('alert')).toHaveTextContent(D.noStudent)
    expect(writes()).toEqual([])
    fireEvent.change(within(dlg).getByLabelText(D.student), { target: { value: 'st-t' } })
    await click(within(dlg).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/events', 'POST', { studentId: 'st-t', date: '2026-09-30', time: '18:00', durationMin: 60, meetUrl: '' }]])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(gets()).toHaveLength(2) // recargó la semana
  })

  it('el alumno se elige por su nombre completo; "Crear" arranca hoy', async () => {
    await mount()
    await click(screen.getByRole('button', { name: /Crear/ }))
    const dlg = screen.getByRole('dialog', { name: D.create })
    expect((within(dlg).getByLabelText(D.date) as HTMLInputElement).value).toBe('2026-09-29')
    const opts = within(within(dlg).getByLabelText(D.student)).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual([D.pickStudent, 'Lucía Gómez', 'Martina Pérez', 'Tomás Ruiz'])
  })

  it('un horario que se repite se crea para el alumno elegido', async () => {
    await mount()
    await click(col('2026-10-01'), { clientY: 2 * 48 }) // jueves 10:00
    const dlg = screen.getByRole('dialog', { name: D.create })
    fireEvent.change(within(dlg).getByLabelText(D.student), { target: { value: 'st-m' } })
    fireEvent.change(within(dlg).getByLabelText(D.repeat), { target: { value: 'weekly' } })
    await click(within(dlg).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/series', 'POST', {
      studentId: 'st-m', weekdays: [4], time: '10:00', durationMin: 60, startsOn: '2026-10-01', endsOn: null, meetUrl: '',
    }]])
  })

  it('clic sobre una clase NO crea (abre su detalle)', async () => {
    await mount()
    await click(block(/Martina/))
    expect(screen.queryByRole('dialog', { name: D.create })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Clase con Martina Pérez' })).toBeInTheDocument()
  })
})

describe('MyAgenda — detalle de una clase', () => {
  it('muestra cuándo, qué tipo es y el link (Mi sala de Zoom si no tiene propio)', async () => {
    await mount()
    await click(block(/Martina/))
    const dlg = screen.getByRole('dialog', { name: 'Clase con Martina Pérez' })
    expect(dlg).toHaveTextContent('Martes 29 de septiembre · 18:00–19:00')
    expect(dlg).toHaveTextContent('Se repite')
    expect(within(dlg).getByRole('link', { name: A.enterZoom })).toHaveAttribute('href', ZOOM)
    expect(dlg).toHaveTextContent(A.room)
  })

  it('Editar → la ventana de G1 con el alumno fijo → "Solo esta clase" mueve solo esa', async () => {
    await mount()
    await click(block(/Martina/))
    await click(screen.getByRole('button', { name: A.edit }))
    const dlg = screen.getByRole('dialog', { name: D.edit })
    expect(within(dlg).getByTestId('dialog-student')).toHaveTextContent('Martina Pérez')
    expect(within(dlg).queryByLabelText(D.student)).toBeNull()
    fireEvent.change(within(dlg).getByLabelText(D.start), { target: { value: '19:00' } })
    await click(within(dlg).getByRole('button', { name: D.save }))
    const sc = screen.getByRole('dialog', { name: D.scopeEdit })
    await click(within(sc).getByRole('button', { name: D.accept })) // "Solo esta clase" viene elegida
    expect(writes()).toEqual([['/api/classes/events', 'POST', {
      seriesId: 'ser-m', originalStartsAt: '2026-09-29T21:00:00.000Z', action: 'move', date: '2026-09-29', time: '19:00', durationMin: 60, meetUrl: '',
    }]])
  })

  it('Cancelar una clase que se repite → "Todas las clases" borra ese horario', async () => {
    await mount()
    await click(block(/Martina/))
    await click(screen.getByRole('button', { name: A.cancel }))
    const sc = screen.getByRole('dialog', { name: D.scopeCancel })
    fireEvent.click(within(sc).getByLabelText(D.all))
    await click(within(sc).getByRole('button', { name: D.cancelClasses }))
    expect(writes()).toEqual([['/api/classes/series/ser-m?scope=all', 'DELETE', undefined]])
  })

  it('Cancelar una clase suelta pide confirmación y la marca cancelada', async () => {
    await mount()
    await click(block(/Tomás.*17:00/))
    await click(screen.getByRole('button', { name: A.cancel }))
    expect(window.confirm).toHaveBeenCalled()
    expect(writes()).toEqual([['/api/classes/events/e-t', 'PATCH', { status: 'cancelled' }]])
  })

  it('una cancelada se puede Restaurar (vuelve al horario)', async () => {
    await mount()
    await click(block(/Lucía/))
    const dlg = screen.getByRole('dialog', { name: 'Clase con Lucía Gómez' })
    expect(within(dlg).queryByRole('button', { name: A.edit })).toBeNull()
    await click(within(dlg).getByRole('button', { name: A.restore }))
    expect(writes()).toEqual([['/api/classes/events/e-l', 'DELETE', undefined]])
  })

  it('"Ver alumno" abre la pantalla de ese alumno', async () => {
    await mount()
    await click(block(/Tomás.*17:00/))
    await click(screen.getByRole('button', { name: A.openStudent }))
    expect(onOpenStudent).toHaveBeenCalledWith('st-t', 'tomas@x.com')
  })

  it('Escape cierra el detalle', async () => {
    await mount()
    await click(block(/Martina/))
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('MyAgenda — celular (un día por vez)', () => {
  it('muestra el día, la semana arriba y el botón "+"; tocar un día lo cambia', async () => {
    narrow = true
    await mount()
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('Martes 29')
    expect(document.querySelectorAll('[data-day]')).toHaveLength(1)
    expect(screen.getAllByTestId('agenda-class').map((b) => b.textContent)).toEqual(['Martina18:00', 'Tomás18:30'])
    expect(screen.getByRole('button', { name: 'martes 29 de septiembre' })).toHaveAttribute('aria-pressed', 'true')
    await click(screen.getByRole('button', { name: 'jueves 1 de octubre' }))
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('Jueves 1')
    expect(screen.getAllByTestId('agenda-class')).toHaveLength(1)
    await click(screen.getByRole('button', { name: A.nextDay }))
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('Viernes 2')
    expect(gets()).toHaveLength(1) // misma semana: no vuelve a pedir
    await click(screen.getByRole('button', { name: A.create }))
    expect((screen.getByLabelText(D.date) as HTMLInputElement).value).toBe('2026-10-02')
  })

  it('pasar del domingo al lunes pide la semana siguiente', async () => {
    narrow = true
    await mount()
    await click(screen.getByRole('button', { name: 'domingo 4 de octubre' }))
    await click(screen.getByRole('button', { name: A.nextDay }))
    expect(screen.getByTestId('agenda-title')).toHaveTextContent('Lunes 5')
    expect(gets().at(-1)).toBe('/api/classes/agenda?from=2026-10-05T03:00:00.000Z&to=2026-10-12T03:00:00.000Z')
  })
})
