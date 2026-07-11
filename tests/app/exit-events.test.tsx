// PostHog events — Bloque G: exit_confirmation_resolved
// Fires when the user resolves the exit dialog (all 3 buttons)
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import Player from '@/app/page'
import { capture } from '@/lib/capture'

vi.mock('@/lib/capture', () => ({ capture: vi.fn() }))

// ─── helpers ────────────────────────────────────────────────────────────────

function tick(ms = 50) { return new Promise<void>(r => setTimeout(r, ms)) }

const SRT_2 =
  '1\n00:00:01,000 --> 00:00:03,000\nPhrase one\n\n' +
  '2\n00:00:04,000 --> 00:00:06,000\nPhrase two\n'

async function loadIntoPlayer(container: HTMLElement) {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const videoFile = new File(['fake-video-data'], 'test.mp4', { type: 'video/mp4' })
  const srtFile   = new File([SRT_2], 'test.srt', { type: 'text/plain' })
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(fileInput, { target: { files: [videoFile, srtFile] } })
    await tick(150)
  })
}

// Makes isDirty=true by clicking "Ninguna" and opens the exit dialog
async function openExitDialog(container: HTMLElement) {
  // Make a change to set isDirty=true
  const ningunaBtn = Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Ninguna')
  await act(async () => { fireEvent.click(ningunaBtn!); await tick(30) })

  // Click "← Cargar otro" to trigger handleExitAttempt
  const exitBtn = Array.from(container.querySelectorAll('button'))
    .find(b => /cargar otro/i.test(b.textContent ?? ''))
  await act(async () => { fireEvent.click(exitBtn!); await tick(30) })

  // Verify the exit dialog is visible
  const dialog = container.querySelector('[class*="exitDialog"]') ||
    container.querySelector('[class*="exitOverlay"]')
  return dialog
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
  vi.mocked(capture).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// exit_confirmation_resolved
// ══════════════════════════════════════════════════════════════════════════════

describe('exit_confirmation_resolved', () => {
  it('fires { action: "download_and_exit" } when clicking "Descargar SRT y salir"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    await openExitDialog(container)
    vi.mocked(capture).mockClear()

    const downloadBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /descargar srt/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(downloadBtn!)
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('exit_confirmation_resolved', {
      action: 'download_and_exit',
    })
  })

  it('fires { action: "exit_without_saving" } when clicking "Salir sin guardar"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    await openExitDialog(container)
    vi.mocked(capture).mockClear()

    const exitBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /salir sin guardar/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(exitBtn!)
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('exit_confirmation_resolved', {
      action: 'exit_without_saving',
    })
  })

  it('fires { action: "cancel" } when clicking "Cancelar"', async () => {
    const { container } = render(<Player />)
    await loadIntoPlayer(container)
    await openExitDialog(container)
    vi.mocked(capture).mockClear()

    const cancelBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /^cancelar$/i.test(b.textContent ?? ''))
    await act(async () => {
      fireEvent.click(cancelBtn!)
      await tick(50)
    })

    expect(vi.mocked(capture)).toHaveBeenCalledWith('exit_confirmation_resolved', {
      action: 'cancel',
    })
  })
})
