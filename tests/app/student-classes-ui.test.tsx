// @vitest-environment jsdom
// Calendario (C3) + vista del alumno v2 — el inicio del ALUMNO (la próxima clase, el armado
// según tenga o no material y clases, "Nuevo") y su calendario semanal (StudentWeek).
// Reloj fijo: martes 29/9/2026 12:00 (Buenos Aires). Zona del "dispositivo": Buenos Aires.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

vi.mock('@/lib/classView', async (orig) => ({ ...(await orig<typeof import('@/lib/classView')>()), deviceTz: () => 'America/Argentina/Buenos_Aires' }))

import { CLASSES_TEXTS, toStudentClasses, toTeacherName } from '@/app/StudentClasses'
import StudentWeek, { WEEK_TEXTS } from '@/app/StudentWeek'
import StudentApp, { STUDENT_TEXTS } from '@/app/StudentApp'

const MEET = 'https://meet.google.com/abc-defg-hij'
const ZOOM = 'https://zoom.us/j/1'
const cls = (startsAt: string, extra: Record<string, unknown> = {}) =>
  ({ key: startsAt, startsAt, durationMin: 60, meetUrl: MEET, status: 'scheduled', moved: false, ...extra })
const mat = (videoId: string, originalName: string, assignedAt: string) =>
  ({ videoId, originalName, sharedType: null, sharedLevel: null, durationSec: null, assignedAt })

