'use client'
// "Sonido" (P2 + P3) — ajustes rápidos (Original / Voces claras / Voces muy claras),
// "Filtro de voz" (IA gratis, aparte: se combina con cualquier ajuste) y "Ajuste
// manual" con 3 barras: Graves / Medios (voz) / Agudos. Todo en el navegador
// (lib/voiceBoost.ts, con limitador para que nada sature) y se RECUERDA en este
// navegador para el próximo video.
// Con el stage abierto el audio sale de ESA ventana: el ajuste se le manda al stage
// (lib/voiceBoostStage.ts, que sigue vivo aunque esta sección se desmonte al pasar a
// Ejercicios), y el stage contesta si pudo aplicarlo.
import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react'
import styles from './VoiceBoostControl.module.css'
import { sharedVoiceBoostStageLink } from '@/lib/voiceBoostStage'
import {
  sharedVoiceBoost, saveEq, presetOf, clampEq, isOff,
  EQ_PRESETS, EQ_PRESET_ORDER, EQ_MIN_DB, EQ_MAX_DB,
  type EqPreset, type EqSetting, type VoiceBoostStatus,
} from '@/lib/voiceBoost'

export const SOUND_TEXTS = {
  title: 'Sonido',
  presets: { original: 'Original', clear: 'Voces claras', veryClear: 'Voces muy claras' } satisfies Record<EqPreset, string>,
  custom: 'Personalizado',
  denoise: 'Filtro de voz',
  denoiseTag: 'IA',
  denoiseDesc: 'Baja la música y los ruidos que no son voz',
  withDenoise: ' + filtro',
  denoiseUnavailable: 'El filtro de voz no está disponible en este navegador; el resto del sonido sí se aplica.',
  manual: 'Ajuste manual',
  bands: [
    { key: 'low', name: 'Graves', hint: 'música, golpes' },
    { key: 'mid', name: 'Medios', hint: 'la voz' },
    { key: 'high', name: 'Agudos', hint: 'platillos, siseo' },
  ] as const,
  limiter: 'Sin saturar (limitador)',
  reset: 'Volver a Original',
  unavailable: 'El navegador no dejó activarlo. Probá elegirlo de nuevo.',
  stageUnavailable: 'Hacé un clic en la ventana del stage para activarlo.',
} as const

