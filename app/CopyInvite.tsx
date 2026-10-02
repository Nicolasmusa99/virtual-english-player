'use client'
// Calendario (G3 liviano) — "Copiar invitación": copia al portapapeles el texto de
// lib/invite.ts (día, hora y link de Zoom) para pegarlo en WhatsApp. Si el navegador no
// deja copiar, muestra el texto seleccionado para copiarlo a mano.
import { useEffect, useState } from 'react'

export const INVITE_TEXTS = { copy: 'Copiar invitación', copied: '¡Invitación copiada!', manual: 'Invitación para copiar' } as const

export default function CopyInvite({ text, className, okClassName }: { text: string; className?: string; okClassName?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const t = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(t)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('manual')
    }
  }

  if (state === 'manual') {
    return (
      <textarea readOnly autoFocus aria-label={INVITE_TEXTS.manual} value={text} rows={4}
        onFocus={(e) => e.currentTarget.select()} onBlur={() => setState('idle')}
        style={{ width: '100%', maxWidth: 420, font: '14px var(--font-sans)', padding: 8, borderRadius: 4 }} />
    )
  }
  return (
    <span aria-live="polite">
      <button type="button" onClick={copy} className={`${className ?? ''} ${state === 'copied' ? okClassName ?? '' : ''}`}>
        {state === 'copied' ? INVITE_TEXTS.copied : INVITE_TEXTS.copy}
      </button>
    </span>
  )
}
