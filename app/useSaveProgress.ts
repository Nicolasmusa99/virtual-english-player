'use client'
// Avance del alumno (2026-11): guarda dónde va el alumno en el video, sin mostrarle nada.
// Cada PROGRESS_SAVE_MS mientras reproduce, al pausar o terminar, al esconder la pestaña
// y al salir del player. `keepalive` para que el último guardado llegue aunque se cierre.
import { useEffect, useRef, type RefObject } from 'react'
import { PROGRESS_SAVE_MS, shouldSaveProgress } from '@/lib/progressView'

export function useSaveProgress(videoRef: RefObject<HTMLVideoElement | null>, videoId: string) {
  const lastSaved = useRef<number | null>(null)

  useEffect(() => {
    lastSaved.current = null
    // El <video> se toma acá: al desmontar, el ref ya está en null cuando corre la limpieza.
    const v = videoRef.current
    const save = () => {
      if (!v || !videoId) return
      const pos = v.ended && Number.isFinite(v.duration) ? v.duration : v.currentTime
      if (!shouldSaveProgress(pos, lastSaved.current)) return
      lastSaved.current = pos
      fetch(`/api/student/material/${encodeURIComponent(videoId)}/progress`, {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: pos }),
      }).catch(() => {})
    }
    const timer = setInterval(() => { if (v && !v.paused) save() }, PROGRESS_SAVE_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') save() }
    v?.addEventListener('pause', save)
    v?.addEventListener('ended', save)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      save() // salir del player (volver a "Mi material")
      clearInterval(timer)
      v?.removeEventListener('pause', save)
      v?.removeEventListener('ended', save)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [videoRef, videoId])
}
