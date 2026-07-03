import '@testing-library/jest-dom'

// jsdom doesn't implement scrollIntoView — stub it globally so tests that trigger
// curIdx changes (and therefore the [curIdx] scroll effect) don't throw.
// Guard: this file also runs in node-environment tests (API routes) where window is absent.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {}
}