let classes: ReturnType<typeof cls>[]
let teacherName: string | null
let material: unknown[]
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T15:00:00Z'))
  classes = [
    cls('2026-09-29T21:00:00.000Z'),
    cls('2026-10-02T13:30:00.000Z', { durationMin: 45, meetUrl: ZOOM }),
    cls('2026-10-06T21:00:00.000Z', { status: 'cancelled' }),
    cls('2026-10-15T20:00:00.000Z', { durationMin: 90, moved: true }),
    cls('2026-10-20T21:00:00.000Z'),
  ]
  teacherName = 'Laura Sosa'
  material = [mat('v1', 'Frozen.mp4', '2026-09-28T12:00:00.000Z')]
  // Como el servidor: con ?from&to devuelve solo ese rango.
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/student/classes')) {
      const q = new URL(url, 'http://x').searchParams
      const from = q.get('from'), to = q.get('to')
      const list = from && to ? classes.filter((c) => c.startsAt >= new Date(from).toISOString() && c.startsAt < new Date(to).toISOString()) : classes
      return Promise.resolve(json(200, { classes: list, teacherName }))
    }
    if (url === '/api/student/material') return Promise.resolve(json(200, { material }))
    return Promise.resolve(json(403, { error: 'No autorizado' }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const renderHome = async () => { render(<StudentApp name="Martina Pérez" email="m@x.com" />); await flush() }
const classesRegion = () => screen.getByRole('region', { name: CLASSES_TEXTS.title })
const headings = () => screen.getAllByRole('heading').map((h) => h.textContent)

describe('lo que llega de la API, validado', () => {
  it('descarta las clases que no tienen la forma esperada; el nombre del profe, solo si es texto', () => {
    expect(toStudentClasses({ classes: [cls('2026-10-01T00:00:00.000Z'), { key: 1 }, cls('nada'), cls('2026-10-01T00:00:00.000Z', { status: 'x' }), null] })).toHaveLength(1)
    expect(toStudentClasses(null)).toEqual([])
    expect(toTeacherName({ teacherName: ' Laura Sosa ' })).toBe('Laura Sosa')
    for (const b of [{ teacherName: '' }, { teacherName: 3 }, {}, null]) expect(toTeacherName(b)).toBeNull()
  })
})

describe('Tu próxima clase', () => {
  it('hoy 18:00, con quién y por dónde, cuánto falta, y "Entrar" abre el link en otra pestaña', async () => {
    await renderHome()
    const card = screen.getByTestId('next-class')
    expect(card).toHaveTextContent('Hoy martes 29')
    expect(within(card).getByText('Hoy').tagName).toBe('MARK') // "hoy" resaltado (el "ahora")
    expect(card).toHaveTextContent('18:00')
    expect(card).toHaveTextContent('con Laura Sosa, por Google Meet')
    expect(card).toHaveTextContent('Empieza en 6 h')
    const enter = within(card).getByRole('link', { name: CLASSES_TEXTS.enter })
    expect(enter).toHaveAttribute('href', MEET)
    expect(enter).toHaveAttribute('target', '_blank')
    expect(enter).toHaveAttribute('rel', 'noopener noreferrer')
    expect(card).not.toHaveTextContent(CLASSES_TEXTS.localTime) // mismo huso que Argentina
    expect(fetchMock).toHaveBeenCalledWith('/api/student/classes')
  })

  it('las 3 siguientes: la cancelada tachada con etiqueta, "Cambió de día" en la movida', async () => {
    await renderHome()
    const rows = within(classesRegion()).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Viernes 2 de octubre10:30',
      `Martes 6 de octubre18:00${CLASSES_TEXTS.cancelled}`,
      `Jueves 15 de octubre17:00${CLASSES_TEXTS.moved}`,
    ])
  })

  it('en curso: "Ya empezó"; al terminar pasa a la siguiente (Zoom, a más de un día: sin cuenta)', async () => {
    vi.setSystemTime(new Date('2026-09-29T21:30:00Z'))
    const r = render(<StudentApp name="Martina" email={null} />)
    await flush()
    expect(screen.getByTestId('next-class')).toHaveTextContent('Hoy martes 2918:00')
    expect(screen.getByTestId('next-class')).toHaveTextContent('Ya empezó')
    r.unmount()
    vi.setSystemTime(new Date('2026-09-29T22:01:00Z'))
    await renderHome()
    const card = screen.getByTestId('next-class')
    expect(card).toHaveTextContent('Viernes 2 de octubre10:30')
    expect(card).toHaveTextContent('con Laura Sosa, por Zoom')
    expect(card).not.toHaveTextContent('Empieza')
    expect(within(card).getByRole('link', { name: CLASSES_TEXTS.enterZoom })).toHaveAttribute('href', ZOOM)
  })

  it('sin link → "Tu profe todavía no cargó el link" (sin botón); sin nombre del profe → solo por dónde', async () => {
    classes = [cls('2026-09-29T21:00:00.000Z', { meetUrl: null })]
    teacherName = null
    await renderHome()
    const card = screen.getByTestId('next-class')
    expect(card).toHaveTextContent(CLASSES_TEXTS.noLink)
    expect(within(card).queryByRole('link')).toBeNull()
    expect(card).not.toHaveTextContent('con ')
  })

  it('alumno en otro huso (Madrid) → la hora suya y el aviso "tu hora local"', async () => {
    const cv = await import('@/lib/classView')
    const spy = vi.spyOn(cv, 'deviceTz').mockReturnValue('Europe/Madrid')
    try {
      await renderHome()
      expect(screen.getByTestId('next-class')).toHaveTextContent('Hoy martes 2923:00')
      expect(screen.getByTestId('next-class')).toHaveTextContent(CLASSES_TEXTS.localTime)
    } finally {
      spy.mockRestore() // si falla, que no arrastre el huso de Madrid a los tests siguientes
    }
  })

  it('si las clases fallan: mensaje + Reintentar (vuelve a pedir), y el material igual se ve', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    await renderHome()
    expect(within(classesRegion()).getByText(CLASSES_TEXTS.error, { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Frozen/ })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: CLASSES_TEXTS.retry })) })
    await flush()
    expect(screen.getByTestId('next-class')).toBeInTheDocument()
  })
})

