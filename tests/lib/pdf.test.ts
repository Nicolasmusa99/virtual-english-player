// Bloque 15 — TC-115 / TC-116
import { describe, it, expect } from 'vitest'
import { buildStudentContent, buildTeacherContent } from '@/lib/pdf'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'

const ALL: import('@/lib/exercises').PdfType[] = ['quiz', 'cloze', 'match']

describe('buildStudentContent — TC-115', () => {
  it('student quiz has no correct marker (✓) and no explanation', () => {
    const blocks = buildStudentContent(FAKE_EXERCISES, ['quiz'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    expect(text).not.toContain('✓')
    expect(text).not.toContain('→')
  })

  it('student cloze keeps ___ placeholder, does not fill the answer', () => {
    const blocks = buildStudentContent(FAKE_EXERCISES, ['cloze'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    expect(text).toContain('___')
    // none of the real answers should appear filled in
    for (const c of FAKE_EXERCISES.cloze) {
      expect(text).not.toContain(`[${c.answer}]`)
    }
  })

  it('student match lists terms and definitions separately (unmatched)', () => {
    const blocks = buildStudentContent(FAKE_EXERCISES, ['match'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    // Contains all terms
    for (const m of FAKE_EXERCISES.match) expect(text).toContain(m.term)
    // Contains all definitions
    for (const m of FAKE_EXERCISES.match) expect(text).toContain(m.definition)
    // But NOT in "term → definition" format
    expect(text).not.toMatch(/→/)
  })

  it('only requested types appear in the output', () => {
    const blocks = buildStudentContent(FAKE_EXERCISES, ['quiz'])
    const headings = blocks.map(b => b.heading)
    expect(headings).toContain('Quiz')
    expect(headings).not.toContain('Fill in the Blanks')
    expect(headings).not.toContain('Match')
  })
})

describe('buildTeacherContent — TC-116', () => {
  it('teacher quiz marks the correct option with ✓', () => {
    const blocks = buildTeacherContent(FAKE_EXERCISES, ['quiz'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    expect(text).toContain('✓')
  })

  it('teacher quiz includes explanations (→)', () => {
    const blocks = buildTeacherContent(FAKE_EXERCISES, ['quiz'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    expect(text).toContain('→')
    expect(text).toContain(FAKE_EXERCISES.quiz[0].explanation)
  })

  it('teacher cloze fills the blank with the answer', () => {
    const blocks = buildTeacherContent(FAKE_EXERCISES, ['cloze'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    // blank should be replaced
    expect(text).not.toContain('___')
    // answers should appear in brackets
    for (const c of FAKE_EXERCISES.cloze) expect(text).toContain(`[${c.answer}]`)
  })

  it('teacher match shows term → definition pairs', () => {
    const blocks = buildTeacherContent(FAKE_EXERCISES, ['match'])
    const text   = blocks.flatMap(b => b.lines).join('\n')
    for (const m of FAKE_EXERCISES.match) {
      expect(text).toContain(`${m.term}  →  ${m.definition}`)
    }
  })

  it('teacher shows all three types when all requested', () => {
    const blocks = buildTeacherContent(FAKE_EXERCISES, ALL)
    expect(blocks).toHaveLength(3)
  })
})
