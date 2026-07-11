import { vi } from 'vitest'

// Minimal chainable stand-in for the subset of the Drizzle query builder our
// routes use. Every method returns the same chain object so calls compose in
// any order; awaiting the chain resolves via `.then`, driven by `__rows`.
// `.returning()` / `.onConflictDoUpdate()` resolve independently since they
// are always the terminal call for insert/upsert statements.
export function createDbChain() {
  const chain: any = { __rows: [] as unknown[] }
  const passthrough = ['select', 'from', 'leftJoin', 'where', 'orderBy', 'insert', 'values', 'update', 'set', 'delete']
  passthrough.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.returning = vi.fn(() => Promise.resolve(chain.__rows))
  chain.onConflictDoUpdate = vi.fn(() => Promise.resolve(chain.__rows))
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(chain.__rows).then(resolve, reject)
  return chain
}
