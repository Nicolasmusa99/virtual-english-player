// Bloque 15 — VE Drills PDF generation (pure functions, no jsPDF dependency)
import type { ExerciseSet, PdfType } from './exercises'

export interface PdfBlock {
  heading: string
  lines:   string[]
}

/** Student sheet: questions without answers, blank blanks, unmatched terms */
export function buildStudentContent(ex: ExerciseSet, types: PdfType[]): PdfBlock[] {
  const blocks: PdfBlock[] = []

  if (types.includes('quiz')) {
    const lines: string[] = []
    ex.quiz.forEach((q, qi) => {
      lines.push(`${qi + 1}. ${q.question}`)
      q.options.forEach((opt, oi) => lines.push(`   ${String.fromCharCode(65 + oi)}. ${opt}`))
      lines.push('')
    })
    blocks.push({ heading: 'Quiz', lines })
  }

  if (types.includes('cloze')) {
    const lines: string[] = []
    ex.cloze.forEach((c, ci) => lines.push(`${ci + 1}. ${c.sentence}`))
    blocks.push({ heading: 'Fill in the Blanks', lines })
  }

  if (types.includes('match')) {
    const terms = ex.match.map(m => m.term)
    const defs  = ex.match.map(m => m.definition).sort()
    const lines: string[] = [
      'Terms:',
      ...terms.map((t, i) => `   ${i + 1}. ${t}`),
      '',
      'Definitions:',
      ...defs.map((d, i) => `   ${String.fromCharCode(65 + i)}. ${d}`),
    ]
    blocks.push({ heading: 'Match', lines })
  }

  return blocks
}

/** Teacher key: correct answers marked, explanations included, filled blanks, matched pairs */
export function buildTeacherContent(ex: ExerciseSet, types: PdfType[]): PdfBlock[] {
  const blocks: PdfBlock[] = []

  if (types.includes('quiz')) {
    const lines: string[] = []
    ex.quiz.forEach((q, qi) => {
      lines.push(`${qi + 1}. ${q.question}`)
      q.options.forEach((opt, oi) => {
        const mark = oi === q.correct ? ' ✓' : ''
        lines.push(`   ${String.fromCharCode(65 + oi)}. ${opt}${mark}`)
      })
      lines.push(`   → ${q.explanation}`)
      lines.push('')
    })
    blocks.push({ heading: 'Quiz (Answer Key)', lines })
  }

  if (types.includes('cloze')) {
    const lines: string[] = ex.cloze.map(
      (c, ci) => `${ci + 1}. ${c.sentence.replace('___', `[${c.answer}]`)}`
    )
    blocks.push({ heading: 'Fill in the Blanks (Answer Key)', lines })
  }

  if (types.includes('match')) {
    const lines = ex.match.map((m, mi) => `${mi + 1}. ${m.term}  →  ${m.definition}`)
    blocks.push({ heading: 'Match (Answer Key)', lines })
  }

  return blocks
}
