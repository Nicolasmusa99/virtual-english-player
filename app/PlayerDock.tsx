'use client'
// Player del profe (P1) — franja de abajo del video: barra de tiempo + controles.
// Va FUERA de #ve-stage-wrap: el alumno en Zoom no la ve.
// La barra se pinta en cada cuadro leyendo el reloj (readClock) y escribiendo el DOM
// directo, sin re-render de React: avanza fluida y no carga al resto del player.
// Rediseño (fase 3): la frase que suena se marca en amarillo en la barra ("ahora"), y
// "Repetir frase", "Anterior" y "Siguiente" llevan texto, no solo ícono.
// 2026-11: mismo estilo que el player del alumno: la hora a los dos lados de la barra y
// botones redondos con su nombre debajo (el nombre completo sigue en aria-label).
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import styles from './PlayerDock.module.css'
import { fmtTime, type Phrase } from '@/lib/srt'
import { timeAtX } from '@/lib/studentView'
import { phraseIndexAt, phraseSegments, selNumber, SEEK_THROTTLE_MS } from '@/lib/playerTimeline'

export const DOCK_TEXTS = {
  timeline: 'Tiempo del video',
  timeOf: (cur: string, tot: string) => `${cur} de ${tot}`,
  back10: 'Retroceder 10 segundos',
  fwd10: 'Adelantar 10 segundos',
  prev: 'Frase anterior (←)',
  next: 'Frase siguiente (→)',
  play: 'Reproducir (espacio)',
  pause: 'Pausar (espacio)',
  volume: 'Volumen',
  speed: 'Velocidad',
  cc: 'Subtítulos',
  repeat: 'Repetir frase (↓)',
  repeatShort: 'Repetir', prevShort: 'Anterior', nextShort: 'Siguiente',
  back10Short: '−10 s', fwd10Short: '+10 s', playShort: 'Play', pauseShort: 'Pausa', speedShort: 'Velocidad',
  ccOn: 'Subtítulos: sí', ccOff: 'Subtítulos: no',
  sel: (n: number) => `elegida ${n}`,
} as const

export type DockClock = { t: number; d: number; playing: boolean }

type Props = {
  phrases: Phrase[]
  delay: number
  hideTexts: boolean
  isPlaying: boolean
  bufPct: number
  speeds: number[]
  speedIdx: number
  vol: number
  ccOn: boolean
  /** La frase que está sonando (se marca en amarillo en la barra). */
  curIdx?: number
  readClock: () => DockClock          // se llama en cada cuadro
  onSeek: (t: number) => void
  onJump: (idx: number) => void
  onTogglePlay: () => void
  onSkip: (s: number) => void
  onPrev: () => void
  onNext: () => void
  onSpeed: (idx: number) => void
  onVol: (v: number) => void
  onToggleCc: () => void
  onRepeat?: () => void
}