describe('el armado del inicio según lo que tenga el alumno', () => {
  it('con material y clases: material y próxima clase; lo nuevo primero y con "Nuevo"', async () => {
    material = [
      mat('viejo', 'Let It Be.mp4', '2026-09-15T12:00:00.000Z'), // hace 2 semanas
      mat('nuevo', 'Comercial del auto', '2026-09-28T12:00:00.000Z'), // ayer
    ]
    await renderHome()
    expect(screen.getByText(STUDENT_TEXTS.intro)).toBeInTheDocument()
    expect(headings()).toEqual(['Hola, Martina', STUDENT_TEXTS.material, CLASSES_TEXTS.next])
    const cards = within(screen.getByRole('region', { name: STUDENT_TEXTS.material })).getAllByRole('button')
    expect(cards.map((c) => c.textContent)).toEqual([
      `${STUDENT_TEXTS.isNew}Comercial del auto, ${STUDENT_TEXTS.isNew}Asignado ayer`,
      'Let It BeAsignado hace 2 semanas',
    ])
  })

  it('sin material pero con clases: la clase es lo principal y "Tu material" avisa que no hay', async () => {
    material = []
    await renderHome()
    expect(screen.getByText(STUDENT_TEXTS.introEmpty)).toBeInTheDocument()
    expect(headings()).toEqual(['Hola, Martina', CLASSES_TEXTS.next, STUDENT_TEXTS.material])
    expect(screen.getByTestId('next-class')).toBeInTheDocument()
    expect(screen.getByText(STUDENT_TEXTS.emptyTitle)).toBeInTheDocument()
    expect(screen.getByText(STUDENT_TEXTS.emptySub)).toBeInTheDocument()
  })

  it('con material pero sin clases: "No tenés clases agendadas"', async () => {
    classes = []
    await renderHome()
    expect(headings()).toEqual(['Hola, Martina', STUDENT_TEXTS.material, CLASSES_TEXTS.title])
    expect(within(classesRegion()).getByText(CLASSES_TEXTS.emptyTitle)).toBeInTheDocument()
    expect(screen.queryByTestId('next-class')).toBeNull()
  })

  it('sin clases ni material (recién creado): una bienvenida, sin secciones vacías', async () => {
    classes = []
    material = []
    await renderHome()
    expect(screen.getByText(STUDENT_TEXTS.welcome)).toBeInTheDocument()
    expect(screen.getByText(STUDENT_TEXTS.welcomeTitle)).toBeInTheDocument()
    expect(headings()).toEqual(['Hola, Martina'])
  })

  it('solo las canceladas por delante cuentan como "sin clase próxima" pero se listan', async () => {
    classes = [cls('2026-10-06T21:00:00.000Z', { status: 'cancelled' })]
    await renderHome()
    expect(screen.queryByTestId('next-class')).toBeNull()
    expect(within(classesRegion()).getByRole('listitem')).toHaveTextContent(CLASSES_TEXTS.cancelled)
  })
})

describe('las pestañas Inicio y Calendario', () => {
  it('"Calendario" muestra la semana; "Inicio" vuelve; "Ver el calendario" también lleva', async () => {
    await renderHome()
    const nav = screen.getByRole('navigation', { name: STUDENT_TEXTS.nav })
    expect(within(nav).getByRole('button', { name: STUDENT_TEXTS.home })).toHaveAttribute('aria-current', 'page')
    await act(async () => { fireEvent.click(within(nav).getByRole('button', { name: STUDENT_TEXTS.calendar })) })
    await flush()
    expect(screen.getByTestId('week-title')).toHaveTextContent('28 sep – 4 oct 2026')
    expect(within(nav).getByRole('button', { name: STUDENT_TEXTS.calendar })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText(STUDENT_TEXTS.material)).toBeNull()
    await act(async () => { fireEvent.click(within(nav).getByRole('button', { name: STUDENT_TEXTS.home })) })
    expect(screen.getByRole('heading', { name: 'Hola, Martina' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: CLASSES_TEXTS.seeCalendar })) })
    await flush()
    expect(screen.getByTestId('week-title')).toBeInTheDocument()
  })

  it('arriba, el nombre del alumno y "Salir"', async () => {
    await renderHome()
    expect(screen.getByText('Martina Pérez')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: STUDENT_TEXTS.signOut })).toBeInTheDocument()
  })
})

