// PostHog wrapper — no-op when __ve_posthog is not initialized.
// Initialize by assigning window.__ve_posthog = posthog after posthog.init().
declare global {
  interface Window {
    __ve_posthog?: { capture(event: string, props?: Record<string, unknown>): void }
  }
}

export function capture(event: string, props?: Record<string, unknown>): void {
  try {
    if (typeof window !== 'undefined' && window.__ve_posthog) {
      window.__ve_posthog.capture(event, props)
    }
  } catch {
    // swallow — analytics must never crash the app
  }
}
