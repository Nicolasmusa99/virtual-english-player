'use client'
// Editar el subtítulo tocándolo en el video (player del profe, 2026-11). El TEXTO se escribe
// en el mismo subtítulo, sobre el video (page.tsx); este panel va DEBAJO del video (fuera de
// #ve-stage-wrap: el alumno en Zoom no lo ve) y tiene lo fino:
//   · inicio y final al milisegundo: escribirlos, correrlos de a 0,1 / 0,01 s, tomarlos del
//     video ("Usar el video") o ver ese cuadro ("Ver");
//   · mover el video de a 0,1 / 0,01 s para encontrar el punto justo;
//   · escuchar la frase, o hasta / desde el corte;
//   · DIVIDIR la frase: el texto corta donde está el cursor y el tiempo, en la milésima que
//     se elija (arranca en proporción al texto).
// Lleva KB_IGNORE_ATTR: con el foco acá, espacio y flechas no mueven el video.
import { useEffect, useRef, useState } from 'react'
import styles from './CaptionEditor.module.css'
import { KB_IGNORE_ATTR } from '@/lib/shortcuts'
import {
  draftCaptionError, fmtPrecise, nudgeTime, parsePrecise, phraseToVideoTime, proposedCut, splitCaption, splitText,
  videoToPhraseTime, type CaptionDraft,
} from '@/lib/captionEdit'

export const CAPTION_TEXTS = {
  title: 'Editar el subtítulo',
  of: (i: number, n: number) => `Frase ${i} de ${n}`,
  hint: 'Escribí arriba, sobre el video. Enter guarda y Escape cancela.',
  save: 'Guardar', cancel: 'Cancelar',
  listen: 'Escuchar la frase',
  videoAt: 'El video está en',
  moveVideo: 'Mover el video',
  start: 'Empieza', end: 'Termina', cut: 'Corta en',
  useVideo: 'Usar el video', show: 'Ver',
  split: 'Dividir la frase',
  splitHint: 'Poné el cursor en el texto de arriba donde querés cortar.',
  before: 'Primera parte', after: 'Segunda parte',
  listenBefore: 'Escuchar hasta el corte', listenAfter: 'Escuchar desde el corte',
  doSplit: 'Dividir acá',
  badTime: 'Escribilo así: 1:05,250',
} as const

const STEPS = [-0.1, -0.01, 0.01, 0.1] as const
const stepLabel = (d: number) => `${d > 0 ? '+' : '−'}${String(Math.abs(d)).replace('.', ',')}`
const stepName = (d: number) => `${String(Math.abs(d)).replace('.', ',')} segundos ${d > 0 ? 'después' : 'antes'}`

function TimeField({ label, value, onChange, onUseVideo, onShow }: {
  label: string; value: number; onChange: (v: number) => void; onUseVideo: () => void; onShow: () => void
}) {
  const [text, setText] = useState(fmtPrecise(value))
  const [bad, setBad] = useState(false)
  useEffect(() => { setText(fmtPrecise(value)); setBad(false) }, [value])
  const commit = () => {
    const v = parsePrecise(text)
    if (v === null) { setBad(true); return }
    setBad(false)
    if (v !== value) onChange(v)
  }
  return (
    <div className={styles.tf}>
      <span className={styles.tfLbl}>{label}</span>
      <div className={styles.tfRow}>
        {STEPS.slice(0, 2).map((d) => (
          <button key={d} type="button" className={styles.step} onClick={() => onChange(nudgeTime(value, d))} aria-label={`${label}: ${stepName(d)}`}>{stepLabel(d)}</button>
        ))}
        <input className={`${styles.time} ${bad ? styles.timeBad : ''}`} value={text} aria-label={label} aria-invalid={bad} spellCheck={false}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
        {STEPS.slice(2).map((d) => (
          <button key={d} type="button" className={styles.step} onClick={() => onChange(nudgeTime(value, d))} aria-label={`${label}: ${stepName(d)}`}>{stepLabel(d)}</button>
        ))}
        <button type="button" className={styles.txt} onClick={onUseVideo} aria-label={`${label}: usar el momento del video`}>{CAPTION_TEXTS.useVideo}</button>
        <button type="button" className={styles.txt} onClick={onShow} aria-label={`${label}: ver ese momento`}>{CAPTION_TEXTS.show}</button>
      </div>
      {bad && <span className={styles.err}>{CAPTION_TEXTS.badTime}</span>}
    </div>
  )
}

