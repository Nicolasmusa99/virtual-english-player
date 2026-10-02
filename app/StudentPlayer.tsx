'use client'
// Player del ALUMNO (fase vista-alumno, E3): play/pausa, stop, volumen − / +, barra de
// tiempo que se toca o arrastra para ir a otro momento, y CC para prender / apagar los
// subtítulos del profe (arrancan prendidos; no se guarda). Los subtítulos llegan sin
// descripciones de sonido ("(music)"), limpiados en el servidor.
// Vista del alumno v2 — para practicar: "Anterior" / "Siguiente" van de frase en frase,
// "Repetir" vuelve a decir la frase y se frena al terminarla, "0,75×" lo pone más lento, y
// al costado el guion con la frase que suena en amarillo (tocar una frase lleva ahí). Con el
// teclado: ← / → cambian de frase, ↓ la repite, espacio pausa. En la barra de tiempo, la
// frase que suena también se marca en amarillo. Los subtítulos sobre el video siguen blancos.
// Es un componente aparte a propósito: el player del profe (page.tsx) no se toca.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './student.module.css'
import { fmtTime } from '@/lib/srt'
import { hl } from '@/lib/hl'
import {
  displayVideoName, lastStartedIndex, phraseAt, phraseEndAt, phraseIndexAt, phraseStartAt, phraseTarget, progressPct,
  SLOW_RATE, stepSeek, stepVolume, timeAtX, volumeBarsOn, VOLUME_BARS,
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
  prev: 'Frase anterior',
  prevLbl: 'Anterior',
  repeat: 'Repetir la frase',
  repeatLbl: 'Repetir',
  next: 'Frase siguiente',
  nextLbl: 'Siguiente',
  slow: 'Más lento (0,75×)',
  slowLbl: 'Más lento',
  slowBtn: '0,75×',
  volume: 'Volumen',
  volDown: 'Bajar volumen',
  volUp: 'Subir volumen',
  time: 'Tiempo del video',
  timeOf: (cur: string, total: string) => `${cur} de ${total}`,
  cc: 'Subtítulos',
  ccOn: 'Subtítulos: sí',
  ccOff: 'Subtítulos: no',
  script: 'Guion',
  phraseOf: (i: number, n: number) => `Frase ${i} de ${n}`,
  phrases: (n: number) => (n === 1 ? '1 frase' : `${n} frases`),
  noScript: 'Este video no tiene guion.',
  keys: 'Con el teclado: ← y → cambian de frase, ↓ la repite y la barra espaciadora pausa.',
  videoError: 'No se pudo reproducir el video. Probá de nuevo más tarde.',
} as const

// Teclas del player: no cuando se escribe, ni sobre la barra de tiempo (tiene sus flechas).
function ownKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return true
  return el.getAttribute?.('role') === 'slider'
}