export default function PlayerDock(p: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const curRef = useRef<HTMLSpanElement>(null)
  const totRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef(p.readClock)
  clockRef.current = p.readClock
  const dragRef = useRef<number | null>(null)      // segundo donde está la bolita mientras se arrastra
  const lastSeekRef = useRef(0)
  const [dur, setDur] = useState(0)
  const durRef = useRef(0)
  const [hover, setHover] = useState<number | null>(null) // segundo bajo el mouse
  const [dragging, setDragging] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const speedRef = useRef<HTMLDivElement>(null)

  // Pintar la barra en cada cuadro.
  useEffect(() => {
    let raf = 0
    let lastNow = -1
    const paint = () => {
      const c = clockRef.current()
      const d = c.d > 0 ? c.d : 0
      if (d !== durRef.current) { durRef.current = d; setDur(d) }
      const t = dragRef.current ?? c.t
      const pct = d > 0 ? Math.min(100, Math.max(0, (t / d) * 100)) : 0
      if (fillRef.current) fillRef.current.style.width = pct + '%'
      if (thumbRef.current) thumbRef.current.style.left = pct + '%'
      const now = Math.floor(t)
      if (now !== lastNow) {
        lastNow = now
        if (curRef.current) curRef.current.textContent = fmtTime(t)
        const tr = trackRef.current
        if (tr) {
          tr.setAttribute('aria-valuenow', String(now))
          tr.setAttribute('aria-valuetext', DOCK_TEXTS.timeOf(fmtTime(t), fmtTime(d)))
        }
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => { if (totRef.current) totRef.current.textContent = fmtTime(dur) }, [dur])

  // El menú de velocidad se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!speedOpen) return
    const onDown = (e: Event) => { if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSpeedOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [speedOpen])

  function timeAt(clientX: number): number | null {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return null
    return timeAtX(clientX, r.left, r.width, durRef.current || clockRef.current().d)
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== undefined && e.button > 0) return
    const t = timeAt(e.clientX); if (t == null) return
    e.currentTarget.setPointerCapture?.(e.pointerId) // el arrastre sigue aunque el mouse salga de la barra
    dragRef.current = t
    setDragging(true)
    setHover(t)
    lastSeekRef.current = performance.now()
    p.onSeek(t)
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const t = timeAt(e.clientX); if (t == null) return
    setHover(t)
    if (dragRef.current == null) return
    dragRef.current = t
    const now = performance.now()
    if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) { lastSeekRef.current = now; p.onSeek(t) }
  }
  function onUp() {
    const t = dragRef.current
    if (t == null) return
    dragRef.current = null
    setDragging(false)
    p.onSeek(t) // el último lugar, siempre
  }

  const segs = phraseSegments(p.phrases, dur)
  const hIdx = hover == null ? -1 : phraseIndexAt(p.phrases, hover, p.delay)
  const hSel = hIdx >= 0 ? selNumber(p.phrases, hIdx) : null
  const hPct = hover != null && dur > 0 ? (hover / dur) * 100 : 0

  // Un control: el botón redondo y su nombre debajo (como en el player del alumno).
  const grp = (btn: ReactNode, label: string, extra = '') => (
    <div className={`${styles.grp} ${extra}`}>{btn}<span className={styles.lbl} aria-hidden="true">{label}</span></div>
  )

  return (
    <div className={styles.dock}>
      <div className={styles.timeRow}>
      <span ref={curRef} className={styles.time}>0:00</span>
      <div ref={trackRef} data-testid="prog-track"
        className={`${styles.tl} ${hover != null ? styles.tlHover : ''} ${dragging ? styles.tlDrag : ''}`}
        role="slider" aria-label={DOCK_TEXTS.timeline} aria-valuemin={0} aria-valuemax={Math.round(dur)}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={() => { if (dragRef.current == null) setHover(null) }}>
        <div className={styles.track}>
          <div className={styles.buf} style={{ width: p.bufPct + '%' }} />
          {segs.map(s => (
            <div key={s.idx} className={`${styles.seg} ${s.sel ? styles.segSel : ''} ${s.idx === p.curIdx ? styles.segCur : ''}`}
              data-cur={s.idx === p.curIdx || undefined} style={{ left: s.left + '%', width: s.width + '%' }} />
          ))}
          <div ref={fillRef} className={styles.fill} />
          {segs.map(s => (
            <div key={s.idx} data-phrase-idx={s.idx}
              className={`${styles.tick} ${s.sel ? styles.tickSel : ''}`} style={{ left: s.left + '%' }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); p.onJump(s.idx) }} />
          ))}
          {hover != null && !dragging && <div className={styles.ghost} style={{ left: hPct + '%' }} />}
          <div ref={thumbRef} className={styles.thumb} />
        </div>
        {hover != null && (
          <div className={styles.tip} style={{ left: `clamp(90px, ${hPct}%, calc(100% - 90px))` }} data-testid="dock-tip">
            <b>{fmtTime(hover)}</b>
            {hIdx >= 0 && !p.hideTexts && <span className={styles.tipTx}>“{p.phrases[hIdx].text}”</span>}
            {hSel != null && <em>{DOCK_TEXTS.sel(hSel)}</em>}
          </div>
        )}
      </div>

      <span ref={totRef} className={`${styles.time} ${styles.tot}`}>0:00</span>
      </div>

      <div className={styles.ctrls}>
        {p.onRepeat && grp(
          <button type="button" className={styles.cb} onClick={p.onRepeat} aria-label={DOCK_TEXTS.repeat} title={DOCK_TEXTS.repeat}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>, DOCK_TEXTS.repeatShort)}
        {grp(
          <button type="button" className={styles.cb} onClick={() => p.onSkip(-10)} aria-label={DOCK_TEXTS.back10} title={DOCK_TEXTS.back10}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M1 4v6h6" /><path d="M3.5 15A9 9 0 1 0 4 8.5" /></svg>
          </button>, DOCK_TEXTS.back10Short, styles.skip)}
        {grp(
          <button type="button" className={styles.cb} onClick={p.onPrev} aria-label={DOCK_TEXTS.prev} title={DOCK_TEXTS.prev}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 20L9 12l10-8v16zM5 4h2v16H5z" /></svg>
          </button>, DOCK_TEXTS.prevShort)}
        {grp(
          <button type="button" className={`${styles.cb} ${styles.play}`} onClick={p.onTogglePlay}
            aria-label={p.isPlaying ? DOCK_TEXTS.pause : DOCK_TEXTS.play} title={p.isPlaying ? DOCK_TEXTS.pause : DOCK_TEXTS.play}>
            {p.isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </button>, p.isPlaying ? DOCK_TEXTS.pauseShort : DOCK_TEXTS.playShort)}
        {grp(
          <button type="button" className={styles.cb} onClick={p.onNext} aria-label={DOCK_TEXTS.next} title={DOCK_TEXTS.next}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 4l10 8-10 8V4zM17 4h2v16h-2z" /></svg>
          </button>, DOCK_TEXTS.nextShort)}
        {grp(
          <button type="button" className={styles.cb} onClick={() => p.onSkip(10)} aria-label={DOCK_TEXTS.fwd10} title={DOCK_TEXTS.fwd10}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M20.5 15A9 9 0 1 1 20 8.5" /></svg>
          </button>, DOCK_TEXTS.fwd10Short, styles.skip)}

        <span className={styles.sep} aria-hidden="true" />

        {grp(
          <div className={styles.vol}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            <div className={styles.vTrack}>
              <div className={styles.vFill} style={{ width: p.vol + '%' }} />
              <div className={styles.vKnob} style={{ left: p.vol + '%' }} />
              <input type="range" className={styles.vRange} min={0} max={100} value={p.vol}
                aria-label={DOCK_TEXTS.volume} onChange={e => p.onVol(+e.target.value)} />
            </div>
          </div>, DOCK_TEXTS.volume)}

        <span className={styles.sep} aria-hidden="true" />

        {grp(
          <div ref={speedRef} className={styles.speedWrap}>
            <button type="button" className={`${styles.cb} ${styles.txtBtn} ${speedOpen ? styles.on : ''}`}
              aria-label={DOCK_TEXTS.speed} aria-haspopup="menu" aria-expanded={speedOpen} title={DOCK_TEXTS.speed}
              onClick={() => setSpeedOpen(o => !o)}>{p.speeds[p.speedIdx]}×</button>
            {speedOpen && (
              <div className={styles.menu} role="menu" aria-label={DOCK_TEXTS.speed}>
                {p.speeds.map((s, i) => (
                  <button type="button" key={s} role="menuitemradio" aria-checked={i === p.speedIdx}
                    className={`${styles.mItem} ${i === p.speedIdx ? styles.mItemAct : ''}`}
                    onClick={() => { p.onSpeed(i); setSpeedOpen(false) }}>
                    {s}×
                  </button>
                ))}
              </div>
            )}
          </div>, DOCK_TEXTS.speedShort)}
        {grp(
          <button type="button" className={`${styles.cb} ${styles.txtBtn} ${p.ccOn ? styles.on : ''}`}
            aria-label={DOCK_TEXTS.cc} aria-pressed={p.ccOn} title={DOCK_TEXTS.cc} onClick={p.onToggleCc}>CC</button>,
          p.ccOn ? DOCK_TEXTS.ccOn : DOCK_TEXTS.ccOff)}
      </div>
    </div>
  )
}
