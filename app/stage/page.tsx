'use client'
import { useRef, useState, useEffect, useMemo } from 'react'
import { hl } from '@/lib/hl'
import { StageChannel } from '@/lib/stageChannel'

// US-037 / US-038: Stage view — video + subtitle overlay only. No controls.
// Receives PanelCmd via BroadcastChannel; emits timeupdate back to panel.
// SCR-023, SCR-024.
export default function Stage() {
  const vidRef = useRef<HTMLVideoElement>(null)
  const channelRef = useRef<StageChannel | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [subText, setSubText] = useState('')
  const [subVisible, setSubVisible] = useState(false)
  const subNodes = useMemo(() => hl(subText), [subText])

  useEffect(() => {
    const ch = new StageChannel()
    channelRef.current = ch

    const unsub = ch.onMessage(msg => {
      const v = vidRef.current
      if (!v) return
      switch (msg.type) {
        case 'load_blob': {
          // BroadcastChannel uses structured clone, which supports Blob.
          // We create the object URL here, in the stage's document context —
          // object URLs are per-document, so the panel's blob URL is unusable here.
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          const url = URL.createObjectURL(msg.blob)
          objectUrlRef.current = url
          v.src = url
          v.currentTime = msg.currentTime
          v.playbackRate = msg.playbackRate
          if (!msg.ccOn) { setSubVisible(false); setSubText('') }
          break
        }
        case 'play':    v.play().catch(() => {}); break
        case 'pause':   v.pause(); break
        case 'seek':    v.currentTime = msg.time; break
        case 'speed':   v.playbackRate = msg.rate; break
        case 'subtitle':
          setSubText(msg.text)
          setSubVisible(msg.visible)
          break
        case 'close':   window.close(); break
      }
    })

    const v = vidRef.current
    const onTU = () => {
      const vid = vidRef.current
      if (!vid || !vid.duration) return
      ch.send({ type: 'timeupdate', currentTime: vid.currentTime, duration: vid.duration, isPlaying: !vid.paused })
    }
    v?.addEventListener('timeupdate', onTU)

    return () => {
      unsub()
      v?.removeEventListener('timeupdate', onTU)
      ch.send({ type: 'closed' })
      ch.close()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative', overflow: 'hidden' }}>
      <video
        ref={vidRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {subVisible && subText && (
        <div style={{
          position: 'absolute', bottom: '8%', left: 0, right: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.75)', color: '#fff',
            padding: '6px 16px', borderRadius: 4,
            fontSize: 'clamp(14px, 2.5vw, 28px)', lineHeight: 1.4,
            maxWidth: '80%', textAlign: 'center',
          }}>
            {subNodes}
          </div>
        </div>
      )}
    </div>
  )
}