// "−10 dB", "+3 dB", "0 dB" (signo menos tipográfico).
export function fmtDb(db: number): string {
  return (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db) + ' dB'
}
// Posición en % de un valor dentro de la barra [EQ_MIN_DB, EQ_MAX_DB].
const pos = (db: number) => ((db - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100

type Props = { videoRef: RefObject<HTMLVideoElement | null>; stageOpen: boolean }

export default function VoiceBoostControl({ videoRef, stageOpen }: Props) {
  const vb = sharedVoiceBoost()
  const [eq, setEq] = useState<EqSetting>(() => vb.eq)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<VoiceBoostStatus>('off')
  const [stageStatus, setStageStatus] = useState<VoiceBoostStatus>('off')
  const seqRef = useRef(0) // solo cuenta la respuesta del último cambio
  const eqId = useId()

  // El <video> del panel: si hay ajuste (elegido o recordado), se engancha.
  useEffect(() => {
    let alive = true
    vb.attach(videoRef.current).then(s => { if (alive) setStatus(s) })
    return () => { alive = false; vb.attach(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ajuste recordado: el navegador no deja arrancar el audio sin un gesto, así que se
  // aplica con el primer clic o tecla (p. ej. el play) en cualquier parte de la página.
  useEffect(() => {
    if (status !== 'pending') return
    const onGesture = () => { apply(vb.eq) }
    window.addEventListener('pointerdown', onGesture, { capture: true, once: true })
    window.addEventListener('keydown', onGesture, { capture: true, once: true })
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true })
      window.removeEventListener('keydown', onGesture, { capture: true })
    }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que contestó el stage (el enlace se crea acá, en el navegador, no en el server).
  useEffect(() => {
    const link = sharedVoiceBoostStageLink()
    setStageStatus(link.stageStatus)
    return link.subscribe(setStageStatus)
  }, [])

  function apply(next: EqSetting) {
    const seq = ++seqRef.current
    vb.set(next).then(s => { if (seq === seqRef.current) setStatus(s) }) // dentro del gesto
  }

  function change(next: EqSetting) {
    const e = clampEq(next)
    setEq(e)
    apply(e)
    sharedVoiceBoostStageLink().send(e)
    saveEq(e)
  }

  // Los ajustes rápidos cambian las bandas; el filtro de voz queda como estaba.
  function choose(p: EqPreset) {
    change({ ...EQ_PRESETS[p], denoise: eq.denoise })
    setOpen(false) // elegido un ajuste rápido, el manual se cierra (deja lugar a la lista)
  }

  const preset = presetOf(eq)
  const stateLabel = (preset ? SOUND_TEXTS.presets[preset] : SOUND_TEXTS.custom) + (eq.denoise ? SOUND_TEXTS.withDenoise : '')
  const on = !isOff(eq)
  const shown = stageOpen ? stageStatus : status
  const hint =
    !on ? null
    : shown === 'partial' ? SOUND_TEXTS.denoiseUnavailable
    : shown === 'unavailable' ? (stageOpen ? SOUND_TEXTS.stageUnavailable : SOUND_TEXTS.unavailable)
    : null

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <span className={styles.title}>{SOUND_TEXTS.title}</span>
        <span className={`${styles.state} ${on ? styles.stateOn : ''}`} data-testid="sound-state">{stateLabel}</span>
      </div>

      <div className={styles.presets} role="group" aria-label={SOUND_TEXTS.title}>
        {EQ_PRESET_ORDER.map(p => (
          <button key={p} type="button" aria-pressed={preset === p}
            className={`${styles.preset} ${preset === p ? styles.presetOn : ''}`}
            onClick={() => choose(p)}>
            {SOUND_TEXTS.presets[p]}
          </button>
        ))}
      </div>

      <button type="button" role="switch" aria-checked={eq.denoise}
        className={`${styles.denoise} ${eq.denoise ? styles.denoiseOn : ''}`}
        onClick={() => change({ ...eq, denoise: !eq.denoise })}>
        <span className={styles.dnText}>
          <span className={styles.dnTitle}>{SOUND_TEXTS.denoise}<em>{SOUND_TEXTS.denoiseTag}</em></span>
          <span className={styles.dnDesc}>{SOUND_TEXTS.denoiseDesc}</span>
        </span>
        <span className={styles.switch} aria-hidden="true"><i /></span>
      </button>

      <button type="button" className={`${styles.manualTog} ${open ? styles.manualOpen : ''}`}
        aria-expanded={open} aria-controls={eqId} onClick={() => setOpen(o => !o)}>
        <span className={styles.caret} aria-hidden="true">▶</span>{SOUND_TEXTS.manual}
      </button>

      {open && (
        <div id={eqId} className={styles.eq}>
          {SOUND_TEXTS.bands.map((b, i) => {
            const v = eq[b.key]
            const lo = Math.min(pos(v), pos(0)), hi = Math.max(pos(v), pos(0))
            const sign = v > 0 ? styles.up : v < 0 ? styles.down : ''
            return (
              <div key={b.key} className={styles.band}>
                <div className={styles.bTop}>
                  <label htmlFor={`${eqId}-${b.key}`} className={styles.bName}>{b.name}<small>{b.hint}</small></label>
                  <span className={`${styles.bVal} ${sign}`}>{fmtDb(v)}</span>
                </div>
                <input id={`${eqId}-${b.key}`} type="range" className={`${styles.range} ${sign}`}
                  min={EQ_MIN_DB} max={EQ_MAX_DB} step={1} value={v}
                  aria-valuetext={fmtDb(v)}
                  style={{ '--lo': lo + '%', '--hi': hi + '%', '--zero': pos(0) + '%' } as CSSProperties}
                  onChange={e => change({ ...eq, [b.key]: +e.target.value })} />
                {i === SOUND_TEXTS.bands.length - 1 && (
                  <div className={styles.scale} aria-hidden="true">
                    <span style={{ left: '0%' }}>−24</span><span style={{ left: pos(0) + '%' }}>0</span><span style={{ left: '100%' }}>+12</span>
                  </div>
                )}
              </div>
            )
          })}
          <div className={styles.foot}>
            <span className={styles.lim}><i aria-hidden="true" />{SOUND_TEXTS.limiter}</span>
            <button type="button" className={styles.reset} onClick={() => choose('original')}>{SOUND_TEXTS.reset}</button>
          </div>
        </div>
      )}

      {hint && <div role="status" className={styles.hint}>{hint}</div>}
    </div>
  )
}
