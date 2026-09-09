import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom doesn't implement scrollIntoView — stub it globally so tests that trigger
// curIdx changes (and therefore the [curIdx] scroll effect) don't throw.
// Guard: this file also runs in node-environment tests (API routes) where window is absent.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {}
}

// app/page.tsx calls useSession() unconditionally (Bloque 13 — biblioteca).
// Component tests render <Player /> in isolation, without app/layout.tsx's
// <SessionProvider>, so next-auth/react throws unless it's mocked globally here.
// Default is authenticated AS ADMIN: la mayoría de los tests ejercitan el flujo
// de subida/player, que desde "el profe no sube" es admin-only (el dropzone solo
// renderiza para admin). Tests de rol específico setean su propio valor.
export const useSessionMock = vi.fn((): { data: unknown; status: string } => ({ data: { user: { email: 'test@example.com', role: 'admin' } }, status: 'authenticated' }))
export const signInMock = vi.fn()
export const signOutMock = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
  signIn: signInMock,
  signOut: signOutMock,
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))
