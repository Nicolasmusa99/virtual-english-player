// @vitest-environment jsdom
// Calendario (C3) — "Tus clases" y "Ver el mes" del ALUMNO.
// Reloj fijo: martes 29/9/2026 12:00 (Buenos Aires). Zona del "dispositivo": Buenos Aires.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

vi.mock('@/lib/classView', async (orig) => ({ ...(await orig<typeof import('@/lib/classView')>()), deviceTz: () => 'America/Argentina/Buenos_Aires' }))

import StudentClasses, { CLASSES_TEXTS, toStudentClasses } from '@/app/StudentClasses'
import StudentMonth, { MONTH_TEXTS } from '@/app/StudentMonth'
import StudentApp, { STUDENT_TEXTS } from '@/app/StudentApp'

const MEET = 'https://meet.google.com/abc-defg-hij'
const cls = (startsAt: string, extra: Record<string, unknown> = {}) =>
  ({ key: startsAt, startsAt, durationMin: 60, meetUrl: MEET, status: 'scheduled', moved: false, ...extra })

let classes: unknown[]
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T15:00:00Z'))
  classes = [
    cls('2026-09-29T21:00:00.000Z'),
    cls('2026-10-02T13:30:00.000Z', { durationMin: 45, meetUrl: 'https://zoom.us/j/1' }),
    cls('2026-10-06T21:00:00.000Z', { status: 'cancelled' }),
    cls('2026-10-15T20:00:00.000Z', { durationMin: 90, moved: true }),
    cls('2026-10-20T21:00:00.000Z'),
    cls('2026-10-27T21:00:00.000Z'),
  ]
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/student/classes')) return Promise.resolve(json(200, { classes }))
    if (url === '/api/student/material') return Promise.resolve(json(200, { material: [] }))
    return Promise.resolve(json(403, { error: 'No autorizado' }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('toStudentClasses — valida lo que llega', () => {
  it('descarta lo que no tiene la forma esperada', () => {
    expect(toStudentClasses({ classes: [cls('2026-10-01T00:00:00.000Z'), { key: 1 }, cls('nada'), cls('2026-10-01T00:00:00.000Z', { status: 'x' }), null] })).toHaveLength(1)
    expect(toStudentClasses(null)).toEqual([])
  })
})

describe('StudentClasses — inicio', () => {
  it('la próxima clase: hoy 18:00, 60 min, Meet, y "Entrar" abre el link en otra pestaña', async () => {
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    const card = screen.getByTestId('next-class')
    expect(card).toHaveTextContent(CLASSES_TEXTS.next)
    // Rediseño (fase 4): "Hoy martes 29", la hora grande, y cuánto dura y por dónde
    expect(card).toHaveTextContent('Hoy martes 29')
    expect(within(card).getByText('Hoy').tagName).toBe('MARK') // "hoy" resaltado (el "ahora")
    expect(card).toHaveTextContent('18:00')
    expect(card).toHaveTextContent('Dura 60 minutos. Es por Google Meet.')
    const enter = within(card).getByRole('link', { name: /Entrar a la clase/ })
    expect(enter).toHaveAttribute('href', MEET)
    expect(enter).toHaveAttribute('target', '_blank')
    expect(enter).toHaveAttribute('rel', 'noopener noreferrer')
    expect(card).not.toHaveTextContent(CLASSES_TEXTS.localTime) // mismo huso que Argentina
    expect(fetchMock).toHaveBeenCalledWith('/api/student/classes')
  })

  it('las siguientes 4: cancelada tachada con etiqueta, "Cambió de día" en la movida', async () => {
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Viernes 2 de octubre10:30–11:15',
      `Martes 6 de octubre18:00–19:00${CLASSES_TEXTS.cancelled}`,
      `Jueves 15 de octubre17:00–18:30${CLASSES_TEXTS.moved}`,
      'Martes 20 de octubre18:00–19:00',
    ])
  })

  it('una clase en curso sigue siendo "la próxima"; al terminar, pasa a la siguiente', async () => {
    vi.setSystemTime(new Date('2026-09-29T21:30:00Z'))
    const r = render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    expect(screen.getByTestId('next-class')).toHaveTextContent('Hoy martes 2918:00')
    r.unmount()
    vi.setSystemTime(new Date('2026-09-29T22:01:00Z'))
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    expect(screen.getByTestId('next-class')).toHaveTextContent('Viernes 2 de octubre10:30')
    expect(screen.getByTestId('next-class')).toHaveTextContent('Es por Zoom: entrás con el botón.')
    expect(within(screen.getByTestId('next-class')).getByRole('link', { name: CLASSES_TEXTS.enterZoom })).toBeInTheDocument()
  })

  it('sin link → "Tu profe todavía no cargó el link" (sin botón)', async () => {
    classes = [cls('2026-09-29T21:00:00.000Z', { meetUrl: null })]
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    expect(screen.getByText(CLASSES_TEXTS.noLink)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('sin clases → "Todavía no tenés clases agendadas." (sin "Ver el mes")', async () => {
    classes = []
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    expect(screen.getByText(CLASSES_TEXTS.empty)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: CLASSES_TEXTS.seeMonth })).toBeNull()
  })

  it('error → mensaje + Reintentar (vuelve a pedir)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    render(<StudentClasses onOpenMonth={() => {}} />)
    await flush()
    expect(screen.getByText(CLASSES_TEXTS.error)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: CLASSES_TEXTS.retry })) })
    await flush()
    expect(screen.getByTestId('next-class')).toBeInTheDocument()
  })

  it('alumno en otro huso (Madrid) → avisa "tu hora local"', async () => {
    const cv = await import('@/lib/classView')
    const spy = vi.spyOn(cv, 'deviceTz').mockReturnValue('Europe/Madrid')
    try {
      render(<StudentClasses onOpenMonth={() => {}} />)
      await flush()
      expect(screen.getByTestId('next-class')).toHaveTextContent('Hoy martes 2923:00')
      expect(screen.getByTestId('next-class')).toHaveTextContent(CLASSES_TEXTS.localTime)
    } finally {
      spy.mockRestore() // si falla, que no arrastre el huso de Madrid a los tests siguientes
    }
  })
})