describe('StudentWeek — el calendario semanal', () => {
  const lastUrl = () => String(fetchMock.mock.calls.at(-1)![0])
  const renderWeek = async (upcoming = classes) => { render(<StudentWeek upcoming={upcoming as never} />); await flush() }

  it('pide SOLO la semana (hora local) y pone sus clases en la grilla, con la raya de "ahora"', async () => {
    await renderWeek()
    expect(lastUrl()).toBe(`/api/student/classes?from=${encodeURIComponent('2026-09-28T03:00:00.000Z')}&to=${encodeURIComponent('2026-10-05T03:00:00.000Z')}`)
    const evs = screen.getAllByTestId('week-class')
    expect(evs.map((e) => e.getAttribute('aria-label'))).toEqual([
      'Clase con Laura, martes 29 de septiembre, 18:00–19:00',
      'Clase con Laura, viernes 2 de octubre, 10:30–11:15',
    ])
    expect(screen.getByTestId('week-now')).toBeInTheDocument()
  })

  it('tocar una clase abre el detalle con "Entrar"; "Cerrar" lo cierra', async () => {
    await renderWeek()
    fireEvent.click(screen.getAllByTestId('week-class')[0])
    const dlg = screen.getByRole('dialog', { name: 'Clase con Laura Sosa' })
    expect(dlg).toHaveTextContent('Martes 29 de septiembre, 18:00–19:00')
    expect(within(dlg).getByRole('link', { name: CLASSES_TEXTS.enter })).toHaveAttribute('href', MEET)
    fireEvent.click(within(dlg).getAllByRole('button', { name: WEEK_TEXTS.close }).at(-1)!) // la × y "Cerrar"
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('la semana siguiente: la cancelada dice "Cancelada" y no tiene botón para entrar', async () => {
    await renderWeek()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: WEEK_TEXTS.nextWeek })) })
    await flush()
    expect(screen.getByTestId('week-title')).toHaveTextContent('5 – 11 oct 2026')
    const ev = screen.getByTestId('week-class')
    expect(ev).toHaveAttribute('aria-label', expect.stringContaining('(cancelada)'))
    expect(ev).toHaveTextContent(WEEK_TEXTS.cancelled)
    fireEvent.click(ev)
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveTextContent(WEEK_TEXTS.cancelled)
    expect(within(dlg).queryByRole('link')).toBeNull()
  })

  it('una clase que ya pasó: "Esta clase ya pasó." y sin botón', async () => {
    classes = [cls('2026-09-28T21:00:00.000Z')]
    await renderWeek()
    fireEvent.click(screen.getByTestId('week-class'))
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveTextContent(WEEK_TEXTS.pastNote)
    expect(within(dlg).queryByRole('link')).toBeNull()
  })

  it('semana vacía con una próxima más adelante: lo dice y "Ir a esa semana" lleva', async () => {
    classes = [cls('2026-10-15T20:00:00.000Z', { durationMin: 90 })]
    await renderWeek()
    const note = screen.getByTestId('week-note')
    expect(note).toHaveTextContent(WEEK_TEXTS.emptyWeek)
    expect(note).toHaveTextContent('La próxima es el jueves 15 de octubre a las 17:00.')
    await act(async () => { fireEvent.click(within(note).getByRole('button', { name: WEEK_TEXTS.goWeek })) })
    await flush()
    expect(screen.getByTestId('week-title')).toHaveTextContent('12 – 18 oct 2026')
    expect(screen.getAllByTestId('week-class')).toHaveLength(1)
    expect(screen.queryByTestId('week-note')).toBeNull()
  })

  it('sin ninguna clase: "Todavía no tenés clases agendadas."', async () => {
    classes = []
    await renderWeek([])
    expect(screen.getByTestId('week-note')).toHaveTextContent(WEEK_TEXTS.none)
    expect(screen.queryByRole('button', { name: WEEK_TEXTS.goWeek })).toBeNull()
  })

  it('error → mensaje + Reintentar; solo habla con /api/student/classes', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    await renderWeek()
    expect(screen.getByText(WEEK_TEXTS.error, { exact: false })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: CLASSES_TEXTS.retry })) })
    await flush()
    expect(screen.getAllByTestId('week-class')).toHaveLength(2)
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith('/api/student/classes'))).toBe(true)
  })
})