export default function CaptionEditor({ index, total, draft, caret, cut, delay, video, onDraft, onCut, onSave, onCancel, onSplit }: {
  index: number
  total: number
  draft: CaptionDraft
  /** Dónde está el cursor en el texto (para dividir). */
  caret: number
  /** El corte elegido; null = el que propone el cursor. */
  cut: number | null
  delay: number
  video: () => HTMLVideoElement | null
  onDraft: (d: CaptionDraft) => void
  onCut: (c: number | null) => void
  onSave: () => void
  onCancel: () => void
  onSplit: (parts: [CaptionDraft, CaptionDraft]) => void
}) {
  const T = CAPTION_TEXTS
  const [error, setError] = useState('')
  const [videoAt, setVideoAt] = useState(0)
  const stopRef = useRef<number | null>(null) // "Escuchar": hasta dónde (tiempo del video)
  const videoRef = useRef(video)
  videoRef.current = video
  const delayRef = useRef(delay)
  delayRef.current = delay

  // Dónde está el video (al milisegundo, en tiempo de la frase), en vivo; y el freno de "Escuchar".
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const v = videoRef.current()
      if (v) {
        const at = videoToPhraseTime(v.currentTime, delayRef.current)
        setVideoAt((prev) => (prev === at ? prev : at))
        if (stopRef.current !== null && v.currentTime >= stopRef.current) { v.pause(); stopRef.current = null }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const seek = (t: number) => {
    const v = video(); if (!v) return
    stopRef.current = null
    v.pause()
    v.currentTime = phraseToVideoTime(t, delay)
    setVideoAt(round(t))
  }
  const play = (from: number, to: number) => {
    const v = video(); if (!v) return
    v.currentTime = phraseToVideoTime(from, delay)
    stopRef.current = phraseToVideoTime(to, delay)
    v.play()?.catch?.(() => {})
  }
  const round = (t: number) => Math.round(t * 1000) / 1000
  const nowT = () => { const v = video(); return v ? videoToPhraseTime(v.currentTime, delay) : videoAt }

  const set = (p: Partial<CaptionDraft>) => { setError(''); onDraft({ ...draft, ...p }) }
  const cutAt = cut ?? proposedCut(draft, caret)
  const [before, after] = splitText(draft.text, caret)

  function save() {
    const e = draftCaptionError(draft)
    if (e) { setError(e); return }
    onSave()
  }
  function split() {
    const out = splitCaption(draft, caret, cutAt)
    if (typeof out === 'string') { setError(out); return }
    onSplit(out)
  }

  return (
    <section className={styles.ed} aria-label={T.title} data-testid="caption-editor" {...{ [KB_IGNORE_ATTR]: '' }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <div className={styles.head}>
        <h3 className={styles.title}>{T.title}<span className={styles.of}>{T.of(index + 1, total)}</span></h3>
        <button type="button" className={styles.btn} onClick={() => play(draft.start, draft.end)}>{T.listen}</button>
        <button type="button" className={styles.btn} onClick={onCancel}>{T.cancel}</button>
        <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={save}>{T.save}</button>
      </div>
      <p className={styles.hint}>{T.hint}</p>
      {error && <div className={styles.errBox} role="alert">{error}</div>}

      <div className={styles.grid}>
        <TimeField label={T.start} value={draft.start} onChange={(v) => set({ start: v })} onUseVideo={() => set({ start: nowT() })} onShow={() => seek(draft.start)} />
        <TimeField label={T.end} value={draft.end} onChange={(v) => set({ end: v })} onUseVideo={() => set({ end: nowT() })} onShow={() => seek(draft.end)} />
        <div className={styles.tf}>
          <span className={styles.tfLbl}>{T.moveVideo}</span>
          <div className={styles.tfRow}>
            {STEPS.map((d) => (
              <button key={d} type="button" className={styles.step} onClick={() => seek(nudgeTime(nowT(), d))} aria-label={`${T.moveVideo}: ${stepName(d)}`}>{stepLabel(d)}</button>
            ))}
            <span className={styles.now} aria-live="off">{T.videoAt} <b data-testid="video-at">{fmtPrecise(videoAt)}</b></span>
          </div>
        </div>
      </div>

      <div className={styles.split}>
        <div className={styles.splitTop}>
          <h4 className={styles.splitTitle}>{T.split}</h4>
          {before && after ? (
            <div className={styles.parts}>
              <span><b>{T.before}:</b> {before}</span>
              <span><b>{T.after}:</b> {after}</span>
            </div>
          ) : <p className={styles.hint} style={{ margin: 0 }}>{T.splitHint}</p>}
          <TimeField label={T.cut} value={cutAt} onChange={(v) => { setError(''); onCut(v) }} onUseVideo={() => { setError(''); onCut(nowT()) }} onShow={() => seek(cutAt)} />
        </div>
        <div className={styles.splitBtns}>
          <button type="button" className={styles.btn} onClick={() => play(draft.start, cutAt)}>{T.listenBefore}</button>
          <button type="button" className={styles.btn} onClick={() => play(cutAt, draft.end)}>{T.listenAfter}</button>
          <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={split}>{T.doSplit}</button>
        </div>
      </div>
    </section>
  )
}
