// 2026-11 — editar el subtítulo en el video: funciones puras de lib/captionEdit.ts.
import { describe, it, expect } from 'vitest'
import {
  CAPTION_ERRORS, draftCaptionError, fmtPrecise, nudgeTime, parsePrecise, phraseToVideoTime, proposedCut, round3,
  splitCaption, splitText, videoToPhraseTime,
} from '@/lib/captionEdit'

const D = { text: 'Hey, where are we going?', start: 1.2, end: 3.7 }

describe('tiempos al milisegundo', () => {
  it('fmtPrecise / parsePrecise ida y vuelta', () => {
    expect(fmtPrecise(75.25)).toBe('1:15,250')
    expect(fmtPrecise(0.0004)).toBe('0:00,000')
    expect(parsePrecise('1:15,250')).toBe(75.25)
    expect(parsePrecise(' 0:03.5 ')).toBe(3.5)
    expect(parsePrecise('1:02:03,007')).toBe(3723.007)
    expect(parsePrecise('12,345')).toBe(12.345)
    for (const bad of ['', 'abc', '1:15,2500', '-1:00', '1::2']) expect(parsePrecise(bad)).toBeNull()
  })
  it('nudgeTime: de a 0,01 / 0,1 s sin errores de coma flotante y sin bajar de 0', () => {
    expect(nudgeTime(1.1, 0.2)).toBe(1.3)
    expect(nudgeTime(1.23, 0.01)).toBe(1.24)
    expect(nudgeTime(0.05, -0.1)).toBe(0)
    expect(round3(0.1 + 0.2)).toBe(0.3)
  })
  it('video ↔ frase con el desfase', () => {
    expect(videoToPhraseTime(5.1234, 0.5)).toBe(4.623)
    expect(videoToPhraseTime(0.2, 0.5)).toBe(0)
    expect(phraseToVideoTime(4.623, 0.5)).toBeCloseTo(5.123)
  })
})

describe('validar y dividir', () => {
  it('draftCaptionError', () => {
    expect(draftCaptionError(D)).toBeNull()
    expect(draftCaptionError({ ...D, text: '   ' })).toBe(CAPTION_ERRORS.noText)
    expect(draftCaptionError({ ...D, end: 1.2 })).toBe(CAPTION_ERRORS.order)
  })
  it('proposedCut: en proporción a dónde está el cursor', () => {
    expect(proposedCut(D, 0)).toBe(1.2)
    expect(proposedCut(D, D.text.length)).toBe(3.7)
    expect(proposedCut({ text: 'abcd', start: 0, end: 2 }, 1)).toBe(0.5)
  })
  it('splitText: las dos partes, sin espacios en los bordes', () => {
    expect(splitText(D.text, 15)).toEqual(['Hey, where are', 'we going?'])
    expect(splitText(D.text, -3)).toEqual(['', D.text])
  })
  it('splitCaption: corta el texto en el cursor y el tiempo en la milésima elegida', () => {
    expect(splitCaption(D, 15, 2.4567)).toEqual([
      { text: 'Hey, where are', start: 1.2, end: 2.457 },
      { text: 'we going?', start: 2.457, end: 3.7 },
    ])
  })
  it('splitCaption: lo que no se puede', () => {
    expect(splitCaption(D, 0, 2)).toBe(CAPTION_ERRORS.caret)
    expect(splitCaption(D, D.text.length, 2)).toBe(CAPTION_ERRORS.caret)
    expect(splitCaption(D, 15, 1.2)).toBe(CAPTION_ERRORS.cut)
    expect(splitCaption(D, 15, 4)).toBe(CAPTION_ERRORS.cut)
    expect(splitCaption(D, 15, 1.23)).toBe(CAPTION_ERRORS.short)
    expect(splitCaption(D, 15, 3.68)).toBe(CAPTION_ERRORS.short)
  })
})
