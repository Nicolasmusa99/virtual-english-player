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

  it('resalta palabras de más de 3 chars que no están en SKIP', () => {
    const el = hlContainer('beautiful')
    const spans = el.querySelectorAll('span[style]')
    expect(spans).toHaveLength(1)
    expect(spans[0].textContent).toBe('beautiful')
  })

  it('resalta solo algunas palabras en frase mixta', () => {
    const el = hlContainer('the quick fox')
    const spans = el.querySelectorAll('span[style]')
    expect(spans).toHaveLength(1)
    expect(spans[0].textContent).toBe('quick')
    expect(el.textContent).toBe('the quick fox')
  })

  it('ignora puntuación al decidir si resaltar', () => {
    const el = hlContainer('hello,')
    const spans = el.querySelectorAll('span[style]')
    expect(spans).toHaveLength(1)
    expect(spans[0].textContent).toBe('hello,')
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
