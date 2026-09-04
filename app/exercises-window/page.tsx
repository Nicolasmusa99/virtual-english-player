'use client'
// Bloque 16 (US-055) — Autonomous exercises generator window.
// Receives phrases via ExercisesChannel (load_phrases) from the player.
// Once phrases are stored in React state the window is self-sufficient —
// it keeps working even after the player closes or navigates away.
import { useEffect, useState } from 'react'
import { ExercisesChannel } from '@/lib/exercisesChannel'
import ExercisesPanel from '../ExercisesPanel'
import type { Phrase } from '@/lib/srt'

interface WindowState {
  phrases: Phrase[]
  fileName: string
}

export default function ExercisesWindow() {
  const [state, setState] = useState<WindowState | null>(null)

  useEffect(() => {
    const ch = new ExercisesChannel()
    ch.send({ type: 'ready' })

    const unsub = ch.onMessage(msg => {
      if (msg.type === 'load_phrases') {
        const phrases: Phrase[] = msg.phrases.map((text, i) => ({
          start: i, end: i + 1, text, sel: false,
        }))
        setState({ phrases, fileName: msg.fileName })
      }
      // 'close' command: player is closing — keep our state, user can keep generating
    })

    const handleUnload = () => { ch.send({ type: 'closed' }) }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      unsub()
      window.removeEventListener('beforeunload', handleUnload)
      ch.close()
    }
  }, [])

  if (!state) {
    return (
      <div
        data-testid="exercises-waiting"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', fontFamily: 'monospace', color: 'var(--tx2)', fontSize: 13,
        }}
      >
        Esperando datos del reproductor…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <ExercisesPanel
        phrases={state.phrases}
        videoFileName={state.fileName}
        singleMode="video"
      />
    </div>
  )
}
