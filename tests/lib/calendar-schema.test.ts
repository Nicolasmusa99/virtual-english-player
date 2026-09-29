// @vitest-environment node
// Calendario (C1) — el SQL manual (drizzle/0002_calendario.sql) y el esquema de Drizzle
// (lib/db/schema.ts) tienen que describir LAS MISMAS tablas: mismas columnas, mismo
// NOT NULL, mismas FKs con su ON DELETE. Sin base de datos (CI-safe).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { classEvents, classSeries, classStatus } from '@/lib/db/schema'

const SQL = readFileSync(join(process.cwd(), 'drizzle', '0002_calendario.sql'), 'utf8')

// Columnas de un CREATE TABLE del .sql: nombre → { notNull, ref, onDelete }.
function sqlColumns(table: string) {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(SQL)
  if (!m) throw new Error('no está ' + table)
  const out: Record<string, { notNull: boolean; ref: string | null; onDelete: string | null }> = {}
  for (const raw of m[1].split('\n')) {
    const line = raw.trim().replace(/,$/, '')
    if (!line || line.startsWith('CONSTRAINT') || line.startsWith('--')) continue
    const name = line.split(/\s+/)[0]
    const ref = /REFERENCES "?(\w+)"?\(id\)/.exec(line)?.[1] ?? null
    const onDelete = /ON DELETE (CASCADE|SET NULL)/.exec(line)?.[1] ?? null
    out[name] = { notNull: /NOT NULL|PRIMARY KEY/.test(line), ref, onDelete }
  }
  return out
}

function drizzleColumns(t: PgTable) {
  const cfg = getTableConfig(t)
  const out: Record<string, { notNull: boolean; ref: string | null; onDelete: string | null }> = {}
  for (const c of cfg.columns) out[c.name] = { notNull: c.notNull, ref: null, onDelete: null }
  for (const fk of cfg.foreignKeys) {
    const r = fk.reference()
    out[r.columns[0].name].ref = getTableConfig(r.foreignTable).name
    out[r.columns[0].name].onDelete = (fk.onDelete ?? '').toUpperCase() || null
  }
  return out
}

describe('0002_calendario.sql ≡ lib/db/schema.ts', () => {
  for (const t of [classSeries, classEvents]) {
    const name = getTableConfig(t).name
    it(`${name}: mismas columnas, NOT NULL y FKs (con ON DELETE)`, () => {
      expect(sqlColumns(name)).toEqual(drizzleColumns(t))
    })
  }
  it('enum class_status con los mismos valores', () => {
    expect(SQL).toContain(`CREATE TYPE class_status AS ENUM (${classStatus.enumValues.map((v) => `'${v}'`).join(', ')})`)
  })
  it('unique (series_id, original_starts_at) e índices en los dos lados', () => {
    const cfgE = getTableConfig(classEvents)
    expect(cfgE.uniqueConstraints.map((u) => u.name)).toContain('class_events_series_original_uq')
    expect(SQL).toContain('CONSTRAINT class_events_series_original_uq UNIQUE (series_id, original_starts_at)')
    const idx = [...getTableConfig(classSeries).indexes, ...cfgE.indexes].map((i) => i.config.name)
    for (const n of idx) expect(SQL, n).toContain(`CREATE INDEX IF NOT EXISTS ${n} `)
    expect(idx).toHaveLength(2)
  })
})
