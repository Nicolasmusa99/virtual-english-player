// G3 liviano — texto de "Copiar invitación".
import { describe, it, expect } from 'vitest'
import { classInvite, seriesInvite } from '@/lib/invite'
import { seriesDays, seriesTitle } from '@/lib/classView'

const URL = 'https://us02web.zoom.us/j/8412345678'

describe('classInvite', () => {
  it('una clase: primer nombre, día con palabras y horario en hora de Argentina', () => {
    // 21:00 UTC = 18:00 en Buenos Aires
    expect(classInvite({ name: 'Martina Pérez', startsAt: '2026-10-01T21:00:00Z', durationMin: 60, url: URL })).toBe([
      '¡Hola Martina! Te paso los datos de tu clase de Virtual English:',
      '📅 Jueves 1 de octubre, de 18:00 a 19:00 (hora de Argentina)',
      `👉 Entrá a Zoom: ${URL}`,
      '¡Nos vemos!',
    ].join('\n'))
  })
  it('sin nombre (o con un mail en vez de nombre) saluda sin nombre', () => {
    expect(classInvite({ name: null, startsAt: '2026-10-01T21:00:00Z', durationMin: 45, url: URL })).toMatch(/^¡Hola! Te paso/)
    expect(classInvite({ name: 'martina@x.com', startsAt: '2026-10-01T21:00:00Z', durationMin: 45, url: URL })).toMatch(/^¡Hola! Te paso/)
    expect(classInvite({ name: '  ', startsAt: '2026-10-01T21:00:00Z', durationMin: 45, url: URL })).toMatch(/de 18:00 a 18:45/)
  })
  it('la fecha es la de Argentina aunque en UTC ya sea el día siguiente', () => {
    expect(classInvite({ name: 'Tomás', startsAt: '2026-10-02T02:30:00Z', durationMin: 60, url: URL })).toMatch(/Jueves 1 de octubre, de 23:30 a 00:30/)
  })
})

describe('seriesInvite', () => {
  it('un horario que se repite: los días y el horario', () => {
    expect(seriesInvite({ name: 'Martina', weekdays: [4, 2], time: '18:00', durationMin: 60, url: URL })).toBe([
      '¡Hola Martina! Te paso los datos de tus clases de Virtual English:',
      '📅 Todos los martes y jueves, de 18:00 a 19:00 (hora de Argentina)',
      `👉 Entrá a Zoom: ${URL}`,
      '¡Nos vemos!',
    ].join('\n'))
  })
})

describe('seriesDays', () => {
  it('es la primera parte de seriesTitle', () => {
    expect(seriesDays([1, 3, 5])).toBe('Todos los lunes, miércoles y viernes')
    expect(seriesDays([0, 1, 2, 3, 4, 5, 6])).toBe('Todos los días')
    expect(seriesTitle([2], '18:00')).toBe('Todos los martes a las 18:00')
  })
})
