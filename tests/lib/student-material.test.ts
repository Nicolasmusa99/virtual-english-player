// @vitest-environment node
// Vista del alumno (E1) — la regla de la "versión viva" (lib/assignments.ts).
// Qué copia de captions ve el alumno: la de SU profe actual → si no hay, la del
// dueño → si no hay, ninguna. Nunca la de otro profe u otro alumno.
// (La consulta SQL que trae las filas se verifica en vivo contra la base de pruebas.)
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} })) // estas funciones son puras: la DB no se usa

import { pickCaptionsRow, toStudentPhrases } from '@/lib/assignments'

const PROFE_A = 'profe-a'
const PROFE_B = 'profe-b'
const DUENO = 'admin-dueno'
const row = (userId: string, text = userId) => ({ userId, phrases: [{ start: 0, end: 1, text }], delay: 0 })

describe('pickCaptionsRow — de qué copia salen las captions', () => {
  it('cada alumno ve la copia de SU profe (A → copia de A, B → copia de B)', () => {
    const rows = [row(DUENO), row(PROFE_A), row(PROFE_B)]
    expect(pickCaptionsRow(rows, PROFE_A, DUENO)).toEqual({ row: row(PROFE_A), source: 'teacher' })
    expect(pickCaptionsRow(rows, PROFE_B, DUENO)).toEqual({ row: row(PROFE_B), source: 'teacher' })
  })

  it('si su profe nunca editó el video → la del dueño', () => {
    expect(pickCaptionsRow([row(DUENO), row(PROFE_B)], PROFE_A, DUENO)).toEqual({ row: row(DUENO), source: 'owner' })
  })

  it('NUNCA la copia de otro profe, aunque llegue en las filas y no haya ni del suyo ni del dueño', () => {
    expect(pickCaptionsRow([row(PROFE_B)], PROFE_A, DUENO)).toBeNull()
  })

  it('alumno sin profe asignado (teacher_id null) → la del dueño', () => {
    expect(pickCaptionsRow([row(DUENO), row(PROFE_A)], null, DUENO)).toEqual({ row: row(DUENO), source: 'owner' })
  })

  it('sin ninguna copia → null (el alumno ve el video sin subtítulos)', () => {
    expect(pickCaptionsRow([], PROFE_A, DUENO)).toBeNull()
  })

  it('cambio de profe: el mismo alumno pasa a ver la copia del profe NUEVO sin migrar nada', () => {
    const rows = [row(DUENO), row(PROFE_A), row(PROFE_B)]
    expect(pickCaptionsRow(rows, PROFE_A, DUENO)?.row.userId).toBe(PROFE_A)
    expect(pickCaptionsRow(rows, PROFE_B, DUENO)?.row.userId).toBe(PROFE_B) // teacher_id cambió
  })
})

describe('toStudentPhrases — solo {start,end,text}', () => {
  it('descarta la selección del profe y cualquier otro campo', () => {
    expect(toStudentPhrases([{ start: 1, end: 2, text: 'Hi', sel: true, nota: 'privada' }]))
      .toEqual([{ start: 1, end: 2, text: 'Hi' }])
  })

  it('tolera datos rotos: no-array → [], frases mal formadas se saltean', () => {
    expect(toStudentPhrases(null)).toEqual([])
    expect(toStudentPhrases({ start: 1 })).toEqual([])
    expect(toStudentPhrases([null, 3, { start: '1', end: 2, text: 'x' }, { start: 0, end: 1, text: 'ok' }]))
      .toEqual([{ start: 0, end: 1, text: 'ok' }])
  })
})
