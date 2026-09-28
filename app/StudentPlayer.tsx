'use client'
// Player del ALUMNO (fase vista-alumno, E3). SOLO: play/pausa, stop, volumen − / +
// y una barra de tiempo para MIRAR (no se puede adelantar). Subtítulos del profe
// SIEMPRE visibles (sin botón para apagarlos), con el delay que él configuró.
// Es un componente aparte a propósito: el player del profe (page.tsx) no se toca.
import { useEffect, useRef, useState } from 'react'
import styles from './student.module.css'
import { fmtTime } from '@/lib/srt'
import { hl } from '@/lib/hl'
import {
  displayVideoName, phraseAt, progressPct, stepVolume, volumeBarsOn, VOLUME_BARS,
} from '@/lib/studentView'
import type { StudentPhrase } from '@/lib/assignments'

export type StudentVideoData = {
  id: string
  originalName: string
  storageUrl: string
  durationSec: number | null
  phrases: StudentPhrase[]
  delay: number
}

export const PLAYER_TEXTS = {
  back: '← Mi material',
  play: 'Play',
  pause: 'Pausa',
  stop: 'Stop',
  volume: 'Volumen',
  volDown: 'Bajar volumen',
  volUp: 'Subir volumen',
  time: 'Tiempo del video',
  videoError: 'No se pudo reproducir el video. Probá de nuevo más tarde.',
} as const

export default function StudentPlayer({ data, onBack }: { data: StudentVideoData; onBack: () => void }) {
  const vidRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(data.durationSec ?? 0)
  const [volume, setVolume] = useState(1)
  const [sub, setSub] = useState('')
  const [error, setError] = useState(false)

  // Subtítulos y tiempo al ritmo del video: un loop de requestAnimationFrame mientras
  // reproduce (timeupdate solo es demasiado grueso para los subtítulos) + una
  // actualización suelta en pausa / stop / fin.
  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    let raf = 0
    const update = () => {
      setTime(v.currentTime)
      setSub(phraseAt(data.phrases, v.currentTime, data.delay))
    }
    const loop = () => { update(); if (!v.paused && !v.ended) raf = requestAnimationFrame(loop) }
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop) }
    const onStop = () => { setPlaying(false); cancelAnimationFrame(raf); update() }
    const onMeta = () => { if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration) }
    const onError = () => setError(true)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onStop)
    v.addEventListener('ended', onStop)
    v.addEventListener('seeked', update)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('error', onError)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onStop)
      v.removeEventListener('ended', onStop)
      v.removeEventListener('seeked', update)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('error', onError)
    }
  }, [data])

  function togglePlay() {
    const v = vidRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  // Stop = pausa y vuelve al principio.
  function stop() {
    const v = vidRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
    setTime(0)
    setSub(phraseAt(data.phrases, 0, data.delay))
  }

  function changeVolume(dir: 1 | -1) {
    const next = stepVolume(volume, dir)
    setVolume(next)
    if (vidRef.current) vidRef.current.volume = next
  }

  const pct = progressPct(time, duration)
  const barsOn = volumeBarsOn(volume)

  return (
    <div className={styles.player}>
      <header className={styles.pBar}>
        <button type="button" className={styles.back} onClick={onBack}>{PLAYER_TEXTS.back}</button>
        <span className={styles.pTitle}>{displayVideoName(data.originalName)}</span>
      </header>

      <div className={styles.pStage}>
        <video ref={vidRef} src={data.storageUrl} className={styles.video} playsInline preload="metadata" />
        {sub && (
          <div className={styles.subOverlay}>
            <div className={styles.subBox} data-testid="student-sub">{hl(sub)}</div>
          </div>
        )}
        {error && <div role="alert" className={styles.pError}>{PLAYER_TEXTS.videoError}</div>}
      </div>

      <div className={styles.timeRow}>
        <span>{fmtTime(time)}</span>
        <div className={styles.track} role="progressbar" aria-label={PLAYER_TEXTS.time}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className={styles.fill} style={{ width: pct + '%' }} />
        </div>
        <span>{fmtTime(duration)}</span>
      </div>

      <div className={styles.ctrls}>
        <div className={styles.grp}>
          <button type="button" className={`${styles.cBtn} ${styles.playBtn}`} onClick={togglePlay}
            aria-label={playing ? PLAYER_TEXTS.pause : PLAYER_TEXTS.play}>
            {playing
              ? <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></svg>
              : <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4" fill="currentColor" /></svg>}
          </button>
          <span className={styles.lbl} aria-hidden="true">{playing ? PLAYER_TEXTS.pause : PLAYER_TEXTS.play}</span>
        </div>

        <div className={styles.grp}>
          <button type="button" className={styles.cBtn} onClick={stop} aria-label={PLAYER_TEXTS.stop}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          </button>
          <span className={styles.lbl} aria-hidden="true">{PLAYER_TEXTS.stop}</span>
        </div>

        <span className={styles.sep} aria-hidden="true" />

        <div className={`${styles.grp} ${styles.volGrp}`}>
          <div className={styles.vol}>
            <button type="button" className={styles.volBtn} onClick={() => changeVolume(-1)}
              disabled={volume <= 0} aria-label={PLAYER_TEXTS.volDown}>−</button>
            <div className={styles.meter} role="meter" aria-label={PLAYER_TEXTS.volume}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume * 100)}>
              {Array.from({ length: VOLUME_BARS }, (_, i) => (
                <i key={i} className={`${styles.bar} ${i < barsOn ? styles.barOn : ''}`} style={{ height: 6 + i * 2.7 }} />
              ))}
            </div>
            <button type="button" className={styles.volBtn} onClick={() => changeVolume(1)}
              disabled={volume >= 1} aria-label={PLAYER_TEXTS.volUp}>+</button>
          </div>
          <span className={styles.lbl} aria-hidden="true">{PLAYER_TEXTS.volume}</span>
        </div>
      </div>
    </div>
  )
}
