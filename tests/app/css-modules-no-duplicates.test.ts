// @vitest-environment node
// Un CSS module NO puede definir dos veces la misma clase suelta (fuera de @media).
// Pasó en prod: la bolita de la barra de tiempo del alumno se llamó `.thumb`, igual que
// la miniatura de las tarjetas del inicio; la segunda regla pisó a la primera y las
// miniaturas se volvieron círculos de 16 px fuera de lugar. Las redefiniciones dentro
// de @media (ajustes de celular) son a propósito y no cuentan.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(process.cwd(), 'app')

function moduleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? moduleFiles(join(dir, e.name)) : e.name.endsWith('.module.css') ? [join(dir, e.name)] : [])
}

// Texto del CSS sin comentarios y sin los bloques @media / @supports (con sus llaves anidadas).
function topLevelCss(css: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  while (i < src.length) {
    if (src[i] === '@') {
      const open = src.indexOf('{', i)
      const semi = src.indexOf(';', i)
      if (open === -1 || (semi !== -1 && semi < open)) { i = semi === -1 ? src.length : semi + 1; continue }
      let depth = 1
      let j = open + 1
      while (j < src.length && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++ }
      i = j
      continue
    }
    out += src[i++]
  }
  return out
}

// Clases definidas como selector suelto: ".x {" o ".x, .y {" (no ".x:hover", ".a .x").
function standaloneClassDefs(css: string): string[] {
  const names: string[] = []
  for (const m of topLevelCss(css).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const sel of m[1].split(',')) {
      const s = sel.trim()
      if (/^\.[\w-]+$/.test(s)) names.push(s.slice(1))
    }
  }
  return names
}

describe('CSS modules: ninguna clase suelta definida dos veces', () => {
  it('el detector encuentra el caso que rompió prod (.thumb dos veces)', () => {
    const css = '.thumb { width: 64px; }\n.x:hover { a: b }\n@media (max-width: 1px) { .thumb { width: 1px } }\n.thumb { width: 16px; }'
    const defs = standaloneClassDefs(css)
    expect(defs.filter((n) => n === 'thumb')).toHaveLength(2)
  })

  for (const file of moduleFiles(APP)) {
    it(file.replace(process.cwd(), '').replace(/\\/g, '/'), () => {
      const defs = standaloneClassDefs(readFileSync(file, 'utf8'))
      const dups = [...new Set(defs.filter((n, i) => defs.indexOf(n) !== i))]
      expect(dups, `clases definidas más de una vez: ${dups.join(', ')}`).toEqual([])
    })
  }
})
