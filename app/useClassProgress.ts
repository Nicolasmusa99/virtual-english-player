'use client'
// Avance en CLASE (2026-11): mientras el profe le muestra un video a un alumno, guarda dónde
// van (PUT /api/videos/[id]/class-progress). Cada PROGRESS_SAVE_MS mientras reproduce, al
// pausar, al cambiar de alumno o de video, al salir del player y al cerrar la pestaña.
// La posición la da `getPosition` (el <video> del player, o la ventana para Zoom si está
// abierta). Se recuerda la última posición buena porque al salir el video ya volvió a 0.
import { useEffect, useRef } from 'react'
import { PROGRESS_SAVE_MS, shouldSaveProgress } from '@/lib/progressView'

const TICK_MS = 1000

export function useClassProgress(opts: {
  videoId: string | null
  studentId: string | null
  playing: boolean
  getPosition: () => number | null | undefined
}) {
  const { videoId, studentId, playing } = opts
  const getPos = useRef(opts.getPosition)
  getPos.current = opts.getPosition
  const playingRef = useRef(playing)
  playingRef.current = playing
  const lastPos = useRef<number | null>(null)
  const lastSaved = useRef<number | null>(null)
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    lastPos.current = null
    lastSaved.current = null
    if (!videoId || !studentId) { saveRef.current = () => {}; return }
    const read = () => { const p = getPos.current(); if (p != null && Number.isFinite(p) && p > 0) lastPos.current = p }
    const save = () => {
      read()
      const pos = lastPos.current
      if (pos == null || !shouldSaveProgress(pos, lastSaved.current)) return
      lastSaved.current = pos
      fetch(`/api/videos/${encodeURIComponent(videoId)}/class-progress`, {
        method: 'PUT', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, position: pos }),
      }).catch(() => {})
    }
    saveRef.current = save
    let sinceSave = 0
    const tick = setInterval(() => {
      if (!playingRef.current) return
      read()
      sinceSave += TICK_MS
      if (sinceSave >= PROGRESS_SAVE_MS) { sinceSave = 0; save() }
    }, TICK_MS)
    window.addEventListener('pagehide', save)
    return () => {
      save() // cambio de alumno o de video, o salir del player
      clearInterval(tick)
      window.removeEventListener('pagehide', save)
    }
  }, [videoId, studentId])

  // Al pausar, guardar en el momento.
  useEffect(() => { if (!playing) saveRef.current() }, [playing])
}
