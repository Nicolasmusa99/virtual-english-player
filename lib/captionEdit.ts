// Editar un subtítulo tocándolo en el video (player del profe, 2026-11): el texto, el inicio
// y el final al milisegundo, y DIVIDIR la frase en dos eligiendo dónde corta el texto (el
// cursor) y en qué milésima corta el tiempo. Funciones PURAS: tests/lib/caption-edit.test.ts.
// Los tiempos son los de la FRASE (los del SRT); el video va corrido por el desfase (delay).
import { secToTs, timeToSec } from '@/lib/srt'

export type CaptionDraft = { text: string; start: number; end: number }

// Redondeo al milisegundo (sin errores de coma flotante: 1.1 + 0.2).
export const round3 = (s: number) => Math.round(s * 1000) / 1000

// '1:15,250' (minutos:segundos,milésimas) — mismo formato que la edición de la lista.
export const fmtPrecise = (sec: number) => secToTs(round3(Math.max(0, sec)))

// Lo que escribió el profe → segundos. Acepta 'M:SS,mmm', 'H:MM:SS,mmm' (o con punto) y
// 'SS,mmm'. Cualquier otra cosa → null.
export function parsePrecise(raw: string): number | null {
  const s = raw.trim()
  if (!/^(\d+:)?(\d{1,2}:)?\d{1,2}([.,]\d{1,3})?$/.test(s)) return null
  const v = timeToSec(s)
  return Number.isFinite(v) && v >= 0 ? round3(v) : null
}

// Correr un tiempo (botones −0,1 / −0,01 / +0,01 / +0,1 s), sin bajar de 0.
export const nudgeTime = (sec: number, delta: number) => round3(Math.max(0, sec + delta))

// El momento del video → el tiempo de la frase (descontando el desfase), al milisegundo.
export const videoToPhraseTime = (videoT: number, delay: number) => round3(Math.max(0, videoT - delay))
export const phraseToVideoTime = (t: number, delay: number) => Math.max(0, t + delay)

export const CAPTION_ERRORS = {
  noText: 'Escribí el texto del subtítulo.',
  order: 'El inicio tiene que ser antes del final.',
  caret: 'Poné el cursor en el texto, entre las dos partes que querés separar.',
  cut: 'El corte tiene que quedar entre el inicio y el final de la frase.',
  short: 'Cada parte tiene que durar al menos 0,05 segundos.',
} as const
export const MIN_PART = 0.05

// Lo que está mal en el borrador, o null si se puede guardar.
export function draftCaptionError(d: CaptionDraft): string | null {
  if (!d.text.trim()) return CAPTION_ERRORS.noText
  if (!(d.start < d.end)) return CAPTION_ERRORS.order
  return null
}

// Dónde cortaría el tiempo, en proporción a dónde está el cursor en el texto (el punto de
// partida; el profe lo ajusta al milisegundo).
export function proposedCut(d: CaptionDraft, caret: number): number {
  const len = d.text.length
  if (len === 0) return round3((d.start + d.end) / 2)
  const f = Math.min(1, Math.max(0, caret / len))
  return round3(d.start + (d.end - d.start) * f)
}

// Las dos partes del texto según el cursor (sin espacios en los bordes).
export function splitText(text: string, caret: number): [string, string] {
  const c = Math.min(text.length, Math.max(0, caret))
  return [text.slice(0, c).trim(), text.slice(c).trim()]
}

// Dividir: [inicio, corte) con el texto antes del cursor y [corte, final) con el de después.
// Si algo no da, el mensaje de lo que hay que corregir.
export function splitCaption(d: CaptionDraft, caret: number, cut: number): [CaptionDraft, CaptionDraft] | string {
  const [before, after] = splitText(d.text, caret)
  if (!before || !after) return CAPTION_ERRORS.caret
  const c = round3(cut)
  if (!(c > d.start && c < d.end)) return CAPTION_ERRORS.cut
  if (c - d.start < MIN_PART || d.end - c < MIN_PART) return CAPTION_ERRORS.short
  return [{ text: before, start: round3(d.start), end: c }, { text: after, start: c, end: round3(d.end) }]
}