export default function StudentPlayer({ data, onBack }: { data: StudentVideoData; onBack: () => void }) {
  const T = PLAYER_TEXTS
  const vidRef = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  const scriptRef = useRef<HTMLOListElement>(null)
  const draggingRef = useRef(false)
  const stopAtRef = useRef<number | null>(null) // "Repetir": dónde frenar (fin de la frase)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(data.durationSec ?? 0)
  const [volume, setVolume] = useState(1)
  const [sub, setSub] = useState('')
  const [error, setError] = useState(false)
  const [cc, setCc] = useState(true)
  const [slow, setSlow] = useState(false)
  const phrases = data.phrases

  // Subtítulos y tiempo al ritmo del video: un loop de requestAnimationFrame mientras
  // reproduce (timeupdate solo es demasiado grueso para los subtítulos) + una
  // actualización suelta en pausa / stop / fin / salto. "Repetir" frena al final de la frase.
  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    let raf = 0
    const update = () => {
      const stopAt = stopAtRef.current
      if (stopAt != null && v.currentTime >= stopAt) { stopAtRef.current = null; v.pause() }
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
    v.addEventListener('timeupdate', update)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('error', onError)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onStop)
      v.removeEventListener('ended', onStop)
      v.removeEventListener('seeked', update)
      v.removeEventListener('timeupdate', update)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('error', onError)
    }
  }, [data])

  const togglePlay = useCallback(() => {
    const v = vidRef.current
    if (!v) return
    stopAtRef.current = null
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  // Stop = pausa y vuelve al principio.
  function stop() {
    const v = vidRef.current
    if (!v) return
    stopAtRef.current = null
    v.pause()
    v.currentTime = 0
    setTime(0)
    setSub(phraseAt(data.phrases, 0, data.delay))
  }

  // Ir a un momento del video (barra de tiempo). Sigue reproduciendo si estaba en play.
  function seekTo(t: number) {
    const v = vidRef.current
    if (!v) return
    stopAtRef.current = null
    v.currentTime = t
    setTime(t)
    setSub(phraseAt(data.phrases, t, data.delay))
  }

  // Ir a una frase y escucharla. `once`: frenar al terminarla (Repetir).
  const goPhrase = useCallback((i: number | null, once = false) => {
    const v = vidRef.current
    const p = i == null ? null : data.phrases[i]
    if (!v || !p) return
    const t = phraseStartAt(p, data.delay)
    v.currentTime = t
    setTime(t)
    setSub(phraseAt(data.phrases, t, data.delay))
    stopAtRef.current = once ? phraseEndAt(p, data.delay) : null
    if (v.paused) v.play().catch(() => {})
  }, [data])

  const go = useCallback((action: 'prev' | 'repeat' | 'next') => {
    const v = vidRef.current
    if (!v) return
    goPhrase(phraseTarget(data.phrases, v.currentTime, data.delay, action), action === 'repeat')
  }, [data, goPhrase])

  // Teclado: ← / → frase anterior / siguiente, ↓ repetir, espacio play/pausa.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || ownKeys(e.target)) return
      const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON'
      if (e.key === 'ArrowLeft') { e.preventDefault(); go('prev') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go('next') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); go('repeat') }
      else if (e.key === ' ' && !onButton) { e.preventDefault(); togglePlay() } // sobre un botón, el espacio lo aprieta
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, togglePlay])

  function seekFromPointer(clientX: number) {
    const r = seekRef.current?.getBoundingClientRect()
    if (!r) return
    const t = timeAtX(clientX, r.left, r.width, duration)
    if (t != null) seekTo(t)
  }

  function onSeekDown(e: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId) // el arrastre sigue aunque el dedo salga de la barra
    seekFromPointer(e.clientX)
  }
  function onSeekMove(e: PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) seekFromPointer(e.clientX)
  }
  function onSeekUp() {
    draggingRef.current = false
  }
  function onSeekKey(e: KeyboardEvent<HTMLDivElement>) {
    const v = vidRef.current
    if (!v || !(duration > 0)) return
    let t: number | null = null
    if (e.key === 'ArrowRight') t = stepSeek(v.currentTime, 1, duration)
    else if (e.key === 'ArrowLeft') t = stepSeek(v.currentTime, -1, duration)
    else if (e.key === 'Home') t = 0
    else if (e.key === 'End') t = duration
    if (t == null) return
    e.preventDefault()
    seekTo(t)
  }

  function changeVolume(dir: 1 | -1) {
    const next = stepVolume(volume, dir)
    setVolume(next)
    if (vidRef.current) vidRef.current.volume = next
  }

  function toggleSlow() {
    const next = !slow
    setSlow(next)
    if (vidRef.current) vidRef.current.playbackRate = next ? SLOW_RATE : 1
  }

  const cur = phraseIndexAt(phrases, time, data.delay)       // la que suena (amarillo)
  const started = lastStartedIndex(phrases, time, data.delay) // para "Frase 3 de 6"
  const curPhrase = cur >= 0 ? phrases[cur] : null

  // El guion acompaña: la frase que suena queda a la vista.
  useEffect(() => {
    if (cur < 0) return
    const el = scriptRef.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [cur])

  const pct = progressPct(time, duration)
  const barsOn = volumeBarsOn(volume)
  const noPhrases = phrases.length === 0
  const mark = curPhrase && duration > 0
    ? { left: progressPct(phraseStartAt(curPhrase, data.delay), duration), right: progressPct(phraseEndAt(curPhrase, data.delay), duration) }
    : null

  return (
    <div className={styles.player}>
      <header className={styles.pBar}>
        <button type="button" className={styles.back} onClick={onBack}>{T.back}</button>
        <span className={styles.pTitle}>{displayVideoName(data.originalName)}</span>
      </header>

      <div className={styles.pMain}>
        <div className={styles.pLeft}>
          <div className={styles.pStage}>
            <video ref={vidRef} src={data.storageUrl} className={styles.video} playsInline preload="metadata" />
            {cc && sub && (
              <div className={styles.subOverlay}>
                <div className={styles.subBox} data-testid="student-sub">{hl(sub)}</div>
              </div>
            )}
            {error && <div role="alert" className={styles.pError}>{T.videoError}</div>}
          </div>

          <div className={styles.timeRow}>
            <span>{fmtTime(time)}</span>
            <div ref={seekRef} className={styles.seek} role="slider" tabIndex={0} aria-label={T.time}
              aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
              aria-valuetext={T.timeOf(fmtTime(time), fmtTime(duration))}
              onPointerDown={onSeekDown} onPointerMove={onSeekMove} onPointerUp={onSeekUp} onPointerCancel={onSeekUp}
              onKeyDown={onSeekKey}>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: pct + '%' }} />
                {mark && <div className={styles.trackNow} style={{ left: mark.left + '%', width: Math.max(0.6, mark.right - mark.left) + '%' }} data-testid="track-now" />}
                <div className={styles.knob} style={{ left: pct + '%' }} />
              </div>
            </div>
            <span>{fmtTime(duration)}</span>
          </div>

          <div className={styles.ctrls}>
            <div className={`${styles.grp} ${styles.grpMain}`}>
              <button type="button" className={styles.cBtn} onClick={() => go('prev')} disabled={noPhrases} aria-label={T.prev}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="2.5" height="14" rx="1" fill="currentColor" /><polygon points="19 5 9 12 19 19 19 5" fill="currentColor" /></svg>
              </button>
              <span className={styles.lbl} aria-hidden="true">{T.prevLbl}</span>
            </div>

            <div className={`${styles.grp} ${styles.grpMain}`}>
              <button type="button" className={styles.cBtn} onClick={() => go('repeat')} disabled={noPhrases} aria-label={T.repeat}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><polyline points="4 4 4 9 9 9" /></svg>
              </button>
              <span className={styles.lbl} aria-hidden="true">{T.repeatLbl}</span>
            </div>

            <div className={`${styles.grp} ${styles.grpMain}`}>
              <button type="button" className={`${styles.cBtn} ${styles.playBtn}`} onClick={togglePlay}
                aria-label={playing ? T.pause : T.play}>
                {playing
                  ? <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></svg>
                  : <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4" fill="currentColor" /></svg>}
              </button>
              <span className={styles.lbl} aria-hidden="true">{playing ? T.pause : T.play}</span>
            </div>

            <div className={`${styles.grp} ${styles.grpMain}`}>
              <button type="button" className={styles.cBtn} onClick={() => go('next')} disabled={noPhrases} aria-label={T.next}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><polygon points="5 5 15 12 5 19 5 5" fill="currentColor" /><rect x="16.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" /></svg>
              </button>
              <span className={styles.lbl} aria-hidden="true">{T.nextLbl}</span>
            </div>
            <span className={styles.brk} aria-hidden="true" />{/* celular: lo de practicar arriba, el resto abajo */}

            <div className={styles.grp}>
              <button type="button" className={styles.cBtn} onClick={stop} aria-label={T.stop}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
              </button>
              <span className={styles.lbl} aria-hidden="true">{T.stop}</span>
            </div>

            <span className={styles.sep} aria-hidden="true" />

            <div className={`${styles.grp} ${styles.volGrp}`}>
              <div className={styles.vol}>
                <button type="button" className={styles.volBtn} onClick={() => changeVolume(-1)}
                  disabled={volume <= 0} aria-label={T.volDown}>−</button>
                <div className={styles.meter} role="meter" aria-label={T.volume}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume * 100)}>
                  {Array.from({ length: VOLUME_BARS }, (_, i) => (
                    <i key={i} className={`${styles.bar} ${i < barsOn ? styles.barOn : ''}`} style={{ height: 6 + i * 2.7 }} />
                  ))}
                </div>
                <button type="button" className={styles.volBtn} onClick={() => changeVolume(1)}
                  disabled={volume >= 1} aria-label={T.volUp}>+</button>
              </div>
              <span className={styles.lbl} aria-hidden="true">{T.volume}</span>
            </div>

            <span className={styles.sep} aria-hidden="true" />

            <div className={styles.grp}>
              <button type="button" className={`${styles.cBtn} ${styles.ccBtn} ${slow ? styles.ccOn : ''}`}
                onClick={toggleSlow} aria-pressed={slow} aria-label={T.slow}>{T.slowBtn}</button>
              <span className={styles.lbl} aria-hidden="true">{T.slowLbl}</span>
            </div>

            <div className={styles.grp}>
              <button type="button" className={`${styles.cBtn} ${styles.ccBtn} ${cc ? styles.ccOn : ''}`}
                onClick={() => setCc((on) => !on)} aria-pressed={cc} aria-label={T.cc}>CC</button>
              <span className={styles.lbl} aria-hidden="true">{cc ? T.ccOn : T.ccOff}</span>
            </div>
          </div>
        </div>

        <aside className={styles.script} aria-label={T.script}>
          <div className={styles.scriptHead}>
            <h2 className={styles.scriptTitle}>{T.script}</h2>
            {!noPhrases && (
              <span className={styles.scriptCount}>
                {started >= 0 ? T.phraseOf(started + 1, phrases.length) : T.phrases(phrases.length)}
              </span>
            )}
          </div>
          {noPhrases
            ? <p className={styles.scriptEmpty}>{T.noScript}</p>
            : (
              <ol ref={scriptRef} className={styles.scriptList}>
                {phrases.map((p, i) => (
                  <li key={i}>
                    <button type="button" data-i={i} data-testid="script-phrase"
                      className={`${styles.phr} ${i === cur ? styles.phrNow : ''}`}
                      aria-current={i === cur ? 'true' : undefined} onClick={() => goPhrase(i)}>
                      <span className={styles.phrAt}>{fmtTime(phraseStartAt(p, data.delay))}</span>
                      <span className={styles.phrText}>{p.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          {!noPhrases && <p className={styles.scriptKeys}>{T.keys}</p>}
        </aside>
      </div>
    </div>
  )
}
