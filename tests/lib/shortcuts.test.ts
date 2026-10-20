// @vitest-environment jsdom
// Paso 5 — la ayuda de atajos y modos del player del profe: textos y cuándo NO disparar un atajo.
import { describe, it, expect } from 'vitest'
import { KB_IGNORE_ATTR, MODE_HELP, PRACTICE_NEEDS_SELECTION, SHORTCUTS, SHORTCUTS_NOTE, shouldIgnoreShortcut } from '@/lib/shortcuts'

describe('shouldIgnoreShortcut', () => {
  const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d.firstElementChild as HTMLElement }
  it('mientras se escribe: input, textarea, select y contenteditable', () => {
    for (const html of ['<input>', '<textarea></textarea>', '<select></select>']) expect(shouldIgnoreShortcut(el(html))).toBe(true)
    const ce = el('<div contenteditable="true"></div>')
    Object.defineProperty(ce, 'isContentEditable', { value: true })
    expect(shouldIgnoreShortcut(ce)).toBe(true)
  })
  it(`con el foco en la ayuda (o adentro de algo con ${KB_IGNORE_ATTR})`, () => {
    const box = el(`<div ${KB_IGNORE_ATTR}><button>Atajos</button></div>`)
    expect(shouldIgnoreShortcut(box)).toBe(true)
    expect(shouldIgnoreShortcut(box.querySelector('button'))).toBe(true)
  })
  it('en cualquier otro lado (el cuerpo, un botón del player), los atajos andan', () => {
    expect(shouldIgnoreShortcut(document.body)).toBe(false)
    expect(shouldIgnoreShortcut(el('<button>Loop</button>'))).toBe(false)
    expect(shouldIgnoreShortcut(null)).toBe(false)
    expect(shouldIgnoreShortcut(window)).toBe(false)
  })
})

describe('textos de la ayuda', () => {
  const all = [
    ...SHORTCUTS.flatMap((s) => [s.keys, s.name, s.what, s.help]),
    SHORTCUTS_NOTE, PRACTICE_NEEDS_SELECTION, ...Object.values(MODE_HELP),
  ]
  it('los cinco atajos del player, con el "mantené apretado" de ← y →', () => {
    expect(SHORTCUTS.map((s) => s.keys)).toEqual(['Espacio', '→', '←', '↓', '↑'])
    expect(SHORTCUTS.find((s) => s.keys === '→')!.help).toMatch(/Mantené apretado → para avanzar rápido/)
    expect(SHORTCUTS.find((s) => s.keys === '←')!.help).toMatch(/Mantené apretado ← para retroceder rápido/)
  })
  it('los cuatro modos, con lo que pidió el dueño', () => {
    expect(MODE_HELP).toEqual({
      autoPause: 'Pausa sola al terminar cada frase, para repetir o explicar.',
      practice: 'Reproduce solo las frases que elegiste (tildadas).',
      loop: 'Repite la frase actual una y otra vez hasta que lo saques.',
      hide: 'Esconde el texto para escuchar sin leer.',
    })
  })
  it('sin emojis ni guiones largos', () => {
    for (const t of all) {
      expect(t).not.toMatch(/[—–]/)
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})