describe('StudentApp — "Tus clases" arriba de "Tu material", y el mes', () => {
  it('orden: clases y después material; "Ver el mes" abre el mes y "← Inicio" vuelve', async () => {
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Hola, Martina', CLASSES_TEXTS.title, STUDENT_TEXTS.material])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: CLASSES_TEXTS.seeMonth })) })
    await flush()
    expect(screen.getByRole('heading', { name: 'Septiembre 2026' })).toBeInTheDocument()
    expect(screen.queryByText(STUDENT_TEXTS.material)).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: MONTH_TEXTS.back })) })
    expect(screen.getByRole('heading', { name: 'Hola, Martina' })).toBeInTheDocument()
  })

  it('si las clases fallan, el material igual se ve', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === '/api/student/material'
      ? json(200, { material: [{ videoId: 'v', originalName: 'Frozen.mp4', sharedType: null, sharedLevel: null, durationSec: null, assignedAt: new Date().toISOString() }] })
      : json(500, {})))
    render(<StudentApp name="Martina" email={null} />)
    await flush()
    expect(screen.getByText(CLASSES_TEXTS.error)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Frozen/ })).toBeInTheDocument()
  })
})

describe('StudentMonth', () => {
  const lastUrl = () => String(fetchMock.mock.calls.at(-1)![0])

  it('pide SOLO el mes (hora local) y marca las clases en su día', async () => {
    classes = [cls('2026-09-01T21:00:00.000Z'), cls('2026-09-22T21:00:00.000Z'), cls('2026-09-29T21:00:00.000Z'), cls('2026-09-15T21:00:00.000Z', { status: 'cancelled' })]
    render(<StudentMonth onBack={() => {}} />)
    await flush()
    expect(lastUrl()).toBe(`/api/student/classes?from=${encodeURIComponent('2026-09-01T03:00:00.000Z')}&to=${encodeURIComponent('2026-10-01T03:00:00.000Z')}`)
    expect(screen.getByRole('heading', { name: 'Septiembre 2026' })).toBeInTheDocument()
    expect(screen.getAllByTestId('month-class')).toHaveLength(4)
    const day1 = screen.getByRole('gridcell', { name: /martes 1 de septiembre, 1 clase/ })
    expect(day1).toBeInTheDocument()
  })

  it('arranca con HOY elegido: detalle con "Entrar"', async () => {
    render(<StudentMonth onBack={() => {}} />)
    await flush()
    const detail = screen.getByTestId('day-detail')
    expect(detail).toHaveTextContent('martes 29 de septiembre')
    expect(detail).toHaveTextContent('18:00–19:00')
    expect(within(detail).getByRole('link', { name: /Entrar/ })).toHaveAttribute('href', MEET)
  })

  it('un día pasado: "Ya pasó" (sin botón); uno cancelado: tachado, sin botón; uno sin clases', async () => {
    classes = [cls('2026-09-22T21:00:00.000Z'), cls('2026-09-30T21:00:00.000Z', { status: 'cancelled' })]
    render(<StudentMonth onBack={() => {}} />)
    await flush()
    fireEvent.click(screen.getByRole('gridcell', { name: /martes 22 de septiembre/ }))
    let detail = screen.getByTestId('day-detail')
    expect(detail).toHaveTextContent(MONTH_TEXTS.past)
    expect(within(detail).queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('gridcell', { name: /miércoles 30 de septiembre/ }))
    detail = screen.getByTestId('day-detail')
    expect(detail).toHaveTextContent(CLASSES_TEXTS.cancelled)
    expect(within(detail).queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('gridcell', { name: /jueves 10 de septiembre$/ }))
    expect(screen.getByTestId('day-detail')).toHaveTextContent(MONTH_TEXTS.noClasses)
  })

  it('flechas: mes siguiente / anterior (pide ese rango); fuera del mes actual no hay día elegido', async () => {
    render(<StudentMonth onBack={() => {}} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: MONTH_TEXTS.next })) })
    await flush()
    expect(screen.getByRole('heading', { name: 'Octubre 2026' })).toBeInTheDocument()
    expect(lastUrl()).toContain(encodeURIComponent('2026-10-01T03:00:00.000Z'))
    expect(screen.getByText(MONTH_TEXTS.pickDay)).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: MONTH_TEXTS.prev })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: MONTH_TEXTS.prev })) })
    await flush()
    expect(screen.getByRole('heading', { name: 'Agosto 2026' })).toBeInTheDocument()
  })

  it('solo habla con /api/student/classes', async () => {
    render(<StudentMonth onBack={() => {}} />)
    await flush()
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith('/api/student/classes'))).toBe(true)
  })
})
