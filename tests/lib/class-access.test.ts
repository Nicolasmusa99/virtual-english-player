// Calendario (C1) — quién gestiona las clases de quién (lib/classAccess.ts).
import { describe, it, expect } from 'vitest'
import { classScopeFor, rowScopeFor, CLASS_ERRORS } from '@/lib/classAccess'

const PROFE_A = { id: 'pa', role: 'profesor' as const }
const PROFE_B = { id: 'pb', role: 'profesor' as const }
const ADMIN = { id: 'ad', role: 'admin' as const }
const ALUMNO = { id: 'al', role: 'alumno' as const }
const SIN_ROL = { id: 'x', role: null }
const DE_A = { id: 'st-a', role: 'alumno' as const, teacherId: 'pa' }
const SIN_PROFE = { id: 'st-0', role: 'alumno' as const, teacherId: null }

describe('classScopeFor — agendar a un alumno', () => {
  it('profe → sus alumnos, a su nombre', () => {
    expect(classScopeFor(PROFE_A, DE_A)).toEqual({ ok: true, teacherId: 'pa' })
  })
  it('profe → alumno de otro profe: 403', () => {
    expect(classScopeFor(PROFE_B, DE_A)).toEqual({ ok: false, status: 403, error: CLASS_ERRORS.notYourStudent })
    expect(classScopeFor(PROFE_B, SIN_PROFE)).toMatchObject({ ok: false, status: 403 })
  })
  it('admin → cualquiera, a nombre del profe ACTUAL del alumno', () => {
    expect(classScopeFor(ADMIN, DE_A)).toEqual({ ok: true, teacherId: 'pa' })
  })
  it('admin → alumno sin profe: 400', () => {
    expect(classScopeFor(ADMIN, SIN_PROFE)).toEqual({ ok: false, status: 400, error: CLASS_ERRORS.noTeacher })
  })
  it('no existe o no es alumno → 404', () => {
    expect(classScopeFor(PROFE_A, null)).toMatchObject({ ok: false, status: 404 })
    expect(classScopeFor(ADMIN, { id: 'pa', role: 'profesor', teacherId: null })).toMatchObject({ ok: false, status: 404 })
  })
  it('alumno o sin rol → 403 (nunca gestiona)', () => {
    expect(classScopeFor(ALUMNO, DE_A)).toMatchObject({ ok: false, status: 403 })
    expect(classScopeFor(SIN_ROL, DE_A)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('rowScopeFor — tocar una serie / evento: todo lo que no es "sí" es el MISMO 404', () => {
  const ROW_A = { teacherId: 'pa', studentId: 'st-a' }
  const notFound = { ok: false, status: 404, error: CLASS_ERRORS.classNotFound }

  it('el profe de la fila, con su alumno → ok', () => {
    expect(rowScopeFor(PROFE_A, ROW_A, DE_A)).toEqual({ ok: true, teacherId: 'pa' })
    expect(rowScopeFor(ADMIN, ROW_A, DE_A)).toEqual({ ok: true, teacherId: 'pa' })
  })
  it('otro profe → 404 (no 403: no se revela que existe)', () => {
    expect(rowScopeFor(PROFE_B, ROW_A, DE_A)).toEqual(notFound)
  })
  it('fila del profe ANTERIOR del alumno → 404, ni el nuevo profe ni el admin la tocan', () => {
    const ahoraDeB = { ...DE_A, teacherId: 'pb' }
    expect(rowScopeFor(PROFE_A, ROW_A, ahoraDeB)).toEqual(notFound)
    expect(rowScopeFor(PROFE_B, ROW_A, ahoraDeB)).toEqual(notFound)
    expect(rowScopeFor(ADMIN, ROW_A, ahoraDeB)).toEqual(notFound)
  })
  it('no existe / alumno que no coincide con la fila → 404', () => {
    expect(rowScopeFor(PROFE_A, null, DE_A)).toEqual(notFound)
    expect(rowScopeFor(PROFE_A, ROW_A, null)).toEqual(notFound)
    expect(rowScopeFor(PROFE_A, ROW_A, { ...DE_A, id: 'otro' })).toEqual(notFound)
  })
  it('alumno o sin rol → 404', () => {
    expect(rowScopeFor(ALUMNO, ROW_A, DE_A)).toEqual(notFound)
    expect(rowScopeFor(SIN_ROL, ROW_A, DE_A)).toEqual(notFound)
  })
})
