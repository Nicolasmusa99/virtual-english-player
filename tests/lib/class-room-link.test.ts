// Calendario (G0) — "Mi sala de Zoom": withRoomLink (lib/classes.ts) y la columna nueva.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'

vi.mock('@/lib/db', () => ({ db: {} }))
import { withRoomLink } from '@/lib/classes'
import { users } from '@/lib/db/schema'
import type { ClassItem } from '@/lib/classSchedule'

const c = (key: string, meetUrl: string | null): ClassItem => ({
  key, seriesId: null, eventId: key, startsAt: new Date('2026-10-01T20:00:00Z'), durationMin: 60, meetUrl, status: 'scheduled', originalStartsAt: null,
})
const ROOM = 'https://us02web.zoom.us/j/8412345678'

describe('withRoomLink', () => {
  it('las clases SIN link usan la sala del profe; las que tienen link propio lo conservan', () => {
    const out = withRoomLink([c('a', null), c('b', 'https://meet.google.com/x')], ROOM)
    expect(out.map((x) => x.meetUrl)).toEqual([ROOM, 'https://meet.google.com/x'])
  })
  it('sin sala cargada no cambia nada (y no muta la lista original)', () => {
    const list = [c('a', null)]
    expect(withRoomLink(list, null)).toBe(list)
    withRoomLink(list, ROOM)
    expect(list[0].meetUrl).toBeNull()
  })
})

describe('0003_zoom_url.sql ≡ schema', () => {
  it('"user".zoom_url: text, nullable, en los dos lados', () => {
    const col = getTableConfig(users).columns.find((x) => x.name === 'zoom_url')
    expect(col?.getSQLType()).toBe('text')
    expect(col?.notNull).toBe(false)
    const sql = readFileSync(join(process.cwd(), 'drizzle', '0003_zoom_url.sql'), 'utf8')
    expect(sql).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS zoom_url text;')
  })
})
