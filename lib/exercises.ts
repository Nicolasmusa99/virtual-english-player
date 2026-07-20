// VE Drills (Bloque 14)
import type { Phrase } from './srt'

export type Level    = 'beginner' | 'intermediate' | 'advanced'
export type Scope    = 'sel' | 'all'
export type GenState = 'idle' | 'generating' | 'ready' | 'error'

export interface QuizItem {
  question:    string
  options:     [string, string, string, string]
  correct:     number
  explanation: string
}

export interface ClozeItem {
  sentence: string
  answer:   string
}

export interface MatchItem {
  term:       string
  definition: string
}

export interface ExerciseSet {
  quiz:  QuizItem[]
  cloze: ClozeItem[]
  match: MatchItem[]
}

export function resolveScope(phrases: Phrase[], scope: Scope): Phrase[] {
  if (scope === 'sel') {
    const sel = phrases.filter(p => p.sel)
    return sel.length > 0 ? sel : phrases
  }
  return phrases
}

// Bloque 15
export type ExerciseMode = 'video' | 'topic' | 'both'
export type PdfType    = 'quiz' | 'cloze' | 'match'
export type PdfVersion = 'student' | 'teacher' | 'both'
