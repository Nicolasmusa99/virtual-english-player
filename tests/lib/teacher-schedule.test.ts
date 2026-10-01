// Calendario (G2) — getTeacherSchedule (lib/classes.ts): las clases de la semana de TODOS
// los alumnos del profe, cada una con su alumno. La base es falsa: devuelve filas por
// tabla; acá se prueba el armado (por alumno, orden, horarios usados), no el SQL.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rows = vi.hoisted(() => ({ series: [] as unknown[], events: [] as unknown[], selects: 0 }))
vi.mock('@/lib/db', async () => {
  const { classSeries } = await import('@/lib/db/schema')
  return {
    db: {
      select: () => {
        rows.selects++
        return { from: (t: unknown) => ({ where: () => Promise.resolve(t === classSeries ? rows.series : rows.events) }) }
      },
    },
  }
})
import { getTeacherSchedule } from '@/lib/classes'

const T = 'teacher'
const series = (id: string, studentId: string, weekday: number, startMinute: number) => ({
  id, teacherId: T, studentId, weekday, weekdays: [weekday], startMinute, durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: null,
})
const FROM = new Date('2026-09-28T03:00:00Z'), TO = new Date('2026-10-05T03:00:00Z')

beforeEach(() => { rows.series = []; rows.events = []; rows.selects = 0 })

describe('getTeacherSchedule', () => {
  it('sin alumnos no consulta la base', async () => {
    expect(await getTeacherSchedule(T, [], FROM, TO)).toEqual({ classes: [], series: [] })
    expect(rows.selects).toBe(0)
  })

  it('arma las clases de cada alumno (con su studentId) y las ordena por hora', async () => {
    rows.series = [series('s-m', 'martina', 2, 18 * 60), series('s-t', 'tomas', 1, 17 * 60)]
    rows.events = [{
      id: 'e-1', teacherId: T, studentId: 'tomas', seriesId: null, originalStartsAt: null,
      startsAt: new Date('2026-09-30T13:00:00Z'), durationMin: 45, status: 'scheduled', meetUrl: null,
    }]
    const { classes } = await getTeacherSchedule(T, ['martina', 'tomas'], FROM, TO)
    expect(classes.map((c) => [c.studentId, c.startsAt.toISOString()])).toEqual([
      ['tomas', '2026-09-28T20:00:00.000Z'], // lunes 17:00
      ['martina', '2026-09-29T21:00:00.000Z'], // martes 18:00
      ['tomas', '2026-09-30T13:00:00.000Z'], // la suelta del miércoles
    ])
  })

  it('una excepción de un alumno no toca el horario de otro', async () => {
    rows.series = [series('s-m', 'martina', 2, 18 * 60), series('s-l', 'lucia', 2, 18 * 60)]
    rows.events = [{
      id: 'e-c', teacherId: T, studentId: 'martina', seriesId: 's-m', originalStartsAt: new Date('2026-09-29T21:00:00Z'),
      startsAt: new Date('2026-09-29T21:00:00Z'), durationMin: 60, status: 'cancelled', meetUrl: null,
    }]
    const { classes } = await getTeacherSchedule(T, ['martina', 'lucia'], FROM, TO)
    expect(classes.find((c) => c.studentId === 'martina')?.status).toBe('cancelled')
    expect(classes.find((c) => c.studentId === 'lucia')?.status).toBe('scheduled')
  })

  it('devuelve solo los horarios que tienen clases en el rango', async () => {
    rows.series = [series('s-m', 'martina', 2, 18 * 60), { ...series('s-old', 'martina', 3, 9 * 60), endsOn: '2026-09-10' }]
    const { series: used } = await getTeacherSchedule(T, ['martina'], FROM, TO)
    expect(used.map((s) => s.id)).toEqual(['s-m'])
    expect(used[0].weekdays).toEqual([2])
  })
})
