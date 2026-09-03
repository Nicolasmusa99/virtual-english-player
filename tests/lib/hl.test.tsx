import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { hl, SKIP } from '@/lib/hl'

function hlContainer(text: string): HTMLElement {
  const { container } = render(<span>{hl(text)}</span>)
  return container.firstChild as HTMLElement
}

// ─── Comportamiento base ──────────────────────────────────────────────────────

describe('hl() — comportamiento base', () => {
  it('devuelve array vacío para input vacío', () => {
    expect(hl('')).toEqual([])
  })

  it('no resalta palabras de 3 caracteres o menos', () => {
    const el = hlContainer('the cat')
    expect(el.querySelectorAll('span[style]')).toHaveLength(0)
    expect(el.textContent).toBe('the cat')
  })

  it('no resalta palabras del SKIP set', () => {
    const el = hlContainer('the and for')
    expect(el.querySelectorAll('span[style]')).toHaveLength(0)
    expect(SKIP.has('the')).toBe(true)
    expect(SKIP.has('and')).toBe(true)
    expect(SKIP.has('for')).toBe(true)
  })

  // [Corregida 2026-09-03] hl() ya NO resalta: los subtítulos van en blanco (US-014).
  it('no envuelve en span de color palabras largas fuera de SKIP', () => {
    const el = hlContainer('beautiful')
    expect(el.querySelectorAll('span[style]')).toHaveLength(0)
    expect(el.textContent).toBe('beautiful')
  })

  it('en frase mixta no aplica color a ninguna palabra', () => {
    const el = hlContainer('the quick fox')
    expect(el.querySelectorAll('span[style]')).toHaveLength(0)
    expect(el.textContent).toBe('the quick fox')
  })

  it('devuelve el texto plano tal cual (con puntuación) sin resaltar', () => {
    const el = hlContainer('hello,')
    expect(el.querySelectorAll('span[style]')).toHaveLength(0)
    expect(el.textContent).toBe('hello,')
  })
})

// ─── Seguridad XSS ───────────────────────────────────────────────────────────

describe('hl() — seguridad XSS', () => {
  it('devuelve ReactNode[] en lugar de string', () => {
    const result = hl('hello world')
    expect(Array.isArray(result)).toBe(true)
  })

  it('<script> en el input no aparece como string literal en el array de retorno', () => {
    const result = hl('<script>alert(1)</script>')
    expect(result).not.toContain('<script>')
  })

  it('tags HTML en el input no pasan como strings raw en el array de retorno', () => {
    const result = hl('<b>hello</b>')
    expect(result).not.toContain('<b>')
  })

  it('no inyecta <script> en el DOM al renderizar', () => {
    const el = hlContainer('<script>alert(1)</script>')
    expect(el.querySelector('script')).toBeNull()
    expect(el.innerHTML).not.toContain('<script>')
  })

  it('no inyecta tags HTML arbitrarios en el DOM al renderizar', () => {
    const el = hlContainer('<b>hello</b>')
    expect(el.querySelector('b')).toBeNull()
    expect(el.innerHTML).not.toContain('<b>')
  })
})
