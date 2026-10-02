// Calendario (G3 liviano) — el texto de "Copiar invitación": lo que el profe le pega al
// alumno por WhatsApp con el día, la hora (de Argentina) y el link de Zoom. Puro.
// Tests: tests/lib/invite.test.ts.
import { CLASS_TZ } from '@/lib/classSchedule'
import { addMinutes } from '@/lib/classDraft'
import { hhmm, longDate, seriesDays } from '@/lib/classView'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// '¡Hola Martina!' con el primer nombre; sin nombre (o si parece un mail), '¡Hola!'.
function hello(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0] ?? ''
  return first && !first.includes('@') ? `¡Hola ${first}!` : '¡Hola!'
}

const body = (greeting: string, what: string, when: string, url: string) =>
  [`${greeting} Te paso los datos de ${what} de Virtual English:`,
    `📅 ${when} (hora de Argentina)`,
    `👉 Entrá a Zoom: ${url}`,
    '¡Nos vemos!'].join('\n')

// Una clase: 'Jueves 2 de octubre, de 18:00 a 19:00'.
export function classInvite(c: { name?: string | null; startsAt: string; durationMin: number; url: string }): string {
  const t = new Date(c.startsAt)
  const end = new Date(t.getTime() + c.durationMin * 60_000)
  return body(hello(c.name), 'tu clase', `${cap(longDate(t, CLASS_TZ))}, de ${hhmm(t, CLASS_TZ)} a ${hhmm(end, CLASS_TZ)}`, c.url)
}

// Un horario que se repite: 'Todos los martes y jueves, de 18:00 a 19:00'.
export function seriesInvite(s: { name?: string | null; weekdays: number[]; time: string; durationMin: number; url: string }): string {
  return body(hello(s.name), 'tus clases', `${seriesDays(s.weekdays)}, de ${s.time} a ${addMinutes(s.time, s.durationMin)}`, s.url)
}
